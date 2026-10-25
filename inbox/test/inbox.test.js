import { test } from "node:test";
import assert from "node:assert/strict";
import { handle, hmacHex, appleSignatureOk, fromHuggingFace, fromAppStore, mime } from "../src/inbox.js";

const env = {
  FROM: "inbox@microduckstudio.com",
  TO: "craigm26@gmail.com",
  HF_WEBHOOK_SECRET: "hf-secret-for-tests",
  APPSTORE_WEBHOOK_SECRET: "apple-secret-for-tests",
};

function post(path, body, headers = {}) {
  return new Request("https://inbox.example" + path, { method: "POST", body, headers: { "content-type": "application/json", ...headers } });
}
function outbox() {
  const sent = [];
  return { sent, send: async (raw) => { sent.push(raw); } };
}
function decode(raw) {
  const [head, body] = raw.split("\r\n\r\n");
  const subject = /Subject: =\?UTF-8\?B\?([^?]+)\?=/.exec(head)[1];
  const text = (s) => new TextDecoder().decode(Uint8Array.from(atob(s), (c) => c.charCodeAt(0)));
  return { head, subject: text(subject), text: text(body.replace(/\r\n/g, "")) };
}

// Hugging Face's own example shape (docs/hub/webhooks), trimmed to what is read.
const hfDiscussion = {
  event: { action: "create", scope: "discussion" },
  repo: { type: "model", name: "craigm26/microduck-duckbatch-b002-128x128", url: { web: "https://huggingface.co/craigm26/microduck-duckbatch-b002-128x128" } },
  discussion: { title: "Does it run on a real duck?", isPullRequest: false, url: { web: "https://huggingface.co/craigm26/microduck-duckbatch-b002-128x128/discussions/1" } },
  comment: { author: { id: "abc" }, content: "Tried it in the playground: it walks, but turns slowly.", hidden: false, url: { web: "https://huggingface.co/craigm26/microduck-duckbatch-b002-128x128/discussions/1#c1" } },
};

test("Apple's own HMAC example: 'This is my secret' over 'Hello, World!'", async () => {
  assert.equal(await hmacHex("This is my secret", "Hello, World!"), "7f062172b01cb00b53ca068614674a3d982a34062a0f5d37687d5e3377e54657");
  assert.equal(await appleSignatureOk("This is my secret", new TextEncoder().encode("Hello, World!"),
    "hmacsha256=7f062172b01cb00b53ca068614674a3d982a34062a0f5d37687d5e3377e54657"), true);
  assert.equal(await appleSignatureOk("This is my secret", new TextEncoder().encode("Hello, World!!"),
    "hmacsha256=7f062172b01cb00b53ca068614674a3d982a34062a0f5d37687d5e3377e54657"), false);
  assert.equal(await appleSignatureOk("This is my secret", new TextEncoder().encode("Hello, World!"), "7f0621"), false);
  assert.equal(await appleSignatureOk("", new TextEncoder().encode("Hello, World!"), "hmacsha256=00"), false);
});

