# microduckstudio.com

The static site for Microduck Studio, served by Cloudflare Pages (project `microduck`,
`microduck-4m8.pages.dev`, custom domain microduckstudio.com + www).

Twenty HTML pages and a shared stylesheet, with no build step at deploy time, bundler or npm
dependency. There is no JavaScript anywhere except the four books under `/books/`, which run
the site's own scripts and nothing else's (see "The books" below). The visual theme follows
Pollen Robotics' warm orange accents, spacious typography and rounded panels while clearly
identifying Studio as an independent project.

- `public/index.html` - the product overview and downloads.
- `public/docs/index.html` - getting started, policy and motion guides, bench setup,
  evaluations, challenge criteria, reproducibility, file formats and resources.
- `public/privacy/index.html` - the privacy policy the App Store listing links to. Its URL
  is on the listing for app 6806299485, so the path, filename and trailing slash never change.
- `public/cards/` - Duck Cards, a printable deck for classrooms: the deck and its lessons
  (`index.html`), the cut sheet (`print/index.html`), the card format (`spec/index.html`),
  and the deck file every card is drawn from (`duck-cards.json`).
- `public/cards/packs/` - Duck Card packs, a game for each grade band: the list
  (`index.html`), each pack's page of challenge cards and lessons (`<id>/index.html`), its cut
  sheet of only the cards in play (`<id>/print/index.html`), and the pack files themselves
  (`<id>.duckpack`), byte identical to the ones StudioKit bundles.
- `public/books/` - three reference books, ten lessons each: the shelf (`index.html`), Book 1
  for readers 7 and up with a grown-up (`beginner/`), Book 2 for teens and adults
  (`intermediate/`) and Book 3 for people who train robots (`advanced/`). Each page is the whole
  book as a document; `engine/book.js` lays it onto a 3D pop-up book, `engine/kit.js` is the
  shared paper kit, `engine/figures-<book>.js` holds each lesson's pop-up, and `vendor/` is
  three.js r170 with its licence.
- `public/assets/site.css` - shared theme, responsive navigation, documentation layout,
  light and dark colors, keyboard focus styles, and the books.
- `public/assets/studio-icon.png` - the existing app icon, copied from the app repository.
- `public/assets/fonts/` - Fredoka, the one face that is not the system's, used only on the
  Duck Cards themselves; served from this site under the SIL Open Font License 1.1, whose
  text sits beside it.
- `public/duckbench-bundle.zip` (+ `.sha256`) - the downloadable duckbench bundle, built in
  the `duckbench` repo; regenerate there, do not edit here.
- `public/_headers` - response headers. Every section gets a CSP with `default-src 'none'`
  and local stylesheets; only `/books/*` adds `script-src 'self'`, so scripts can run there
  and nowhere else, and never from another host. The policy is set per section rather than on
  `/*`, because Cloudflare joins every matching rule's headers and a `/*` policy would still
  block the books.
- `public/robots.txt`, `public/sitemap.xml` - every page and a crawl pointer.
- `scripts/` - the gates. `tools/` is never served.
- `tools/duckcards/` - draws the cards into the pages: `build_cards.py`, the pictures
  (`art.py`) and the AprilTag table (`tag36h11.txt`); `build_packs.py` draws the pack pages.
- `tools/books/` - the books' numbers ledgers (`claims-<book>.json`) and the training pages'
  (`claims-train.json`, one key per page), the vendored files'
  digests, a local server that applies `_headers` (`serve.py`), the stills and frame-jump
  check (`shoot.cjs`, `montage.py`), and `mutate.py`, which plants a defect at a time in a copy
  of the repository and proves `check_books.py` fails on each.

## Preview locally

```sh
python3 -m http.server 8000 --directory public
```

Open `http://localhost:8000/` and `/docs/`. The preview server does not apply Cloudflare's
`_headers` file; verify response headers on the deployed host. For the books, use
`python3 tools/books/serve.py 8123`, which applies `_headers` the way Pages documents it, so
a policy that would block the books blocks them here too.

## Run the gates before every deploy

```sh
bash scripts/predeploy.sh                # all nine, stopping at the first failure
```

In order: the extractor reads the **values** of the pinned StudioKit constants out of
`~/projects/duck-studio` into `tools/kit-sentences.json`; every quoted sentence has to be
on the site word for word and every restated number has to be in the constant it came
from. The copy checks cover every public HTML page, and the independence statement must
appear on each one. The dash, third party, shared stylesheet, dataset, format and bundle
claims are checked. The Evaluations copy is checked against the receipt in both directions.
Every Duck Card on every page is read back against the deck file, Studio's own words and
pad, and the AprilTag table cell by cell; the controls the cards page names are read again
out of the StudioKit the receipt's beta build was made from. Every pack file is compared byte
for byte with the duck-studio checkout's, every par is played on the board, and every challenge
card is read back off its page square by square.
Local links, cross-page fragments, stylesheet references and assets must resolve within
`public/`; external links are fetched by GET and must answer 200. Every page must close its
elements, use unique IDs and appear in the sitemap. Same-site canonical URLs are validated
locally so a new page can pass before its first deployment. Last, the books: every lesson's
structure, the one module script on each book page and nowhere else, the policy in
`_headers`, the vendored three.js byte for byte, and every number each lesson prints against
its ledger and the pinned source the ledger quotes.

