import type { ApprovalRow, MessageRow } from "./db/schema.js";

export function renderApprovals(approvals: ApprovalRow[], messages: MessageRow[]): string {
  const rows = approvals
    .filter((approval) => approval.status === "pending")
    .map((approval) => {
      const message = messages.find((row) => row.id === approval.message_id);
      return `<tr><td>${approval.id}</td><td>${message?.mail_to ?? ""}</td><td>${message?.subject ?? ""}</td><td>${approval.rule ?? ""}</td><td><form method="post" action="/approvals/${approval.id}/approve"><button>Approve</button></form><form method="post" action="/approvals/${approval.id}/deny"><button>Deny</button></form></td></tr>`;
    })
    .join("");
  return `<!doctype html><html><head><title>Agent Mailbox approvals</title><style>body{font-family:system-ui;margin:2rem}table{border-collapse:collapse;width:100%}td,th{border:1px solid #ddd;padding:.5rem}</style></head><body><h1>Approvals</h1><table><thead><tr><th>ID</th><th>To</th><th>Subject</th><th>Rule</th><th>Decision</th></tr></thead><tbody>${rows}</tbody></table></body></html>`;
}
