export interface AgentMailboxOptions {
  baseUrl: string;
  apiKey: string;
}

export class AgentMailbox {
  private readonly baseUrl: string;
  private readonly apiKey: string;

  constructor(options: AgentMailboxOptions) {
    this.baseUrl = options.baseUrl.replace(/\/$/, "");
    this.apiKey = options.apiKey;
  }

  private async request(path: string, init: RequestInit = {}) {
    const response = await fetch(`${this.baseUrl}${path}`, {
      ...init,
      headers: {
        authorization: `Bearer ${this.apiKey}`,
        "content-type": "application/json",
        ...(init.headers ?? {})
      }
    });
    if (!response.ok) throw new Error(await response.text());
    return response.json();
  }

  createInbox(name: string) {
    return this.request("/inboxes", { method: "POST", body: JSON.stringify({ name }) });
  }

  listInboxes() {
    return this.request("/inboxes");
  }

  sendMessage(
    inboxId: string,
    message: { to: string; subject: string; body: string; html?: string }
  ) {
    return this.request(`/inboxes/${inboxId}/messages`, {
      method: "POST",
      body: JSON.stringify(message)
    });
  }

  getMessage(messageId: string) {
    return this.request(`/messages/${messageId}`);
  }

  listThreads(inboxId: string) {
    return this.request(`/inboxes/${inboxId}/threads`);
  }

  audit() {
    return this.request("/audit");
  }
}
