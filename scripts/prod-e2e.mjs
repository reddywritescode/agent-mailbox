import crypto from "node:crypto";

const baseUrl = process.env.AGENT_MAILBOX_BASE_URL?.replace(/\/$/, "");
const apiKey = process.env.AGENT_MAILBOX_API_KEY;
const operatorToken = process.env.AGENT_MAILBOX_OPERATOR_TOKEN;

if (!baseUrl || !apiKey || !operatorToken) {
  console.error(
    "Set AGENT_MAILBOX_BASE_URL, AGENT_MAILBOX_API_KEY, and AGENT_MAILBOX_OPERATOR_TOKEN."
  );
  process.exit(2);
}

async function request(path, init = {}) {
  const response = await fetch(`${baseUrl}${path}`, init);
  const text = await response.text();
  return { response, text };
}

function expectStatus(label, actual, expected) {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${expected}, got ${actual}`);
  }
}

const apiHeaders = {
  authorization: `Bearer ${apiKey}`,
  "content-type": "application/json"
};

const health = await request("/health");
expectStatus("health", health.response.status, 200);
console.log(`health ${health.text}`);

const ready = await request("/readyz");
expectStatus("readyz", ready.response.status, 200);
console.log(`readyz ${ready.text}`);

const suffix = Math.random().toString(36).slice(2, 8);
const inboxName = `support-${suffix}`;
const inbox = await request("/inboxes", {
  method: "POST",
  headers: apiHeaders,
  body: JSON.stringify({ name: inboxName })
});
expectStatus("create inbox", inbox.response.status, 201);
const inboxJson = JSON.parse(inbox.text);
console.log(`inbox ${JSON.stringify(inboxJson)}`);

const sent = await request(`/inboxes/${inboxJson.inbox_id}/messages`, {
  method: "POST",
  headers: apiHeaders,
  body: JSON.stringify({ to: "customer@allowed.com", subject: "Re: order", body: "On its way." })
});
expectStatus("allowed send", sent.response.status, 202);
console.log(`sent ${sent.text}`);

const pending = await request(`/inboxes/${inboxJson.inbox_id}/messages`, {
  method: "POST",
  headers: apiHeaders,
  body: JSON.stringify({ to: "press@external.com", subject: "Statement", body: "..." })
});
expectStatus("pending send", pending.response.status, 202);
const pendingJson = JSON.parse(pending.text);
console.log(`pending ${pending.text}`);

const approved = await request(`/approvals/${pendingJson.approval_id}/approve`, {
  method: "POST",
  headers: { authorization: `Bearer ${operatorToken}` }
});
expectStatus("approve", approved.response.status, 200);
console.log(`approved ${approved.text}`);

const blocked = await request(`/inboxes/${inboxJson.inbox_id}/messages`, {
  method: "POST",
  headers: apiHeaders,
  body: JSON.stringify({ to: "sales@competitor.com", subject: "hi", body: "hi" })
});
expectStatus("blocked send", blocked.response.status, 403);
console.log(`blocked ${blocked.text}`);

const inboundBody = JSON.stringify({
  inbox: inboxName,
  raw_mime: `From: Customer <c@example.com>\nTo: ${inboxJson.address}\nSubject: Need help\nMessage-ID: <prod-${suffix}@example.com>\n\nCan you help?`
});
const signature = crypto
  .createHmac("sha256", process.env.PROVIDER_WEBHOOK_SECRET || "dummy-provider-secret")
  .update(inboundBody)
  .digest("hex");
const inbound = await request("/inbound", {
  method: "POST",
  headers: { "content-type": "application/json", "x-provider-signature": signature },
  body: inboundBody
});
expectStatus("inbound", inbound.response.status, 202);
console.log(`inbound ${inbound.text}`);

const inboundJson = JSON.parse(inbound.text);
const message = await request(`/messages/${inboundJson.message_id}`, {
  headers: { authorization: `Bearer ${apiKey}` }
});
expectStatus("get inbound message", message.response.status, 200);
console.log(`message ${message.text}`);

console.log("prod e2e passed");