Three rules the gates exist to hold:

1. **Every number on the site is read out of a StudioKit constant, or it is not on the
   site.** The books under `/books/` are the one exception, and they have a rule of their own
   (see "The books"). A number that lives only in a Swift doc comment cannot be pinned by anything,
   so it is not printed here. A pack page's numbers come from the pack file, which is a
   StudioKit resource pinned by its sha256; its one number about a real duck, how far the
   first simulator measurement carried it on one Walk card, is read by the extractor out of
   the measurement table in duck-studio's `docs/PACKS.md`, and no other centimetres may be
   printed beside it.
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

## Duck Card packs

A pack is made in duck-studio (`docs/PACKS.md`), never here. To take a new or changed pack,
copy it from `StudioKit/Sources/StudioKit/Resources/DuckPacks/` into `public/cards/packs/`,
then:

```sh
python3 scripts/extract_kit_sentences.py ~/projects/duck-studio   # pins each pack's sha256
python3 tools/duckcards/build_packs.py                            # --check only reports
```

`scripts/check_packs.py` fails while a site copy differs from the checkout's, a pack is on one
side only, or a page is not what the pack says. The board rule (one Walk card is one square,
one Turn card a quarter turn) is the paper and Studio rule. A pack page says one card has
not been measured on a real duck, so the gate fails the day a pack carries a
`duck_square_cm`; rewrite the sizing copy in `build_packs.py` then. Print a pack page once
after any change to the activity card: four challenge cards to a Letter or A4 sheet, nothing
cut off at the bottom of a card that carries a Find the bug row.

The build goes before the site here too. The pack pages say the board is played in Studio,
and on 2026-10-15 Studio's Packs screen is on duck-studio's `duck-packs` branch and in no
TestFlight build, so the pack pages go live with that build and not before.

## The books

Four books, ten lessons each, at `/books/`. A lesson is a spread: the left page is the lesson
(`.lesson-page`, with a prediction to commit to), the right page is a pop-up figure played one
step at a time (`figure.lesson-figure`, whose `ol.figure-steps` the engine turns into the step
buttons, so every word the figure shows is in the HTML), and `aside.lesson-notes` holds Try it
for real, the notes for grown-ups, and where the numbers come from. Without JavaScript the page
is the whole book, readable and printable.

