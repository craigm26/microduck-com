# microduckstudio.com

The static site for Microduck Studio, served by Cloudflare Pages (project `microduck`,
`microduck-4m8.pages.dev`, custom domain microduckstudio.com + www).

Six HTML pages and a shared stylesheet, with no build step at deploy time, bundler, npm
dependency, or JavaScript. The visual theme follows Pollen Robotics' warm orange accents,
spacious typography and rounded panels while clearly identifying Studio as an independent
project.

- `public/index.html` - the product overview and downloads.
- `public/docs/index.html` - getting started, policy and motion guides, bench setup,
  evaluations, challenge criteria, reproducibility, file formats and resources.
- `public/privacy/index.html` - the privacy policy the App Store listing links to. Its URL
  is on the listing for app 6806299485, so the path, filename and trailing slash never change.
- `public/cards/` - Duck Cards, a printable deck for classrooms: the deck and its lessons
  (`index.html`), the cut sheet (`print/index.html`), the card format (`spec/index.html`),
  and the deck file every card is drawn from (`duck-cards.json`).
- `public/assets/site.css` - shared theme, responsive navigation, documentation layout,
  light and dark colors, and keyboard focus styles.
- `public/assets/studio-icon.png` - the existing app icon, copied from the app repository.
- `public/assets/fonts/` - Fredoka, the one face that is not the system's, used only on the
  Duck Cards themselves; served from this site under the SIL Open Font License 1.1, whose
  text sits beside it.
- `public/duckbench-bundle.zip` (+ `.sha256`) - the downloadable duckbench bundle, built in
  the `duckbench` repo; regenerate there, do not edit here.
- `public/_headers` - response headers, including a CSP with `default-src 'none'`, local
  stylesheets allowed, and no `script-src`, so scripts cannot execute on this site.
- `public/robots.txt`, `public/sitemap.xml` - every page and a crawl pointer.
- `scripts/` - the gates. `tools/` is never served.
- `tools/duckcards/` - draws the cards into the pages: `build_cards.py`, the pictures
  (`art.py`) and the AprilTag table (`tag36h11.txt`).

## Preview locally

```sh
python3 -m http.server 8000 --directory public
```

Open `http://localhost:8000/` and `/docs/`. The preview server does not apply Cloudflare's
`_headers` file; verify response headers on the deployed host.

## Run the gates before every deploy

```sh
bash scripts/predeploy.sh                # all seven, stopping at the first failure
```

In order: the extractor reads the **values** of the pinned StudioKit constants out of
`~/projects/duck-studio` into `tools/kit-sentences.json`; every quoted sentence has to be
on the site word for word and every restated number has to be in the constant it came
from. The copy checks cover every public HTML page, and the independence statement must
appear on each one. The dash, third party, shared stylesheet, dataset, format and bundle
claims are checked. The Evaluations copy is checked against the receipt in both directions.
Every Duck Card on every page is read back against the deck file, Studio's own words and
pad, and the AprilTag table cell by cell; the controls the cards page names are read again
out of the StudioKit the receipt's beta build was made from.
Local links, cross-page fragments, stylesheet references and assets must resolve within
`public/`; external links are fetched by GET and must answer 200. Every page must close its
elements, use unique IDs and appear in the sitemap. Same-site canonical URLs are validated
locally so a new page can pass before its first deployment.

Three rules the gates exist to hold:

1. **Every number on the site is read out of a StudioKit constant, or it is not on the
   site.** A number that lives only in a Swift doc comment cannot be pinned by anything,
   so it is not printed here.
2. **No image depicting the app's interface ships on this site** until it is a screenshot
   taken from a real device, and the commit that adds it names the device and build
   number. The app cannot build for the Simulator. The app icon is an identity asset,
   not an interface screenshot; `img-src 'self' data:` also blocks hotlinked images.
3. **The build goes before the site.** Evaluations copy is authored in two states and
   served in one. The homepage holds the `META` and `CARD` regions; the docs hold
   `SECTION` and `FORMATROW`. The search snippet and link preview use the same state as
   the body copy. Present tense copy about a screen a tester cannot open is a capability
   asserted one tap from a TestFlight button.

## Flipping Evaluations to the shipped wording

```sh
bash scripts/record_evallog_shipped.sh ~/projects/duck-studio
```

That is the only writer of `tools/evallog-shipped.json`. It runs the app's own EvalLog
parity gate and requires exit 0, reads TestFlight through
`ios-certificates/skills/appstore-submit/testflight.py` and requires build 61 VALID and
installable, then records the beta state App Store Connect actually returned, writes the
receipt beside the whole status line, and puts the homepage and docs into the shipped
state. To go back, `bash scripts/set_evallog_state.sh not-shipped` and delete the receipt.

## Duck Cards

The cards are drawn, never typed. `public/cards/duck-cards.json` says which cards exist,
`tools/kit-sentences.json` (written by the extractor) says what Studio calls each one and
which pad button does what, and `tools/duckcards/tag36h11.txt` says what each code looks
like. To change a card, edit the deck file, then redraw the regions between the
`DUCKCARDS` markers:

```sh
python3 scripts/extract_kit_sentences.py ~/projects/duck-studio
python3 tools/duckcards/build_cards.py           # --check only reports stale regions
```

A card's number never changes meaning; a new card takes a new number from its category's
range. The pictures in `art.py` are original drawings, not traced from Pollen Robotics'
art. The deck, its pictures and its lessons are CC BY 4.0; the code that draws them is
Apache-2.0 like the rest of the project. Print the cut sheet at actual size on Letter and on
A4 after any change to card sizes, and check every code still decodes.

## Deploy

```sh
export NVM_DIR="$HOME/.nvm"; . "$NVM_DIR/nvm.sh"
python3 scripts/stamp_css.py             # after any change to site.css
bash scripts/predeploy.sh
git add public scripts tools README.md && git commit
npx --yes wrangler@4 pages deploy public --project-name microduck --branch=main
```

Every page links the stylesheet as `/assets/site.css?v=<first ten hex of its sha256>`. The
zone serves it with `max-age=14400`, so without the stamp a returning visitor keeps the old
stylesheet for up to four hours after a deploy while the new HTML arrives at once; the claims
gate fails until every page carries the current stamp.

The live wrangler OAuth token is in `~/.wrangler/config/`, not `~/.config/.wrangler/`. No
GitHub Actions, ever. After deploying, check the live host: `/`, `/docs/`, `/privacy/`,
`/cards/`, `/cards/print/`, `/cards/spec/` and `/cards/duck-cards.json` all return 200, the
stylesheet and icon load, the zip is 11666886 bytes, the CSP header is present, and the docs
carry exactly one `id="evallog-..."` marker matching the receipt.

Check the homepage, docs navigation, tables, privacy page and the three cards pages at
narrow mobile and desktop widths in light and dark mode, and print the cut sheet once. Confirm that the primary TestFlight and docs links are easy
to find, that keyboard focus stays visible, and that no content causes horizontal page
scrolling. Open the TestFlight link on a real iPhone to confirm the beta still accepts testers.
