# GEDCOM Poster Editor

A browser-only editor that turns a GEDCOM (`.ged`) family tree into a printable poster. Pick a person, choose a design, add photos, adjust the layout, and
download a PNG, PDF or SVG. Everything runs in the browser: the file is read locally and never uploaded.

## Features
- Reads GEDCOM 5.5.x files; hides details of people who may be living by default
- Designs: a tree with roots, branches and leaves (procedurally drawn wood and leaves), and pedigree charts in columns or rows
- Optional siblings, spouses and cousins; adjustable generations
- Photos added one by one or from a zip, matched by person ID or name; per-photo cropping
- Drag people and branches, bend branches and roots, distribute organically or evenly, undo and redo
- Colours, title, borders, an aged-paper finish
- Paper sizes from A4 to A0, US and common European sizes, with a readable-text check
- Autosave in the browser (IndexedDB) and save/open of a project file
- Export as PNG (up to 10,000 px wide), PDF (via the browser's print dialog) and SVG

## Run it
```
npm install
npm run dev        # http://localhost:5173/  (add ?sample to open the sample family)
npm run build      # static files in dist/, which work from any folder
npm run test:all   # runs the unit and browser tests (needs: npx playwright install chromium)
```
Node 20 or newer.

## Layout
- `index.html`: the editor page, styles and controls
- `src/gedcom.ts`: GEDCOM parser. `src/layout.ts`: positions people and routes lines. `src/svg.ts`: draws the poster.
- `src/treeart.ts`: procedural tree, roots and leaves. `src/decor.ts`: borders, paper and ageing. `src/themes.ts`: colour looks.
- `src/photos.ts`, `src/photoui.ts`: photo matching and cropping. `src/paper.ts`: paper sizes. `src/main.ts`: the interface.
- `sample/whitfield-family.ged`: an invented family for tests and the demo. Every person in it is made up.
- `scripts/`: tests (Playwright browser suites plus `test.ts` for layout and parsing).

## Notes
The sample family is fictional. Do not commit real family data: GEDCOM files often contain details of living people.
