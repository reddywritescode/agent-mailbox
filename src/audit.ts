import type { JsonStore } from "./db/migrate.js";

export function writeAudit(
  store: JsonStore,
  type: string,
  detail: { inbox_id?: string; message_id?: string; actor?: string; detail?: unknown }
): void {
  store.state.audit.push({
    id: store.nextId("audit"),
    type,
    inbox_id: detail.inbox_id,
    message_id: detail.message_id,
    actor: detail.actor,
    detail_json: JSON.stringify(detail.detail ?? {}),
    created_at: store.now()
  });
  store.persist();
}

export function redactSecrets(value: string): string {
  return value
    .replace(/amb_live_[A-Za-z0-9_.-]+/g, "amb_live_[redacted]")
    .replace(/op_[A-Za-z0-9_.-]+/g, "op_[redacted]")
    .replace(/SMTP_PASS=[^\s]+/g, "SMTP_PASS=[redacted]");
}
