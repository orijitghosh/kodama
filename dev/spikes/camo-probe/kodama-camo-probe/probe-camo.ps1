<#
  SPIKE-CAMO recorder, PowerShell edition (kodama IMPLEMENTATION 3.1).

  Reads the rendered README of the throwaway repo, extracts the camo URLs
  GitHub rewrote each probe to, then records per probe: served bytes vs source
  bytes, content-type, cache Age header, and whether the tail marker survived
  (truncation check). All fetches are read-only.

  Usage:
    .\probe-camo.ps1                                  # uses the defaults below
    .\probe-camo.ps1 -Owner you -Repo name -Branch main

  Requires: gh (authenticated), PowerShell 7+. Paste the whole output back.
#>
param(
  [string]$Owner  = "orijitghosh",
  [string]$Repo   = "kodama-camo-probe",
  [string]$Branch = "main"
)

$ErrorActionPreference = "Stop"
$raw = "https://raw.githubusercontent.com/$Owner/$Repo/$Branch"

Write-Output "== SPIKE-CAMO $Owner/$Repo@$Branch =="
Write-Output ("date: {0}" -f (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ"))
Write-Output ""

# 1. Rendered README HTML (camo URLs only exist after GitHub renders it).
Write-Output "-- fetching rendered README --"
$html = gh api "repos/$Owner/$Repo/readme" --header "Accept: application/vnd.github.html" | Out-String

# 2. Extract camo URLs, unique, in first-seen order.
$camo = [regex]::Matches($html, 'https://camo\.githubusercontent\.com[^"]+') |
        ForEach-Object { $_.Value } | Select-Object -Unique
Write-Output ("found {0} camo URL(s)" -f $camo.Count)
Write-Output ""

if ($camo.Count -eq 0) {
  Write-Output "!! no camo URLs found - open the repo's README in a browser once to"
  Write-Output "   prime camo, then re-run. (First render triggers the rewrite.)"
  exit 1
}

$fileByProbe = @{
  "probe:css-keyframes"          = "a-css-keyframes.svg"
  "probe:smil"                   = "b-smil.svg"
  "probe:prefers-color-scheme"   = "c-prefers-color-scheme.svg"
  "probe:prefers-reduced-motion" = "d-prefers-reduced-motion.svg"
  "probe:oversized"              = "e-oversized.svg"
  "probe:style-vars"             = "f-style-vars.svg"
}

"{0,-26} {1,10} {2,10} {3,-24} {4,-6} {5}" -f "PROBE","SRC_BYTES","SERVED","CONTENT_TYPE","AGE","TRUNC?"
foreach ($url in $camo) {
  $r      = Invoke-WebRequest -Uri $url -UseBasicParsing
  $body   = $r.Content
  $served = [System.Text.Encoding]::UTF8.GetByteCount($body)
  $ctype  = ($r.Headers['Content-Type'] -join ",")
  $age    = ($r.Headers['Age'] -join ",")

  $m     = [regex]::Match($body, 'probe:[a-z-]+')
  $probe = if ($m.Success) { $m.Value } else { "unknown" }

  $src = "?"
  if ($fileByProbe.ContainsKey($probe)) {
    $s   = Invoke-WebRequest -Uri "$raw/$($fileByProbe[$probe])" -UseBasicParsing
    $src = [System.Text.Encoding]::UTF8.GetByteCount($s.Content)
  }

  $trunc = if ($body -match 'tail-marker:END') { "no" }
           elseif ($probe -eq "probe:oversized") { "YES" }
           else { "n/a" }

  "{0,-26} {1,10} {2,10} {3,-24} {4,-6} {5}" -f $probe,$src,$served,$(if($ctype){$ctype}else{"?"}),$(if($age){$age}else{"?"}),$trunc
}

Write-Output ""
Write-Output "-- raw camo URLs (for the findings file) --"
$camo | ForEach-Object { Write-Output $_ }
