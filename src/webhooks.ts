import { createHmac, timingSafeEqual } from "node:crypto";

export function signBody(body: string, secret: string): string {
  return createHmac("sha256", secret).update(body).digest("hex");
}

export function verifySignature(
  body: string,
  signature: string | undefined,
  secret: string
): boolean {
  if (!signature || !secret) return false;
  const expected = signBody(body, secret);
  const left = Buffer.from(signature);
  const right = Buffer.from(expected);
  return left.length === right.length && timingSafeEqual(left, right);
}

export async function emitWebhook(
  url: string,
  event: string,
  payload: unknown,
  secret = process.env.WEBHOOK_SIGNING_SECRET || ""
): Promise<{ delivered: boolean; event: string }> {
  if (!url) return { delivered: false, event };
  const body = JSON.stringify({ event, payload });
  await fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-agentmailbox-signature": signBody(body, secret)
    },
    body
  });
  return { delivered: true, event };
}
