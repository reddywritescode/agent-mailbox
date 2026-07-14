import type { JsonStore } from "./db/migrate.js";
import type { MailboxPolicy, SendMessageInput } from "./schemas.js";

export type PolicyDecision =
  | { action: "allow" }
  | { action: "require_approval"; rule: string }
  | { action: "block"; rule: string };

function domainOf(address: string): string {
  return address.split("@").pop()?.toLowerCase() ?? "";
}

function bodyHasKeyword(send: SendMessageInput, keywords: string[]): string | undefined {
  const haystack = `${send.subject} ${send.body} ${send.html ?? ""}`.toLowerCase();
  return keywords.find((keyword) => haystack.includes(keyword.toLowerCase()));
}

export function evaluatePolicy(
  policy: MailboxPolicy,
  send: SendMessageInput,
  store: JsonStore,
  inboxId: string
): PolicyDecision {
  const recipientDomain = domainOf(send.to);
  if (policy.blocklist_domains.map((d) => d.toLowerCase()).includes(recipientDomain)) {
    return { action: "block", rule: `blocklist:${recipientDomain}` };
  }

  const sentToday = store.state.messages.filter(
    (message) =>
      message.inbox_id === inboxId &&
      message.direction === "outbound" &&
      ["sent", "pending_approval"].includes(message.status)
  ).length;
  if (sentToday >= policy.caps.per_inbox_per_day) {
    return { action: "block", rule: "cap:per_inbox_per_day" };
  }

  const keyword = bodyHasKeyword(send, policy.require_approval_for.contains_keywords);
  if (keyword) return { action: "require_approval", rule: `keyword:${keyword}` };

  const allowed = policy.allowlist_domains.map((d) => d.toLowerCase()).includes(recipientDomain);
  if (policy.require_approval_for.external_domains && !allowed) {
    return { action: "require_approval", rule: `external:${recipientDomain}` };
  }

  if (policy.default_action === "block") return { action: "block", rule: "default:block" };
  if (policy.default_action === "require_approval") {
    return { action: "require_approval", rule: "default:require_approval" };
  }
  return { action: "allow" };
}

export function sanitizeFilename(filename: string): string {
  const base = filename.split(/[\\/]/).pop() || "attachment";
  return base.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 120);
}
