# The feedback inbox

A Cloudflare Worker, `duck-inbox`, that turns feedback posted elsewhere into email at
the same inbox as `feedback@microduckstudio.com`:

| From | Path | Proved by | Becomes |
|---|---|---|---|
| Hugging Face: a new discussion, or a reply, on one of our repos | `POST /huggingface` | the `X-Webhook-Secret` header | an email quoting it, with its link |
| App Store Connect: TestFlight screenshot or crash feedback | `POST /appstore` | `x-apple-signature: hmacsha256=<hex>` over the raw body | an email naming the submission |

Apple's notification carries no feedback text, only which submission to fetch, and
fetching it needs the App Store Connect key, which stays on the robot. So that email
says where to read the feedback rather than quoting it. Nothing is stored; a failed send
answers 502 and both senders retry.

`src/inbox.js` is all the logic and has no Cloudflare imports; `src/index.js` plugs in the
email binding. `npm test` runs `node --test` (Node 20 or newer), including Apple's own
HMAC example.

## Setting it up

Email Routing must be on for microduckstudio.com, with `craigm26@gmail.com` a verified
destination: the binding sends only there, from `inbox@microduckstudio.com`.

On the robot, from this folder:

```sh
export NVM_DIR="$HOME/.nvm"; . "$NVM_DIR/nvm.sh"; nvm use 22
npm test
umask 077; mkdir -p ~/.config/duck-inbox
for s in HF_WEBHOOK_SECRET APPSTORE_WEBHOOK_SECRET; do
  [ -s ~/.config/duck-inbox/$s ] || openssl rand -hex 32 > ~/.config/duck-inbox/$s
  npx --yes wrangler@4 secret put $s < ~/.config/duck-inbox/$s
done
npx --yes wrangler@4 deploy
```

The secrets are never printed; the copies in `~/.config/duck-inbox/` are what you paste
into the two webhook forms below.

- **Hugging Face:** [Settings, Webhooks](https://huggingface.co/settings/webhooks), add one
  that watches your user, for discussions and comments, with the URL
  `https://duck-inbox.<subdomain>.workers.dev/huggingface` and the secret from
  `HF_WEBHOOK_SECRET`.
- **App Store Connect:** Users and Access, Integrations, Webhooks, add one with the URL
  `https://duck-inbox.<subdomain>.workers.dev/appstore`, the secret from
  `APPSTORE_WEBHOOK_SECRET`, and the TestFlight feedback events. Then send its test
  notification; it arrives as an `[App Store Connect]` email.

To stop your own Hugging Face posts arriving as feedback, put your Hugging Face user id in
`IGNORE_HF_AUTHOR_IDS` (comma separated) with `wrangler secret put`.
