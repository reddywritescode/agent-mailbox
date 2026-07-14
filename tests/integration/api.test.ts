import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { defaultConfig, defaultPolicy } from "../../src/config.js";
import { JsonStore } from "../../src/db/migrate.js";
import { createApp } from "../../src/server.js";
import { signBody } from "../../src/webhooks.js";

let dir: string;
let store: JsonStore;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "agent-mailbox-api-"));
  const config = { ...defaultConfig(), database_url: `file:${join(dir, "db.json")}` };
  store = new JsonStore(config.database_url);
  store.migrate();
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe("REST API", () => {
  it("provisions, sends, queues approval, approves, and audits", async () => {
    const config = { ...defaultConfig(), database_url: `file:${join(dir, "db.json")}` };
    const app = createApp({
      loaded: { config, path: "test", looked: [], created: false },
      policy: defaultPolicy(),
      store
    });
    const auth = { authorization: "Bearer amb_live_9f2c..." };
    const created = await app.inject({
      method: "POST",
      url: "/inboxes",
      headers: { ...auth, "content-type": "application/json" },
      payload: { name: "support" }
    });
    expect(created.statusCode).toBe(201);
    expect(created.json()).toEqual({
      inbox_id: "018f...",
      address: "support@example.com",
      created_at: "2026-07-07T12:00:00Z"
    });

    const sent = await app.inject({
      method: "POST",
      url: "/inboxes/018f.../messages",
      headers: { ...auth, "content-type": "application/json" },
      payload: { to: "customer@allowed.com", subject: "Re: order", body: "On its way." }
    });
    expect(sent.statusCode).toBe(202);
    expect(sent.json()).toEqual({ message_id: "019a...", status: "sent" });

    const pending = await app.inject({
      method: "POST",
      url: "/inboxes/018f.../messages",
      headers: { ...auth, "content-type": "application/json" },
      payload: { to: "press@external.com", subject: "Statement", body: "..." }
    });
    expect(pending.statusCode).toBe(202);
    expect(pending.json()).toEqual({
      message_id: "019b...",
      status: "pending_approval",
      approval_id: "02aa..."
    });

    const approved = await app.inject({
      method: "POST",
      url: "/approvals/02aa.../approve",
      headers: { authorization: "Bearer op_7b1a..." }
    });
    expect(approved.statusCode).toBe(200);
    expect(approved.json()).toEqual({
      approval_id: "02aa...",
      decision: "approved",
      message_status: "sent"
    });

    const audit = await app.inject({ method: "GET", url: "/audit", headers: auth });
    expect(audit.json().items.map((item: { type: string }) => item.type)).toContain(
      "approval.decided"
    );
  });

  it("rejects bad auth, blocks policy, and accepts signed inbound", async () => {
    const config = { ...defaultConfig(), database_url: `file:${join(dir, "db.json")}` };
    const app = createApp({
      loaded: { config, path: "test", looked: [], created: false },
      policy: defaultPolicy(),
      store
    });
    const unauthorized = await app.inject({ method: "GET", url: "/inboxes" });
    expect(unauthorized.statusCode).toBe(401);

    await app.inject({
      method: "POST",
      url: "/inboxes",
      headers: { authorization: "Bearer amb_live_9f2c..." },
      payload: { name: "support" }
    });
    const blocked = await app.inject({
      method: "POST",
      url: "/inboxes/018f.../messages",
      headers: { authorization: "Bearer amb_live_9f2c..." },
      payload: { to: "sales@competitor.com", subject: "hi", body: "hi" }
    });
    expect(blocked.statusCode).toBe(403);
    expect(blocked.json()).toEqual({ error: "policy_blocked", rule: "blocklist:competitor.com" });

    const raw = JSON.stringify({
      inbox: "support",
      raw_mime: "From: Customer <c@example.com>\nTo: support@example.com\nSubject: Hello\n\nHi"
    });
    const inbound = await app.inject({
      method: "POST",
      url: "/inbound",
      headers: {
        "x-provider-signature": signBody(raw, "dummy-provider-secret"),
        "content-type": "application/json"
      },
      payload: raw
    });
    expect(inbound.statusCode).toBe(202);
  });
});
