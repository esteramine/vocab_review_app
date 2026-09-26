# 単語復習 — Japanese Vocab Review (PWA)

Personal spaced-repetition app. FSRS scheduling, one card per word, furigana
display, write-and-self-grade + cloze review. Japanese UI, Traditional-Chinese
meanings. All data local (IndexedDB), offline-capable PWA.

## Run on your Mac (to preview UI + flow)

```bash
cd /Users/anncca/Documents/Apps/review-app
npm install
npm run dev
```

Open the printed URL (http://localhost:5173).

### Load sample words to try the flow immediately
Open the browser devtools console and run:
```js
await seedDemo()   // adds 5 sample words, then reload
```
To clear everything: `await wipeAll()` then reload.

## Try it on your iPhone (same Wi-Fi, no install)
`npm run dev` prints a Network URL like `http://192.168.x.x:5173`. Open that on
your iPhone's Safari (same Wi-Fi as the Mac). This is enough to feel the flow on
the actual device before any real install.

## Install as a real offline app on your iPhone (later)
1. `npm run build` then `npm run preview -- --host` (serves the built PWA).
2. On iPhone Safari, open the Network URL it prints.
3. Share → **Add to Home Screen**. It installs as an icon, runs full-screen,
   works offline. No Apple account, no 7-day expiry.

For it to work when the Mac is off, host the `dist/` folder anywhere static
(Netlify/Vercel/GitHub Pages) — all free — and add *that* URL to your home
screen.

## Stack
React + Vite + vite-plugin-pwa · Dexie (IndexedDB) · ts-fsrs · wanakana ·
native `<ruby>` furigana · `<canvas>` drawing pad · Noto Sans JP/TC.

## Structure
```
src/
  db/db.ts             Dexie schema (words, cards, logs)
  lib/
    types.ts           domain types
    srs.ts             FSRS wrapper (grade, preview intervals)
    furigana.ts        auto-split word+reading → ruby segments
    queue.ts           "due today + new" queue builder
    seed.ts            demo data (window.seedDemo)
  components/
    Furigana.tsx       <ruby> renderer
    DrawPad.tsx        finger/mouse drawing canvas
  screens/
    HomeScreen.tsx     today counts + nav
    AddScreen.tsx      add word w/ live furigana preview
    ReviewScreen.tsx   write/cloze prompt → reveal → self-grade
```

## Notes / v1 scope
- Furigana for multi-kanji words auto-splits heuristically; correct by hand in
  the Add screen preview if needed. (kuroshiro auto-generation can be added later.)
- Writing review has no handwriting recognition by design — you draw, reveal,
  and self-grade (Again/Hard/Good/Easy), which drives FSRS.
