// The feedback inbox: webhooks in, one email out per piece of feedback.
//
// Two senders, each proved before anything is read:
//   POST /huggingface  Hugging Face: a new discussion or reply on one of your repos.
//                      Proved by the X-Webhook-Secret header equalling HF_WEBHOOK_SECRET.
//   POST /appstore     App Store Connect: TestFlight screenshot or crash feedback.
//                      Proved by x-apple-signature: hmacsha256=<hex HMAC-SHA256 of the raw
//                      body under APPSTORE_WEBHOOK_SECRET>, as Apple documents it.
//
// Apple's notification carries no feedback text, only which submission to fetch, and
// fetching it needs the App Store Connect key, which stays on the robot. So its email
// names the submission and says where to read it rather than pretending to quote it.
//
// Nothing is stored. A send that fails answers 502 so the sender retries; both retry.
// This file has no Cloudflare imports so `node --test` can run it; src/index.js wires
// the real email binding.

const MAX_BODY = 1 << 20;   // both senders' payloads are a few kilobytes
const MAX_QUOTE = 4000;     // characters of a comment quoted into an email

const enc = new TextEncoder();

function hex(buffer) {
  return [...new Uint8Array(buffer)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function hmacHex(secret, body) {
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return hex(await crypto.subtle.sign("HMAC", key, typeof body === "string" ? enc.encode(body) : body));
}

// Equal strings, compared through their HMACs so the time taken says nothing about where
// they first differ.
async function sameSecret(a, b) {
  if (typeof a !== "string" || typeof b !== "string" || !a || !b) return false;
  const k = crypto.getRandomValues(new Uint8Array(32));
  const key = await crypto.subtle.importKey("raw", k, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const [x, y] = await Promise.all([crypto.subtle.sign("HMAC", key, enc.encode(a)), crypto.subtle.sign("HMAC", key, enc.encode(b))]);
  return hex(x) === hex(y);
}

export async function appleSignatureOk(secret, rawBody, header) {
  if (!secret || typeof header !== "string") return false;
  const m = /^hmacsha256=([0-9a-f]{64})$/i.exec(header.trim());
  if (!m) return false;
  return sameSecret(m[1].toLowerCase(), await hmacHex(secret, rawBody));
}

function clip(text, n = MAX_QUOTE) {
  const t = String(text ?? "").trim();
  return t.length > n ? t.slice(0, n) + "\n[cut short; the rest is on the page]" : t;
}

// What a Hugging Face event becomes, or null for one that is not new feedback.
export function fromHuggingFace(event, ignoreAuthors = []) {
  const scope = event?.event?.scope, action = event?.event?.action;
  const repo = event?.repo, discussion = event?.discussion, comment = event?.comment;
  if (!repo || !discussion || action !== "create") return null;
  if (scope !== "discussion" && scope !== "discussion.comment") return null;
  if (!comment || comment.hidden || typeof comment.content !== "string") return null;
  if (ignoreAuthors.includes(comment.author?.id)) return null;
  const kind = discussion.isPullRequest ? "pull request" : "discussion";
  const opened = scope === "discussion";
  const link = comment.url?.web || discussion.url?.web || repo.url?.web || "";
  const subject = opened
    ? `[Hugging Face] ${repo.name}: ${discussion.title}${discussion.isPullRequest ? " (pull request)" : ""}`
    : `[Hugging Face] ${repo.name}: reply on "${discussion.title}"`;
  const text = [
    `${opened ? "A new " + kind : "A reply in a " + kind} on the ${repo.type} ${repo.name}.`,
    "",
    clip(comment.content),
    "",
    `Read and answer it on Hugging Face: ${link}`,
  ].join("\n");
  return { subject, text };
}

const APPLE_KINDS = {
  betaFeedbackScreenshotSubmissionCreated: "screenshot feedback",
  betaFeedbackCrashSubmissionCreated: "crash feedback",
};

// What an App Store Connect notification becomes. Every notification is mailed: one this
// file does not know is still something App Store Connect thought worth sending.
export function fromAppStore(event) {
  const data = event?.data;
  if (!data || typeof data.type !== "string") return null;
  const instance = data.relationships?.instance?.data || data.relationships?.instance || {};
  const when = data.attributes?.timestamp || "";
  const kind = APPLE_KINDS[data.type];
  if (kind) {
    return {
      subject: `[TestFlight] New ${kind}`,
      text: [
        `A tester sent ${kind} for Microduck Studio${when ? " at " + when : ""}.`,
        "",
        `Submission: ${instance.type || "?"} ${instance.id || "?"}`,
        "",
        "Read it in App Store Connect: the app, then TestFlight, then Feedback.",
        "The notification carries no text of its own; the screenshot, the comment and the device are there.",
      ].join("\n"),
    };
  }
  return {
    subject: `[App Store Connect] ${data.type}`,
    text: [
      `App Store Connect sent a ${data.type} notification${when ? " at " + when : ""}.`,
      "",
      JSON.stringify(data.attributes ?? {}, null, 2),
      instance.id ? `\nAbout: ${instance.type || "?"} ${instance.id}` : "",
    ].join("\n"),
  };
}

function b64(bytes) {
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

// A plain-text message as RFC 5322 needs it: an encoded subject, a Message-ID, and the
// body in base64 lines so no line is too long and any character survives.
export function mime({ from, to, subject, text, now = new Date(), id = crypto.randomUUID() }) {
  const body = b64(enc.encode(text)).replace(/.{1,76}/g, "$&\r\n");
  const domain = String(from).split("@")[1] || "localhost";
  return [
    `From: Microduck feedback <${from}>`,
    `To: <${to}>`,
    `Subject: =?UTF-8?B?${b64(enc.encode(subject))}?=`,
    `Date: ${now.toUTCString().replace("GMT", "+0000")}`,
    `Message-ID: <${id}@${domain}>`,
    "MIME-Version: 1.0",
    "Content-Type: text/plain; charset=utf-8",
    "Content-Transfer-Encoding: base64",
    "",
    body,
  ].join("\r\n");
}

// A 204 must have no body at all, not even an empty one: Response throws on it.
const reply = (status, text = "") => status === 204
  ? new Response(null, { status })
  : new Response(text, { status, headers: { "content-type": "text/plain; charset=utf-8" } });

// One request. `send(raw)` delivers a MIME message; src/index.js passes the email binding's.
export async function handle(request, env, send) {
  const url = new URL(request.url);
  if (request.method === "GET" && url.pathname === "/") return reply(200, "Microduck feedback inbox. Webhooks only.\n");
  if (url.pathname !== "/huggingface" && url.pathname !== "/appstore") return reply(404, "Not here.\n");
  if (request.method !== "POST") return reply(405, "POST only.\n");
  const length = Number(request.headers.get("content-length") || 0);
  if (length > MAX_BODY) return reply(413, "Too large.\n");
  const raw = new Uint8Array(await request.arrayBuffer());
  if (raw.length > MAX_BODY) return reply(413, "Too large.\n");

  let message;
  if (url.pathname === "/huggingface") {
    if (!(await sameSecret(request.headers.get("x-webhook-secret"), env.HF_WEBHOOK_SECRET))) return reply(401, "Unproved.\n");
    let event;
    try { event = JSON.parse(new TextDecoder().decode(raw)); } catch { return reply(400, "Not JSON.\n"); }
    const ignore = String(env.IGNORE_HF_AUTHOR_IDS || "").split(",").map((s) => s.trim()).filter(Boolean);
    message = fromHuggingFace(event, ignore);
  } else {
    if (!(await appleSignatureOk(env.APPSTORE_WEBHOOK_SECRET, raw, request.headers.get("x-apple-signature")))) return reply(401, "Unproved.\n");
    let event;
    try { event = JSON.parse(new TextDecoder().decode(raw)); } catch { return reply(400, "Not JSON.\n"); }
    message = fromAppStore(event);
  }
  if (!message) return reply(204);
  try {
    await send(mime({ from: env.FROM, to: env.TO, ...message }));
  } catch (err) {
    console.error("send failed:", err?.message || err);
    return reply(502, "Could not send; try again.\n");
  }
  return reply(202, "Sent.\n");
}