test("a new Hugging Face discussion is mailed with its text and its link", async () => {
  const box = outbox();
  const res = await handle(post("/huggingface", JSON.stringify(hfDiscussion), { "x-webhook-secret": env.HF_WEBHOOK_SECRET }), env, box.send);
  assert.equal(res.status, 202);
  assert.equal(box.sent.length, 1);
  const m = decode(box.sent[0]);
  assert.equal(m.subject, "[Hugging Face] craigm26/microduck-duckbatch-b002-128x128: Does it run on a real duck?");
  assert.match(m.text, /turns slowly/);
  assert.match(m.text, /discussions\/1#c1/);
  assert.match(m.head, /^From: Microduck feedback <inbox@microduckstudio\.com>$/m);
  assert.match(m.head, /^To: <craigm26@gmail\.com>$/m);
  assert.match(m.head, /^Message-ID: <[0-9a-f-]+@microduckstudio\.com>$/m);
});

test("Hugging Face without the right secret is refused and nothing is sent", async () => {
  for (const headers of [{}, { "x-webhook-secret": "wrong" }, { "x-webhook-secret": "" }]) {
    const box = outbox();
    const res = await handle(post("/huggingface", JSON.stringify(hfDiscussion), headers), env, box.send);
    assert.equal(res.status, 401);
    assert.equal(box.sent.length, 0);
  }
  const box = outbox();
  const res = await handle(post("/huggingface", JSON.stringify(hfDiscussion), { "x-webhook-secret": "x" }), { ...env, HF_WEBHOOK_SECRET: "" }, box.send);
  assert.equal(res.status, 401, "an unset secret proves nothing");
});

test("replies are mailed; edits, hidden comments and your own posts are not", async () => {
  const reply = { ...hfDiscussion, event: { action: "create", scope: "discussion.comment" } };
  assert.equal(fromHuggingFace(reply).subject, '[Hugging Face] craigm26/microduck-duckbatch-b002-128x128: reply on "Does it run on a real duck?"');
  assert.equal(fromHuggingFace({ ...reply, event: { action: "update", scope: "discussion.comment" } }), null);
  assert.equal(fromHuggingFace({ ...reply, comment: { hidden: true } }), null);
  assert.equal(fromHuggingFace({ ...hfDiscussion, event: { action: "update", scope: "repo.content" } }), null);
  assert.equal(fromHuggingFace(hfDiscussion, ["abc"]), null);
  const pr = { ...hfDiscussion, discussion: { ...hfDiscussion.discussion, isPullRequest: true } };
  assert.match(fromHuggingFace(pr).subject, /\(pull request\)$/);
  const box = outbox();
  const res = await handle(post("/huggingface", JSON.stringify({ ...reply, event: { action: "update", scope: "discussion.comment" } }), { "x-webhook-secret": env.HF_WEBHOOK_SECRET }), env, box.send);
  assert.equal(res.status, 204);
  assert.equal(box.sent.length, 0);
});

test("a long comment is cut short and says so", () => {
  const long = { ...hfDiscussion, comment: { ...hfDiscussion.comment, content: "x".repeat(10000) } };
  const m = fromHuggingFace(long);
  assert.ok(m.text.length < 5000);
  assert.match(m.text, /cut short/);
});

// Apple's own example (Understanding webhook events), BETA_FEEDBACK_SCREENSHOT_SUBMISSION_CREATED.
const appleScreenshot = {
  data: {
    type: "betaFeedbackScreenshotSubmissionCreated",
    id: "4a9eacca-e53f-4006-85db-aa18c515663a",
    version: 1,
    attributes: { timestamp: "2025-05-08T01:29:36.16Z" },
    relationships: { instance: { data: { type: "betaFeedbackScreenshotSubmissions", id: "AD8JvKbr0BK0Cj9OnM6WO6I" } } },
  },
};

test("signed TestFlight screenshot feedback is mailed; unsigned or mis-signed is refused", async () => {
  const body = JSON.stringify(appleScreenshot);
  const sig = "hmacsha256=" + (await hmacHex(env.APPSTORE_WEBHOOK_SECRET, body));
  const box = outbox();
  const res = await handle(post("/appstore", body, { "x-apple-signature": sig }), env, box.send);
  assert.equal(res.status, 202);
  const m = decode(box.sent[0]);
  assert.equal(m.subject, "[TestFlight] New screenshot feedback");
  assert.match(m.text, /AD8JvKbr0BK0Cj9OnM6WO6I/);
  assert.match(m.text, /TestFlight, then Feedback/);
  for (const headers of [{}, { "x-apple-signature": "hmacsha256=" + "0".repeat(64) }, { "x-apple-signature": sig.replace("hmacsha256=", "") }]) {
    const b = outbox();
    const r = await handle(post("/appstore", body, headers), env, b.send);
    assert.equal(r.status, 401);
    assert.equal(b.sent.length, 0);
  }
  const tampered = body.replace("Screenshot", "Crash");
  const b = outbox();
  assert.equal((await handle(post("/appstore", tampered, { "x-apple-signature": sig }), env, b.send)).status, 401);
});

test("crash feedback and notifications this file does not know are still mailed", () => {
  const crash = { data: { ...appleScreenshot.data, type: "betaFeedbackCrashSubmissionCreated", relationships: { instance: { data: { type: "betaFeedbackCrashSubmissions", id: "AK7UjG" } } } } };
  assert.equal(fromAppStore(crash).subject, "[TestFlight] New crash feedback");
  const other = { data: { type: "buildBetaDetailExternalBuildStateUpdated", attributes: { newExternalBuildState: "BETA_APPROVED" }, relationships: { instance: { data: { type: "buildBetaDetails", id: "x" } } } } };
  const m = fromAppStore(other);
  assert.equal(m.subject, "[App Store Connect] buildBetaDetailExternalBuildStateUpdated");
  assert.match(m.text, /BETA_APPROVED/);
  assert.equal(fromAppStore({}), null);
});

test("a send that fails answers 502 so the sender retries", async () => {
  const res = await handle(post("/huggingface", JSON.stringify(hfDiscussion), { "x-webhook-secret": env.HF_WEBHOOK_SECRET }), env, async () => { throw new Error("binding down"); });
  assert.equal(res.status, 502);
});

test("only the two webhook paths answer, and only to POST", async () => {
  const box = outbox();
  assert.equal((await handle(new Request("https://inbox.example/"), env, box.send)).status, 200);
  assert.equal((await handle(new Request("https://inbox.example/elsewhere", { method: "POST", body: "{}" }), env, box.send)).status, 404);
  assert.equal((await handle(new Request("https://inbox.example/huggingface"), env, box.send)).status, 405);
  assert.equal((await handle(post("/huggingface", "x".repeat((1 << 20) + 1), { "x-webhook-secret": env.HF_WEBHOOK_SECRET }), env, box.send)).status, 413);
  assert.equal((await handle(post("/huggingface", "{not json", { "x-webhook-secret": env.HF_WEBHOOK_SECRET }), env, box.send)).status, 400);
  assert.equal(box.sent.length, 0);
});

test("non-ASCII text survives the message", () => {
  const raw = mime({ from: env.FROM, to: env.TO, subject: "Leçon 3 — canard 🦆", text: "Très bien, merci.\nÇa marche." });
  const m = decode(raw);
  assert.equal(m.subject, "Leçon 3 — canard 🦆");
  assert.equal(m.text, "Très bien, merci.\nÇa marche.");
  for (const line of raw.split("\r\n")) assert.ok(line.length <= 998, "no line longer than RFC 5322 allows");
});
