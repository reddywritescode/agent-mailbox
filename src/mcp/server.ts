#!/usr/bin/env node
import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { loadConfig, loadPolicy } from "../config.js";
import { JsonStore } from "../db/migrate.js";
import { evaluatePolicy } from "../policy.js";
import { sendMessageSchema } from "../schemas.js";

const loaded = loadConfig(undefined, true);
const policy = loadPolicy(loaded.config.policy_file);
const store = new JsonStore(loaded.config.database_url);
store.migrate();

async function handle(tool: string, args: Record<string, unknown>) {
  if (tool === "create_inbox") {
    const name = String(args.name);
    const inbox = {
      id: store.nextId("inbox"),
      name,
      address: `${name}@${loaded.config.domain}`,
      created_at: store.now()
    };
    store.state.inboxes.push(inbox);
    store.persist();
    return { inbox_id: inbox.id, address: inbox.address };
  }
  if (tool === "list_inboxes") {
    return store.state.inboxes.map((inbox) => ({ inbox_id: inbox.id, address: inbox.address }));
  }
  if (tool === "list_messages") {
    return store.state.messages.filter(
      (message) =>
        message.inbox_id === args.inbox_id &&
        (!args.thread_id || message.thread_id === args.thread_id)
    );
  }
  if (tool === "get_message") {
    return store.state.messages.find((message) => message.id === args.message_id) ?? null;
  }
  if (tool === "send_message") {
    const inbox = store.state.inboxes.find((row) => row.id === args.inbox_id);
    if (!inbox) return { error: "not_found" };
    const parsed = sendMessageSchema.parse(args);
    const decision = evaluatePolicy(policy, parsed, store, inbox.id);
    if (decision.action === "block") return { error: "policy_blocked", rule: decision.rule };
    return {
      message_id: store.nextId("message"),
      status: decision.action === "require_approval" ? "pending_approval" : "sent",
      approval_id: decision.action === "require_approval" ? store.nextId("approval") : undefined
    };
  }
  if (tool === "list_pending_approvals") {
    return store.state.approvals.filter((approval) => approval.status === "pending");
  }
  return { error: "not_found" };
}

async function main() {
  const rl = createInterface({ input, output });
  for await (const line of rl) {
    if (!line.trim()) continue;
    const request = JSON.parse(line) as {
      id?: string;
      tool: string;
      arguments?: Record<string, unknown>;
    };
    const result = await handle(request.tool, request.arguments ?? {});
    console.log(JSON.stringify({ id: request.id, result }));
  }
}

void main();
