<#
  SPIKE-CAMO residual recorder - camo cache freshness (kodama IMPLEMENTATION
  4.5, D-025). SPIKE-CAMO proved camo forwards bytes verbatim; it read `Age: 0`
  on every probe and so never observed how long camo holds a copy.

  The measurement this makes possible: a kodama badge prints its render date in
  the SVG header, so the origin bytes change every UTC day on their own. This
  script reads the date out of camo's copy and out of the origin's copy and
  reports the gap. Run it once, then again a day later.

  Every fetch is read-only. Nothing is written except the local TSV log.

  Usage:
    .\probe-camo-refresh.ps1                       # uses the defaults below
    .\probe-camo-refresh.ps1 -Owner you -Repo name -User you

  Requires: gh (authenticated), PowerShell 7+. Paste the whole output back.
#>
param(
  [string]$Owner  = "orijitghosh",
  [string]$Repo   = "kodama-camo-refresh",
  [string]$Branch = "main",
  [string]$Log    = "camo-refresh-log.tsv"
)

$ErrorActionPreference = "Stop"
$now = (Get-Date).ToUniversalTime()

Write-Output "== camo refresh probe $Owner/$Repo@$Branch =="
Write-Output ("run at: {0}" -f $now.ToString("yyyy-MM-ddTHH:mm:ssZ"))
Write-Output ""

# --------------------------------------------------------------------------
# 1. The camo URLs. They only exist once GitHub has rendered the README, and
#    they are stable across days: the path hex-encodes the upstream URL, so the
#    same badge keeps the same camo entry and a second run hits the same cache.

$html = gh api "repos/$Owner/$Repo/readme" --header "Accept: application/vnd.github.html" | Out-String
$camo = [regex]::Matches($html, 'https://camo\.githubusercontent\.com[^"]+') |
        ForEach-Object { $_.Value } | Select-Object -Unique

Write-Output ("found {0} camo URL(s)" -f $camo.Count)
if ($camo.Count -eq 0) {
  Write-Output "!! none found - open the repo's README in a browser once to prime"
  Write-Output "   camo, then re-run. The first render triggers the rewrite."
  exit 1
}

# --------------------------------------------------------------------------
# 2. Helpers.

function Get-UpstreamUrl([string]$camoUrl) {
  # camo.githubusercontent.com/<digest>/<hex-of-upstream-url>
  $tail = ($camoUrl -split '/')[-1]
  if ($tail -notmatch '^[0-9a-fA-F]+$' -or ($tail.Length % 2) -ne 0) { return $null }
  try {
    $bytes = for ($i = 0; $i -lt $tail.Length; $i += 2) {
      [Convert]::ToByte($tail.Substring($i, 2), 16)
    }
    return [System.Text.Encoding]::UTF8.GetString([byte[]]$bytes)
  } catch { return $null }
}

function Read-Svg([string]$url) {
  $tmp = [System.IO.Path]::GetTempFileName()
  try {
    $r    = Invoke-WebRequest -Uri $url -OutFile $tmp -PassThru -UseBasicParsing
    $body = [System.IO.File]::ReadAllBytes($tmp)
    $text = [System.Text.Encoding]::UTF8.GetString($body)
    $sha  = [System.BitConverter]::ToString(
              [System.Security.Cryptography.SHA256]::HashData($body)
            ).Replace("-", "").ToLower().Substring(0, 8)
    $m    = [regex]::Match($text, '\d{4}-\d{2}-\d{2}')
    return [pscustomobject]@{
      Bytes  = $body.Length
      Sha    = $sha
      Date   = $(if ($m.Success) { $m.Value } else { "none" })
      Age    = Hdr $r 'Age'
      Cache  = Hdr $r 'Cache-Control'
      ETag   = Hdr $r 'ETag'
      Vercel = Hdr $r 'X-Vercel-Cache'
    }
  } finally { Remove-Item $tmp -Force -ErrorAction SilentlyContinue }
}

function Hdr($resp, [string]$name) {
  $v = $resp.Headers[$name]
  if ($null -eq $v -or $v.Count -eq 0) { return "-" }
  return ($v -join ",")
}

# --------------------------------------------------------------------------
# 3. Record one row per image: camo's copy beside the origin's copy, read back
#    to back so the date comparison is not confounded by a UTC midnight between
#    the two fetches.

$stamp = $now.ToString("yyyy-MM-ddTHH:mm:ssZ")
$rows  = @()

foreach ($url in $camo) {
  $upstream = Get-UpstreamUrl $url
  $label    = if ($upstream) { $upstream -replace '^https?://[^/]+', '' } else { "?" }

  $c = Read-Svg $url
  $o = if ($upstream) { Read-Svg $upstream } else { $null }

  $rows += [pscustomobject]@{
    ts           = $stamp
    image        = $label
    camo_date    = $c.Date
    origin_date  = $(if ($o) { $o.Date } else { "?" })
    lag_days     = $(if ($o -and $c.Date -ne "none" -and $o.Date -ne "none") {
                       [int]([datetime]$o.Date - [datetime]$c.Date).TotalDays
                     } else { "?" })
    camo_age_s   = $c.Age
    camo_bytes   = $c.Bytes
    camo_sha     = $c.Sha
    camo_cache   = $c.Cache
    camo_etag    = $c.ETag
    origin_bytes = $(if ($o) { $o.Bytes } else { "?" })
    origin_sha   = $(if ($o) { $o.Sha } else { "?" })
    origin_cache = $(if ($o) { $o.Cache } else { "?" })
    origin_cdn   = $(if ($o) { $o.Vercel } else { "?" })
    camo_url     = $url
  }
}

# Append rather than overwrite: the whole point is the series, not one reading.
$exists = Test-Path $Log
$rows | Export-Csv -Path $Log -Delimiter "`t" -NoTypeInformation -Append:$exists -Encoding utf8

# --------------------------------------------------------------------------
# 4. Report.

Write-Output ""
Write-Output "-- this run --"
"{0,-34} {1,-12} {2,-12} {3,-5} {4,-9} {5,-9}" -f "IMAGE","CAMO_DATE","ORIGIN_DATE","LAG","CAMO_AGE","CAMO_SHA"
foreach ($r in $rows) {
  "{0,-34} {1,-12} {2,-12} {3,-5} {4,-9} {5,-9}" -f `
    $r.image, $r.camo_date, $r.origin_date, $r.lag_days, $r.camo_age_s, $r.camo_sha
}

Write-Output ""
Write-Output "-- headers as camo and the browser actually see them --"
foreach ($r in $rows) {
  Write-Output ("  {0}" -f $r.image)
  Write-Output ("    origin  {0}   (cdn: {1})" -f $r.origin_cache, $r.origin_cdn)
  Write-Output ("    camo    {0}   etag: {1}" -f $r.camo_cache, $r.camo_etag)
}

Write-Output ""
Write-Output "-- verdict --"
foreach ($r in $rows) {
  if ($r.camo_date -eq $r.origin_date) {
    Write-Output ("  ok   {0}: camo is serving today's render" -f $r.image)
  } elseif ($r.lag_days -eq "?") {
    Write-Output ("  ??   {0}: no date found in one of the copies" -f $r.image)
  } else {
    Write-Output ("  STALE {0}: camo is {1} day(s) behind the origin" -f $r.image, $r.lag_days)
  }
}

Write-Output ""
Write-Output ("log: {0} ({1} row(s) total)" -f (Resolve-Path $Log), (Import-Csv $Log -Delimiter "`t").Count)
Write-Output "Run again tomorrow. One run proves nothing; the gap between runs is the measurement."
