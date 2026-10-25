// The Worker: src/inbox.js with Cloudflare's email binding plugged in.
import { EmailMessage } from "cloudflare:email";
import { handle } from "./inbox.js";

export default {
  fetch(request, env) {
    return handle(request, env, (raw) => env.INBOX.send(new EmailMessage(env.FROM, env.TO, raw)));
  },
};
