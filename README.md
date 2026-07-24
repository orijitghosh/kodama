# kodama 🌱

Your GitHub history drawn as a bonsai. Commits grow foliage, merged PRs ripen
into fruit, reviews hang lanterns, streaks blossom. It's one image URL you drop
in your profile README, and it redraws every day from your real numbers.

![a kodama specimen](https://kodama-sigma.vercel.app/specimen/maintainer-ink-summer.svg)

*The maintainer specimen at high summer - the same tree the
[gallery](https://kodama-sigma.vercel.app/gallery) leads with. Yours is drawn
from your own numbers.*

```md
![my kodama](https://kodama-sigma.vercel.app/YOUR_USERNAME.svg)
```

That's the whole install: no account, no config, nothing stored about you. Try
yours at [kodama-sigma.vercel.app](https://kodama-sigma.vercel.app).

### A live tree in the wild

![sindresorhus rendered by kodama](https://kodama-sigma.vercel.app/sindresorhus.svg)

*[@sindresorhus](https://github.com/sindresorhus)'s public GitHub history,
rendered live by the service - a real account, not a fixture. Drawn from public
data only; he isn't affiliated with this project.*

---

## What the tree says

Every element comes from your public GitHub history, and you can trace each one
back to the number behind it. The [grammar
page](https://kodama-sigma.vercel.app/grammar) shows which signal draws which element, and any
tree's [receipts](https://kodama-sigma.vercel.app/tree/YOUR_USERNAME) list the exact counts.

| You did this | The tree shows |
|---|---|
| Account age | Trunk girth and bends; the pot upgrades at 1 / 3 / 6 / 10 years |
| Commits over time | Foliage pads - the tree only ever grows |
| Commits this week | Bright new shoots |
| Merged pull requests | Persimmons, ripening green → gold |
| Open pull requests | Unripe green fruit |
| Code reviews | Paper lanterns, lit in the night themes |
| Issues closed | A bird perched at volume |
| Stars received | Fireflies at dusk (log-scaled - whales don't white out) |
| Discussions answered | A wind chime |
| Current streak | Blossom clusters (a break drops petals for a week - the tree is never harmed) |
| Longest-ever streak | A faint ring of petals pressed into the soil, permanently |
| The season | hanami bloom, deep summer green, autumn red-gold, snow on the pot |

Rendering is deterministic: the same history on the same day produces the same
bytes, on any machine. Your tree's shape comes out of your own numbers, so it
won't match anyone else's.

## Options

Everything is a URL parameter - there is no config file, by design.

```
https://kodama-sigma.vercel.app/<user>.svg
  ?theme=ink|dusk|paper|sakura|yozakura|shore   default: auto (dark/light aware)
  &scale=full|compact|strip|button              830×420 · 420×160 · 830×90 · 88×31
  &animate=auto|off                             auto respects prefers-reduced-motion
  &tint=lang|none                               tint the foliage by top language
  &lang=en|ja|...                               language of the labels and alt-text (locale= also works)
  &date=YYYY-MM-DD                              draw a past day instead of today
```

`date` moves the calendar the tree is judged against, not the history behind it:
the counts are still today's, read as of the day you name. A future date is
refused, since the history stops today.

The SVG carries both colour schemes and switches on the reader's
`prefers-color-scheme`, so one URL works in a light or dark README. Each tree
also writes a one-line description into `<title>`/`<desc>` for screen readers.
The 88×31 `button` scale is there for anyone who misses old-web badges.

### Themes

`ink` (default, moonlit) · `dusk` · `paper` (washi) · `sakura` (blossom, spring-biased) ·
`yozakura` (night bloom) · `shore` (driftwood and sea glass). See them all in the
[gallery](https://kodama-sigma.vercel.app/gallery).

## Privacy

kodama reads only public data: the same contribution counts GitHub already shows
on your profile. There are no accounts, no login, and no user database. The
cache holds a rendered history keyed by username for a short window and nothing
else. Your username appears in the URL you paste and in that cache; no other
personal data is collected, stored, or shared. Private contributions are never
read.

## How it's built

A TypeScript monorepo:

- **`engine/`** - a pure SVG renderer. No clock, no network, no randomness beyond
  a seeded PRNG, so `render(history, date, options)` is a pure function and can
  be tested against committed golden files.
- **`service/`** (`@kodama/api`) - fetches your public history via GitHub's
  GraphQL API, caches it, and serves the image. Every failure path still returns
  a valid SVG with HTTP 200, so a README never shows a broken image.
- **`site/`** - the landing page, gallery, grammar page, and receipts.
- **`api/`** - thin Vercel function adapters.

## Contributing

New themes are the easiest thing to contribute: palettes are data, and the
golden harness makes a theme PR straightforward to review. See
[CONTRIBUTING.md](CONTRIBUTING.md).

## License

[MIT](LICENSE) © Arijit Ghosh.
