import type { MessageRow } from "../db/schema.js";

export interface ProviderResult {
  provider_id: string;
}

export async function dispatchMessage(message: MessageRow): Promise<ProviderResult> {
  if (process.env.AGENT_MAILBOX_FORCE_PROVIDER_ERROR === "1") {
    throw new Error("provider_error");
  }
  return { provider_id: `mock-${message.id}` };
}