**Their numbers have their own rule.** The books teach how Pollen Robotics trains the robot, so
their numbers come from Pollen's `microduck_rl` and `microduck` repositories (pinned to commits
`b02fdea` and `942e58e`), this site's own pages, and Kith. Every number a lesson prints, including
the ones its pop-up prints (labels, chips, a chart's ticks) and the ones in the page's title and
descriptions, has an entry in `tools/books/claims-<book>.json`: a quote from a pinned source, the
arithmetic that derives it, or the reason it is a toy, a count of something on the page, or an
editorial choice. A quote must contain the number it vouches for, as digits or as a word, or say
in `means` how it yields it ("bipedal" is two legs). A derived number's operands must be numbers
the same lesson ledgers, a unit constant, or explained under `with`. `scripts/check_books.py`
reads every lesson, finds every number, and rereads each quoted source. A pop-up that is a toy
model says so on its page with `data-badge="toy"`.

**Book 4 reads real runs.** [`/books/casebook/`](public/books/casebook/index.html), *How a Policy
Became*, traces this site's author's fine-tunes in [duckbatch](https://github.com/craigm26/duckbatch):
the b003 series, seven runs that set out to teach the duck to walk slowly and turn on the spot, and
k001, a straighter kick. Its numbers are quoted from the design and close notes written before and
after each run, and from duckbatch's code, all pinned to commit `1f476e4`. Lesson 9 adds a sense
through the Qwiic sockets on Pollen's open [Robot HAT](https://github.com/pollen-robotics/elec_RPI_Robot_HAT)
(pinned to `6de8628`) and its I²C bus in Pollen's robot code; lesson 10 carries a policy to other
simulators, from the pinned READMEs of mjlab, MuJoCo Playground, Isaac Lab, Open Duck Playground and
Open Duck Mini. The runs' records are a public Hugging Face dataset, named in the text but never
linked, because the site links only the two challenge datasets.

**Predict, play, check.** With JavaScript, a prediction's answer stays hidden until the figure's
last step, and its options are shuffled the same way on every visit; without it, the page is the
whole book. Book 1 opens as flat pages where its 3D pages would set the text under 13 px.

**Printing.** Paper can't play a pop-up, so a book printed from the 3D view puts every page back
in its lesson and prints every prediction's answer, every figure's steps, its caption and its big
idea.

**The duck is our own drawing**, a paper toy with the robot's joints in the robot's order, not a
model of Pollen Robotics' design.

To change a lesson: edit its HTML, then its figure in `engine/figures-<book>.js` if the steps
changed (the step count must match the list), then run `python3 scripts/check_books.py` and fix
the ledger it complains about. To look at it, run `python3 tools/books/serve.py 8123` and
`node tools/books/shoot.cjs <book> <lessons>`, which writes a still of every step and fails on a
console error, a step-count mismatch, a left page that overflows, or a mesh that jumps between
frames; `python3 tools/books/montage.py <stills dir>` tiles them per lesson. After changing
`check_books.py` itself, run `python3 tools/books/mutate.py` and add a case for the new rule.

## Train your first duck

[`/train/`](public/train/index.html) is the practical half of the books. It asks which machine you
have and sends you to one of four guides, each a non-coder's route to a policy they trained:

- [`/train/windows/`](public/train/windows/index.html): a Windows PC with an NVIDIA card, through
  WSL 2, the Windows NVIDIA driver, git and uv.
- [`/train/linux/`](public/train/linux/index.html): a Linux PC with an NVIDIA card, through Ubuntu's
  own driver tools, git, curl and uv.
- [`/train/mac/`](public/train/mac/index.html): a Mac with Apple silicon, which cannot train with
  mjlab, so it rents an NVIDIA L4 on Hugging Face Jobs, from Microduck Studio or from Pollen's
  workshop, and scores, replays, exports and publishes on the Mac.
- [`/train/iphone/`](public/train/iphone/index.html): an iPhone or iPad, all in Microduck Studio:
  Compare, the on-device tune and weight search, and **Train a network on Hugging Face**, which
  rents the card with the user's own token.

The PC and Mac guides hand over to Pollen's own workshop (the **Train my own robot** line on an
Arena challenge, which clones `microduck-challenges`), Claude Code beside it (each challenge folder
has an `AGENTS.md` written for coding agents), the snags people hit, and `microduck_rl` for training
the walk itself. Studio's guides follow the app's own screens and words.

Every training tool on them is Pollen's, and Studio is ours; the pages only add the route. Their
numbers are held like a book's: `tools/books/claims-train.json` keeps one key per page and quotes
`microduck-challenges` at `6ff4070` (its sprint `AGENTS.md` and its `uv.lock`), `microduck_rl` at
`b02fdea`, Pollen's Arena at `d757117` (v0.5.0), `duck-studio` at `8e9e9bf` (build 85, the beta),
and the Microsoft and NVIDIA pages the Windows steps rest on, and `check_books.py` checks every page
with the shelf as a plain page. When Pollen changes the workshop or the recipe, or Studio changes a screen the guides
name, read the source again, re-pin the commit in `SOURCES`, and fix what the gate reports.

## Feedback

Every way in is listed on [/feedback/](public/feedback/index.html) and lands in one inbox:

- **Email** to `feedback@microduckstudio.com`, which Cloudflare Email Routing forwards to the
  developer's own address. Every book lesson carries a link that fills in its book and lesson,
  in the grown-ups' section of its notes. Every footer links the feedback page.
- **GitHub issue forms** in `.github/ISSUE_TEMPLATE/`: a book lesson, or something on the site.
- **Hugging Face discussions and TestFlight feedback**, mailed to the same inbox by the Worker in
  [`inbox/`](inbox/README.md).

Email Address Obfuscation stays off for this zone: it rewrites every `mailto:` link and adds a
script to decode them, which this site's security policy blocks everywhere but the books.

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
`/cards/`, `/cards/print/`, `/cards/spec/`, `/cards/duck-cards.json`, `/cards/packs/`, each
pack's page, cut sheet and `.duckpack`, `/books/` and the four books all return 200, a book's
response carries the books' `script-src 'self'` policy and every other page carries none, the
stylesheet and icon load, the zip is 11666886 bytes, the CSP header is present, and the docs
carry exactly one `id="evallog-..."` marker matching the receipt.

Check the homepage, docs navigation, tables, privacy page, the three cards pages and the pack pages at
narrow mobile and desktop widths in light and dark mode, and print the cut sheet once. Confirm that the primary TestFlight and docs links are easy
to find, that keyboard focus stays visible, and that no content causes horizontal page
scrolling. Open the TestFlight link on a real iPhone to confirm the beta still accepts testers.
