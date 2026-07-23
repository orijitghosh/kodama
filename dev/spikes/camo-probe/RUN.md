# SPIKE-CAMO - how to run it (PowerShell)

All of this is throwaway - delete the repo when done.

Probe files: `README.md`, `a-css-keyframes.svg`, `b-smil.svg`,
`c-prefers-color-scheme.svg`, `d-prefers-reduced-motion.svg`, `e-oversized.svg`,
`f-style-vars.svg`, and the recorder `probe-camo.ps1` (PowerShell) /
`probe-camo.sh` (Git Bash alt).

## 1. Make a standalone repo from these files
From the kodama repo root, in PowerShell:

```powershell
New-Item -ItemType Directory -Force ..\kodama-camo-probe | Out-Null
Copy-Item dev\spikes\camo-probe\*.svg, `
          dev\spikes\camo-probe\README.md, `
          dev\spikes\camo-probe\probe-camo.ps1 ..\kodama-camo-probe\
Set-Location ..\kodama-camo-probe
git init -b main; git add .; git commit -m "camo probe"
```

## 2. Create the public repo on GitHub and push
This is the one write to your account:

```powershell
gh repo create kodama-camo-probe --public --source=. --push
```

If you named it differently, update the URLs in `README.md` first (there is a
find/replace note at the top of that file).

## 3. Eyeball the rendered README
Open `https://github.com/<you>/kodama-camo-probe`. For each probe a-f, note
**yes/no**:

- a: does the orange dot slide? (CSS animation)
- b: does the green dot slide? (SMIL)
- c: does the background flip between light and dark GitHub themes? *(toggle
  theme: top-right avatar → Settings/Appearance, or your OS theme)*
- d: does the amber dot pulse - and **stop** when you turn on OS "reduce
  motion"? *(Windows: Settings → Accessibility → Visual effects → Animation
  effects Off)*
- e: does it render fully, with "tail-marker:END" visible at the bottom?
- f: do the three green dots show up? (`<style>` + CSS vars survived)

Jot the six yes/no answers.

## 4. Record the bytes and headers

```powershell
.\probe-camo.ps1                                 # defaults: orijitghosh/kodama-camo-probe/main
# or: .\probe-camo.ps1 -Owner <you> -Repo <repo> -Branch main
```

If it says "no camo URLs found", reload the README in the browser once (that
first view primes camo), then re-run.

> Execution-policy hiccup? Run it in-process without changing global policy:
> `powershell -ExecutionPolicy Bypass -File .\probe-camo.ps1`

## 5. Record it
Write up the six yes/no render answers from step 3 plus the full
`probe-camo.ps1` output in `dev/spikes/SPIKE-CAMO.md`. If probe **c** failed,
that triggers the D-006 dual-image fallback and a spec amendment.

## 6. Clean up
Delete the throwaway repo once findings are recorded:

```powershell
gh repo delete kodama-camo-probe --yes
```

---

### Git Bash alternative
If you prefer Git Bash over PowerShell, `probe-camo.sh` is the same recorder;
`chmod +x probe-camo.sh` then `./probe-camo.sh`. The step-1 copy in bash:
`cp dev/spikes/camo-probe/*.svg dev/spikes/camo-probe/README.md dev/spikes/camo-probe/probe-camo.sh ../kodama-camo-probe/`
