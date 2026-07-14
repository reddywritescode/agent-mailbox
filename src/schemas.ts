import { z } from "zod";

export const inboxNameSchema = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[a-z0-9][a-z0-9-]*$/);

export const createInboxSchema = z.object({
  name: inboxNameSchema
});

export const attachmentInputSchema = z.object({
  filename: z.string().min(1),
  content_base64: z.string().min(1),
  content_type: z.string().min(1)
});

export const sendMessageSchema = z.object({
  to: z.string().email(),
  cc: z.array(z.string().email()).optional(),
  subject: z.string().min(1).max(998),
  body: z.string(),
  html: z.string().optional(),
  in_reply_to: z.string().optional(),
  attachments: z.array(attachmentInputSchema).optional()
});

export const inboundWebhookSchema = z.object({
  inbox: z.string().min(1),
  raw_mime: z.string().min(1)
});

export const paginationQuerySchema = z.object({
  limit: z.coerce.number().int().positive().max(200).default(50),
  cursor: z.string().optional()
});

export const auditQuerySchema = paginationQuerySchema.extend({
  type: z.string().optional(),
  inbox: z.string().optional(),
  since: z.string().optional()
});

export const policySchema = z.object({
  default_action: z.enum(["allow", "require_approval", "block"]).default("allow"),
  allowlist_domains: z.array(z.string()).default(["allowed.com"]),
  blocklist_domains: z.array(z.string()).default(["competitor.com"]),
  require_approval_for: z
    .object({
      external_domains: z.boolean().default(true),
      contains_keywords: z.array(z.string()).default(["refund", "pricing", "legal"])
    })
    .default({ external_domains: true, contains_keywords: ["refund", "pricing", "legal"] }),
  caps: z
    .object({
      per_inbox_per_day: z.number().int().positive(),
      per_inbox_per_hour: z.number().int().positive()
    })
    .default({ per_inbox_per_day: 200, per_inbox_per_hour: 50 })
});

export const configSchema = z.object({
  port: z.number().int().positive().default(8081),
  domain: z.string().min(1).default("example.com"),
  database_url: z.string().min(1).default("file:./data/agent-mailbox.db"),
  provider: z
    .object({
      type: z.enum(["smtp", "ses"]).default("smtp"),
      smtp: z
        .object({
          host: z.string().default(""),
          port: z.number().int().positive().default(587),
          user: z.string().default(""),
          pass_env: z.string().default("SMTP_PASS")
        })
        .default({ host: "", port: 587, user: "", pass_env: "SMTP_PASS" })
    })
    .default({ type: "smtp", smtp: { host: "", port: 587, user: "", pass_env: "SMTP_PASS" } }),
  webhook_url: z.string().default(""),
  smtp_listener: z
    .object({
      enabled: z.boolean().default(false),
      port: z.number().int().positive().default(2525)
    })
    .default({ enabled: false, port: 2525 }),
  policy_file: z.string().default("./policy.yaml"),
  api_key: z.string().default("amb_live_9f2c..."),
  operator_token: z.string().default("op_7b1a...")
});

export type CreateInboxInput = z.infer<typeof createInboxSchema>;
export type SendMessageInput = z.infer<typeof sendMessageSchema>;
export type MailboxPolicy = z.infer<typeof policySchema>;
export type MailboxConfig = z.infer<typeof configSchema>;

export type ErrorCode =
  | "unauthorized"
  | "not_found"
  | "validation_error"
  | "policy_blocked"
  | "provider_error"
  | "rate_limited"
  | "conflict";

export const errorTaxonomy: Record<ErrorCode, { http: number; exit: number; remediation: string }> =
  {
    unauthorized: { http: 401, exit: 4, remediation: "check Authorization" },
    not_found: { http: 404, exit: 1, remediation: "verify id" },
    validation_error: { http: 400, exit: 2, remediation: "see detail[]" },
    policy_blocked: { http: 403, exit: 3, remediation: "see rule; adjust policy" },
    provider_error: { http: 502, exit: 5, remediation: "check provider creds; retry" },
    rate_limited: { http: 429, exit: 1, remediation: "wait / raise cap" },
    conflict: { http: 409, exit: 1, remediation: "pick another name" }
  };

export function formatZodDetail(error: z.ZodError): string[] {
  return error.issues.map((issue) => `${issue.path.join(".") || "body"}: ${issue.message}`);
}
