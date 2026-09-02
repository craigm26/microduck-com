# microduckstudio.com

The static site for Microduck Studio, served by Cloudflare Pages (project `microduck`,
`microduck-4m8.pages.dev`, custom domain microduckstudio.com + www).

- `public/index.html` — the page.
- `public/privacy/index.html` — the privacy policy the App Store listing links to.
- `public/duckbench-bundle.zip` (+ `.sha256`) — the downloadable duckbench bundle, built in the
  `duck-sounds` repo; regenerate there, do not edit here.

Deploy from this directory with wrangler (see the `deploy-cloudflare` skill in
`ios-certificates/skills/`; the live OAuth token lives in `~/.wrangler/config/`).
