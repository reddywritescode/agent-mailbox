import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { FIXED_TIME } from "../constants.js";
import { dbPathFromUrl } from "../config.js";
import type {
  ApprovalRow,
  AttachmentRow,
  AuditRow,
  InboxRow,
  MessageRow,
  ThreadRow
} from "./schema.js";

export interface MailboxState {
  __migrations: string[];
  counters: Record<string, number>;
  inboxes: InboxRow[];
  threads: ThreadRow[];
  messages: MessageRow[];
  attachments: AttachmentRow[];
  approvals: ApprovalRow[];
  audit: AuditRow[];
}

export const emptyState = (): MailboxState => ({
  __migrations: ["0001_initial"],
  counters: {},
  inboxes: [],
  threads: [],
  messages: [],
  attachments: [],
  approvals: [],
  audit: []
});

export class JsonStore {
  readonly path: string;
  state: MailboxState;

  constructor(databaseUrl: string) {
    this.path = dbPathFromUrl(databaseUrl);
    this.state = emptyState();
  }

  migrate(): void {
    mkdirSync(dirname(this.path), { recursive: true });
    if (existsSync(this.path)) {
      const text = readFileSync(this.path, "utf8").trim();
      this.state = text ? ({ ...emptyState(), ...JSON.parse(text) } as MailboxState) : emptyState();
    } else {
      this.state = emptyState();
      this.persist();
    }
    if (!this.state.__migrations.includes("0001_initial")) {
      this.state.__migrations.push("0001_initial");
      this.persist();
    }
  }

  persist(): void {
    mkdirSync(dirname(this.path), { recursive: true });
    writeFileSync(this.path, `${JSON.stringify(this.state, null, 2)}\n`, "utf8");
  }

  nextId(prefix: string): string {
    const current = this.state.counters[prefix] ?? 0;
    this.state.counters[prefix] = current + 1;
    if (prefix === "inbox" && current === 0) return "018f...";
    if (prefix === "message" && current === 0) return "019a...";
    if (prefix === "message" && current === 1) return "019b...";
    if (prefix === "approval" && current === 0) return "02aa...";
    return `${prefix}_${String(current + 1).padStart(6, "0")}`;
  }

  now(): string {
    return process.env.AGENT_MAILBOX_REAL_TIME === "1" ? new Date().toISOString() : FIXED_TIME;
  }
}
