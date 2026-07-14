export const ddl = `
CREATE TABLE inboxes (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, address TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL, deleted_at TEXT);
CREATE TABLE threads (
  id TEXT PRIMARY KEY, inbox_id TEXT NOT NULL REFERENCES inboxes(id),
  subject TEXT, root_message_id TEXT, updated_at TEXT NOT NULL);
CREATE TABLE messages (
  id TEXT PRIMARY KEY, inbox_id TEXT NOT NULL REFERENCES inboxes(id),
  thread_id TEXT REFERENCES threads(id), direction TEXT NOT NULL,
  status TEXT NOT NULL,
  mail_from TEXT, mail_to TEXT NOT NULL, cc TEXT, subject TEXT,
  text_body TEXT, html_body TEXT, headers_json TEXT, message_id_header TEXT,
  in_reply_to TEXT, error TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
CREATE TABLE attachments (
  id TEXT PRIMARY KEY, message_id TEXT NOT NULL REFERENCES messages(id),
  filename TEXT, content_type TEXT, size_bytes INTEGER, blob_path TEXT NOT NULL);
CREATE TABLE approvals (
  id TEXT PRIMARY KEY, message_id TEXT NOT NULL REFERENCES messages(id),
  status TEXT NOT NULL,
  rule TEXT, decided_by TEXT, decided_at TEXT, created_at TEXT NOT NULL);
CREATE TABLE audit (
  id TEXT PRIMARY KEY, type TEXT NOT NULL, inbox_id TEXT, message_id TEXT,
  actor TEXT, detail_json TEXT, created_at TEXT NOT NULL);
CREATE INDEX idx_messages_inbox ON messages(inbox_id, created_at);
CREATE INDEX idx_audit_type ON audit(type, created_at);
`;

export interface InboxRow {
  id: string;
  name: string;
  address: string;
  created_at: string;
  deleted_at?: string;
}

export interface ThreadRow {
  id: string;
  inbox_id: string;
  subject?: string;
  root_message_id?: string;
  updated_at: string;
}

export interface MessageRow {
  id: string;
  inbox_id: string;
  thread_id?: string;
  direction: "inbound" | "outbound";
  status: "received" | "queued" | "sending" | "sent" | "failed" | "pending_approval" | "denied";
  mail_from?: string;
  mail_to: string;
  cc?: string;
  subject?: string;
  text_body?: string;
  html_body?: string;
  headers_json?: string;
  message_id_header?: string;
  in_reply_to?: string;
  error?: string;
  created_at: string;
  updated_at: string;
}

export interface AttachmentRow {
  id: string;
  message_id: string;
  filename?: string;
  content_type?: string;
  size_bytes: number;
  blob_path: string;
}

export interface ApprovalRow {
  id: string;
  message_id: string;
  status: "pending" | "approved" | "denied";
  rule?: string;
  decided_by?: string;
  decided_at?: string;
  created_at: string;
}

export interface AuditRow {
  id: string;
  type: string;
  inbox_id?: string;
  message_id?: string;
  actor?: string;
  detail_json?: string;
  created_at: string;
}
