# microduckstudio.com

The static site for Microduck Studio, served by Cloudflare Pages (project `microduck`,
`microduck-4m8.pages.dev`, custom domain microduckstudio.com + www).

Two HTML files, no build step, no bundler, no npm dependency, and no JavaScript on either
page. You can read the whole site in a text editor, which is the point.

- `public/index.html` - the page.
- `public/privacy/index.html` - the privacy policy the App Store listing links to. Its URL
  is on the listing for app 6806299485, so the path, the filename and the trailing slash
  never change.
- `public/duckbench-bundle.zip` (+ `.sha256`) - the downloadable duckbench bundle, built in
  the `duckbench` repo; regenerate there, do not edit here.
- `public/_headers` - the response headers, including a CSP with `default-src 'none'` and
  no `script-src`, so no script can execute on this site at all.
- `public/robots.txt`, `public/sitemap.xml` - the two URLs and a crawl pointer.
- `scripts/` - the gates. `tools/` is never served.

## Run the gates before every deploy

```
bash scripts/predeploy.sh                # all six, stopping at the first failure
```

In order: the extractor reads the **values** of the pinned StudioKit constants out of
`~/projects/duck-studio` into `tools/kit-sentences.json`; every quoted sentence has to be
on the page word for word and every restated number has to be in the constant it came
from; the dash, third party, shared token, dataset, format and bundle claims are checked;
the Evaluations copy is checked against the receipt in both directions; every link is
fetched by GET and has to answer 200; and both pages have to close every element.

Three rules the gates exist to hold:

1. **Every number on the page is read out of a StudioKit constant, or it is not on the
   page.** A number that lives only in a Swift doc comment cannot be pinned by anything, so
   it is not printed here.
2. **No image depicting the app's interface ships on this site** until it is a screenshot
   taken from a real device, and the commit that adds it names the device and the build
   number. The app cannot build for the Simulator, so no screenshot exists yet and every
   substitute is a picture of an app that does not look like that. `img-src 'self' data:`
   makes a hotlinked one unrepresentable.
3. **The build goes before the site.** The Evaluations section is authored in two states
   and served in one, and the head is one of the four spliced regions, because the search
   snippet is the first sentence a stranger reads and a tag stripping gate cannot see it.
   Present tense copy about a screen a tester cannot open is a capability asserted one tap
   from a TestFlight button.

## Flipping Evaluations to the shipped wording

```
bash scripts/record_evallog_shipped.sh ~/projects/duck-studio
```

That is the only writer of `tools/evallog-shipped.json`. It runs the app's own EvalLog
parity gate and requires exit 0, reads TestFlight through
`ios-certificates/skills/appstore-submit/testflight.py` and requires build 61 VALID and
installable, then records the beta state App Store Connect actually returned, writes the
receipt beside the whole status line, and puts the page into the shipped state. To go
back, `bash scripts/set_evallog_state.sh not-shipped` and delete the receipt.

## Deploy

```
export NVM_DIR="$HOME/.nvm"; . "$NVM_DIR/nvm.sh"
bash scripts/predeploy.sh
git add public scripts tools README.md && git commit
npx --yes wrangler@4 pages deploy public --project-name microduck --branch=main
```

The live wrangler OAuth token is in `~/.wrangler/config/`, not `~/.config/.wrangler/`. No
GitHub Actions, ever. After the deploy, check the live host rather than what was uploaded:
`/` and `/privacy/` both 200, the zip is 11666886 bytes, the CSP header is present, and the
page carries exactly one `id="evallog-..."` marker matching the receipt.

Two things no script can check, both by hand: open the page in Safari at 375 x 667 in light
and dark and confirm the name, one sentence, the four facts and both buttons are visible
without scrolling; and open the TestFlight link on a real iPhone and confirm the beta is
still accepting testers.
