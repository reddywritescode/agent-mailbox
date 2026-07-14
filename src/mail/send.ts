import type { MessageRow } from "../db/schema.js";
import type { MailboxConfig } from "../schemas.js";
import nodemailer from "nodemailer";

export interface ProviderResult {
  provider_id: string;
}

export async function dispatchMessage(
  message: MessageRow,
  config?: Pick<MailboxConfig, "provider">
): Promise<ProviderResult> {
  if (process.env.AGENT_MAILBOX_FORCE_PROVIDER_ERROR === "1") {
    throw new Error("provider_error");
  }
  const smtp = config?.provider.smtp;
  const host = process.env.SMTP_HOST || smtp?.host;
  const user = process.env.SMTP_USER || smtp?.user;
  const passEnv = smtp?.pass_env || "SMTP_PASS";
  const pass = process.env[passEnv] || process.env.SMTP_PASS;
  if (host && user && pass) {
    const transport = nodemailer.createTransport({
      host,
      port: Number(process.env.SMTP_PORT || smtp?.port || 587),
      secure: process.env.SMTP_SECURE === "true",
      auth: { user, pass }
    });
    const result = await transport.sendMail({
      from: message.mail_from,
      to: message.mail_to,
      cc: message.cc,
      subject: message.subject,
      text: message.text_body,
      html: message.html_body
    });
    return { provider_id: String(result.messageId || result.response || `smtp-${message.id}`) };
  }
  return { provider_id: `mock-${message.id}` };
}
