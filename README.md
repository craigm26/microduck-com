# microduckstudio.com

The static site for Microduck Studio, served by Cloudflare Pages (project `microduck`,
`microduck-4m8.pages.dev`, custom domain microduckstudio.com + www).

Three HTML pages and a shared stylesheet, with no build step, bundler, npm dependency,
or JavaScript. The visual theme follows Pollen Robotics' warm orange accents, spacious
typography and rounded panels while clearly identifying Studio as an independent project.

- `public/index.html` - the product overview and downloads.
- `public/docs/index.html` - getting started, policy and motion guides, bench setup,
  evaluations, challenge criteria, reproducibility, file formats and resources.
- `public/privacy/index.html` - the privacy policy the App Store listing links to. Its URL
  is on the listing for app 6806299485, so the path, filename and trailing slash never change.
- `public/assets/site.css` - shared theme, responsive navigation, documentation layout,
  light and dark colors, and keyboard focus styles.
- `public/assets/studio-icon.png` - the existing app icon, copied from the app repository.
- `public/duckbench-bundle.zip` (+ `.sha256`) - the downloadable duckbench bundle, built in
  the `duckbench` repo; regenerate there, do not edit here.
- `public/_headers` - response headers, including a CSP with `default-src 'none'`, local
  stylesheets allowed, and no `script-src`, so scripts cannot execute on this site.
- `public/robots.txt`, `public/sitemap.xml` - all three URLs and a crawl pointer.
- `scripts/` - the gates. `tools/` is never served.

## Preview locally

```sh
python3 -m http.server 8000 --directory public
```

Open `http://localhost:8000/` and `/docs/`. The preview server does not apply Cloudflare's
`_headers` file; verify response headers on the deployed host.

## Run the gates before every deploy

```sh
bash scripts/predeploy.sh                # all six, stopping at the first failure
```

In order: the extractor reads the **values** of the pinned StudioKit constants out of
`~/projects/duck-studio` into `tools/kit-sentences.json`; every quoted sentence has to be
on the site word for word and every restated number has to be in the constant it came
from. The copy checks cover every public HTML page, and the independence statement must
appear on each one. The dash, third party, shared stylesheet, dataset, format and bundle
claims are checked. The Evaluations copy is checked against the receipt in both directions.
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

## Deploy

```sh
export NVM_DIR="$HOME/.nvm"; . "$NVM_DIR/nvm.sh"
bash scripts/predeploy.sh
git add public scripts tools README.md && git commit
npx --yes wrangler@4 pages deploy public --project-name microduck --branch=main
```

The live wrangler OAuth token is in `~/.wrangler/config/`, not `~/.config/.wrangler/`. No
GitHub Actions, ever. After deploying, check the live host: `/`, `/docs/` and `/privacy/`
all return 200, the stylesheet and icon load, the zip is 11666886 bytes, the CSP header
is present, and the docs carry exactly one `id="evallog-..."` marker matching the receipt.

Check the homepage, docs navigation, tables and privacy page at narrow mobile and desktop
widths in light and dark mode. Confirm that the primary TestFlight and docs links are easy
to find, that keyboard focus stays visible, and that no content causes horizontal page
scrolling. Open the TestFlight link on a real iPhone to confirm the beta still accepts testers.
