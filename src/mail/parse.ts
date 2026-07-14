import { simpleParser } from "mailparser";

export interface ParsedInbound {
  from?: string;
  to: string;
  subject?: string;
  text?: string;
  html?: string;
  headers: Record<string, string>;
  messageId?: string;
  inReplyTo?: string;
}

export async function parseInbound(rawMime: string): Promise<ParsedInbound> {
  const parsed = await simpleParser(rawMime);
  const headers: Record<string, string> = {};
  for (const [key, value] of parsed.headers.entries()) {
    headers[key] = String(value);
  }
  const toValue = Array.isArray(parsed.to) ? parsed.to[0]?.text : parsed.to?.text;
  return {
    from: parsed.from?.text,
    to: toValue || "",
    subject: parsed.subject,
    text: parsed.text || "",
    html: typeof parsed.html === "string" ? parsed.html : "",
    headers,
    messageId: parsed.messageId,
    inReplyTo: parsed.inReplyTo
  };
}
