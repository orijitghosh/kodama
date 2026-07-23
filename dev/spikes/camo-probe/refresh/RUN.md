# Camo refresh probe - how to run it (PowerShell)

Closes the SPIKE-CAMO residual (D-025) and the last open item in OPS §4b.

**The question:** a kodama badge is meant to change every day. GitHub serves it
through camo, which caches. If camo holds a copy for a week, the product's core
promise is broken in the only place anyone sees it. How far behind does camo
actually run?

**Why it takes two days and not two commits:** the badge already changes itself.
The SVG prints its render date in the header, so the origin bytes differ every
UTC day whether or not you contributed. Nothing needs editing between runs - the
gap between two runs *is* the measurement.

## 1. Make a standalone repo from these files

From the kodama repo root, in PowerShell:

```powershell
New-Item -ItemType Directory -Force ..\kodama-camo-refresh | Out-Null
Copy-Item dev\spikes\camo-probe\refresh\README.md, `
          dev\spikes\camo-probe\refresh\probe-camo-refresh.ps1 ..\kodama-camo-refresh\
Set-Location ..\kodama-camo-refresh
git init -b main; git add .; git commit -m "camo refresh probe"
```

## 2. Create the public repo and push

The one write to your account. It must be **public** - camo does not proxy
images in a private repo's README the same way, and an unauthenticated render is
what we are measuring.

```powershell
gh repo create kodama-camo-refresh --public --source=. --push
```

If you name it differently, pass `-Repo <name>` to the script in step 4. If your
deployment is not `kodama-sigma.vercel.app`, edit the two image URLs in
`README.md` before pushing.

## 3. Prime camo

Open `https://github.com/<you>/kodama-camo-refresh` in a browser once. GitHub
rewrites the two image URLs to `camo.githubusercontent.com` on first render;
until that happens there is nothing to measure.

## 4. Run it - day 0

```powershell
.\probe-camo-refresh.ps1
```

Expect both rows to read `LAG 0` - camo has just fetched, so its copy and the
origin's agree. That run is the baseline; it proves the plumbing, not the cache.

> Execution-policy hiccup? `powershell -ExecutionPolicy Bypass -File .\probe-camo-refresh.ps1`

## 5. Run it again - day 1, after 00:00 UTC

Same command, same directory. It appends to `camo-refresh-log.tsv` rather than
overwriting, so the series survives. A third run on day 2 is worth it if day 1
comes back `STALE` - one stale reading tells us camo is behind, two tell us
whether it is drifting or just slow.

The line to read is the verdict block:

```
  ok    /orijitghosh.svg: camo is serving today's render
  STALE /orijitghosh.svg: camo is 1 day(s) behind the origin
```

## 6. Record it

Keep the full output of **both** runs and write the finding into
`dev/spikes/SPIKE-CAMO.md` and OPS §4b. If camo turns out to hold longer
than a day, that is a spec change, not a footnote - the refresh cadence in
SPEC-SERVICE §2 would be promising something the delivery path cannot keep.

## 7. Clean up

```powershell
gh repo delete kodama-camo-refresh --yes
```

Keep `camo-refresh-log.tsv` until the finding is recorded.

---

## What the day-0 run already told us

Recorded here because it is a property of the deployment, not of the probe, and
it was visible before the repo existed.

**Vercel rewrites our cache header on the way out.** `route.ts` sets

```
cache-control: public, s-maxage=21600, stale-while-revalidate=86400, max-age=3600
```

and what a client - camo included - actually receives is

```
cache-control: public, max-age=3600
```

Vercel consumes `s-maxage` and `stale-while-revalidate` for its own CDN and
strips them from the downstream response. So the ceiling camo is being asked to
honour is **one hour**, not six, and the six-hour figure in OPS §2 describes the
Vercel edge only. There is also **no `ETag`** on the response, so camo cannot
revalidate cheaply; a refresh is a full re-fetch.

Both facts are good news for freshness and neutral for cost - camo's own request
volume is what it is either way - but they mean a `LAG` above 0 on day 1 would
be camo ignoring an explicit one-hour instruction, which is a much stronger
finding than camo merely outliving a vague one.
