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
