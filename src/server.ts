import Fastify, { type FastifyInstance, type FastifyReply, type FastifyRequest } from "fastify";
import { VERSION } from "./constants.js";
import { loadConfig, loadPolicy, type LoadedConfig } from "./config.js";
import { JsonStore } from "./db/migrate.js";
import type { ApprovalRow, InboxRow, MessageRow, ThreadRow } from "./db/schema.js";
import { writeAudit } from "./audit.js";
import { renderApprovals } from "./console.js";
import { dispatchMessage } from "./mail/send.js";
import { parseInbound } from "./mail/parse.js";
import { evaluatePolicy } from "./policy.js";
import {
  auditQuerySchema,
  createInboxSchema,
  errorTaxonomy,
  formatZodDetail,
  inboundWebhookSchema,
  paginationQuerySchema,
  sendMessageSchema,
  type MailboxConfig,
  type MailboxPolicy
} from "./schemas.js";
import { emitWebhook, verifySignature } from "./webhooks.js";

export interface AppContext {
  loaded: LoadedConfig;
  policy: MailboxPolicy;
  store: JsonStore;
}

export function error(reply: FastifyReply, code: keyof typeof errorTaxonomy, extra: object = {}) {
  const meta = errorTaxonomy[code];
  return reply.code(meta.http).send({ error: code, ...extra });
}

function authHeader(request: FastifyRequest): string {
  const raw = request.headers.authorization || "";
  return Array.isArray(raw) ? raw[0] : raw;
}

function requireAuth(scope: "api" | "operator", config: MailboxConfig) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const expected = scope === "api" ? config.api_key : config.operator_token;
    const token = authHeader(request).replace(/^Bearer\s+/i, "");
    if (token !== expected) return error(reply, "unauthorized");
    return undefined;
  };
}

function page<T extends { id: string }>(items: T[], limit: number, cursor?: string) {
  const start = cursor ? Math.max(items.findIndex((item) => item.id === cursor) + 1, 0) : 0;
  const sliced = items.slice(start, start + limit);
  return { items: sliced, next_cursor: items[start + limit]?.id ?? null };
}

async function sendOrQueue(
  store: JsonStore,
  policy: MailboxPolicy,
  config: MailboxConfig,
  inbox: InboxRow,
  body: unknown
) {
  const parsed = sendMessageSchema.parse(body);
  const decision = evaluatePolicy(policy, parsed, store, inbox.id);
  const message: MessageRow = {
    id: store.nextId("message"),
    inbox_id: inbox.id,
    direction: "outbound",
    status:
      decision.action === "allow"
        ? "sent"
        : decision.action === "block"
          ? "failed"
          : "pending_approval",
    mail_from: inbox.address,
    mail_to: parsed.to,
    cc: parsed.cc?.join(","),
    subject: parsed.subject,
    text_body: parsed.body,
    html_body: parsed.html,
    in_reply_to: parsed.in_reply_to,
    created_at: store.now(),
    updated_at: store.now()
  };

  if (decision.action === "block") {
    writeAudit(store, "send.blocked", {
      inbox_id: inbox.id,
      message_id: message.id,
      actor: "api",
      detail: { rule: decision.rule }
    });
    return { blocked: true as const, rule: decision.rule };
  }

  store.state.messages.push(message);
  if (decision.action === "require_approval") {
    const approval: ApprovalRow = {
      id: store.nextId("approval"),
      message_id: message.id,
      status: "pending",
      rule: decision.rule,
      created_at: store.now()
    };
    store.state.approvals.push(approval);
    writeAudit(store, "approval.requested", {
      inbox_id: inbox.id,
      message_id: message.id,
      actor: "api",
      detail: { approval_id: approval.id, rule: decision.rule }
    });
    await emitWebhook(config.webhook_url, "approval.requested", { approval_id: approval.id });
    return { pending: true as const, message, approval };
  }

  await dispatchMessage(message, config);
  writeAudit(store, "message.sent", { inbox_id: inbox.id, message_id: message.id, actor: "api" });
  await emitWebhook(config.webhook_url, "message.sent", { message_id: message.id });
  store.persist();
  return { sent: true as const, message };
}

export function createApp(context?: Partial<AppContext>): FastifyInstance {
  const loaded = context?.loaded ?? loadConfig(undefined, true);
  const policy = context?.policy ?? loadPolicy(loaded.config.policy_file);
  const store = context?.store ?? new JsonStore(loaded.config.database_url);
  store.migrate();
  const app = Fastify({ logger: false });
  app.addContentTypeParser("message/rfc822", { parseAs: "string" }, (_request, body, done) =>
    done(null, body)
  );

  const health = async () => ({ status: "ok", version: VERSION });
  app.get("/healthz", health);
  app.get("/health", health);
  app.get("/readyz", async () => ({ status: "ok", db: "reachable" }));

  app.post(
    "/inboxes",
    { preHandler: requireAuth("api", loaded.config) },
    async (request, reply) => {
      const parsed = createInboxSchema.safeParse(request.body);
      if (!parsed.success)
        return error(reply, "validation_error", { detail: formatZodDetail(parsed.error) });
      if (
        store.state.inboxes.some((inbox) => inbox.name === parsed.data.name && !inbox.deleted_at)
      ) {
        return error(reply, "conflict");
      }
      const inbox: InboxRow = {
        id: store.nextId("inbox"),
        name: parsed.data.name,
        address: `${parsed.data.name}@${loaded.config.domain}`,
        created_at: store.now()
      };
      store.state.inboxes.push(inbox);
      writeAudit(store, "inbox.created", { inbox_id: inbox.id, actor: "api" });
      return reply
        .code(201)
        .send({ inbox_id: inbox.id, address: inbox.address, created_at: inbox.created_at });
    }
  );

  app.get("/inboxes", { preHandler: requireAuth("api", loaded.config) }, async (request) => {
    const query = paginationQuerySchema.parse(request.query);
    return page(
      store.state.inboxes.filter((inbox) => !inbox.deleted_at),
      query.limit,
      query.cursor
    );
  });

  app.get(
    "/inboxes/:id",
    { preHandler: requireAuth("api", loaded.config) },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const inbox = store.state.inboxes.find((row) => row.id === id || row.name === id);
      if (!inbox || inbox.deleted_at) return error(reply, "not_found");
      return inbox;
    }
  );

  app.delete(
    "/inboxes/:id",
    { preHandler: requireAuth("api", loaded.config) },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const inbox = store.state.inboxes.find((row) => row.id === id || row.name === id);
      if (!inbox) return error(reply, "not_found");
      inbox.deleted_at = store.now();
      writeAudit(store, "inbox.deleted", { inbox_id: inbox.id, actor: "api" });
      return reply.code(204).send();
    }
  );

  app.post(
    "/inboxes/:id/messages",
    { preHandler: requireAuth("api", loaded.config) },
    async (request, reply) => {
      try {
        const { id } = request.params as { id: string };
        const inbox = store.state.inboxes.find((row) => row.id === id || row.name === id);
        if (!inbox || inbox.deleted_at) return error(reply, "not_found");
        const result = await sendOrQueue(store, policy, loaded.config, inbox, request.body);
        if ("blocked" in result) return error(reply, "policy_blocked", { rule: result.rule });
        if ("pending" in result && result.pending) {
          return reply.code(202).send({
            message_id: result.message.id,
            status: "pending_approval",
            approval_id: result.approval.id
          });
        }
        return reply.code(202).send({ message_id: result.message.id, status: "sent" });
      } catch (caught) {
        if (caught instanceof Error && caught.name === "ZodError")
          return error(reply, "validation_error");
        return error(reply, "provider_error");
      }
    }
  );

  app.get(
    "/inboxes/:id/threads",
    { preHandler: requireAuth("api", loaded.config) },
    async (request) => {
      const { id } = request.params as { id: string };
      const query = paginationQuerySchema.parse(request.query);
      return page(
        store.state.threads.filter((thread) => thread.inbox_id === id),
        query.limit,
        query.cursor
      );
    }
  );

  app.get(
    "/threads/:id",
    { preHandler: requireAuth("api", loaded.config) },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const thread = store.state.threads.find((row) => row.id === id);
      if (!thread) return error(reply, "not_found");
      return {
        ...thread,
        messages: store.state.messages.filter((message) => message.thread_id === id)
      };
    }
  );

  app.get(
    "/messages/:id",
    { preHandler: requireAuth("api", loaded.config) },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const message = store.state.messages.find((row) => row.id === id);
      if (!message) return error(reply, "not_found");
      return message;
    }
  );

  app.post(
    "/messages/:id/retry",
    { preHandler: requireAuth("api", loaded.config) },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const message = store.state.messages.find((row) => row.id === id);
      if (!message) return error(reply, "not_found");
      try {
        await dispatchMessage(message, loaded.config);
        message.status = "sent";
        message.updated_at = store.now();
        writeAudit(store, "message.sent", {
          inbox_id: message.inbox_id,
          message_id: message.id,
          actor: "api"
        });
        return reply.code(202).send({ message_id: message.id, status: "sent" });
      } catch {
        message.status = "failed";
        return error(reply, "provider_error");
      }
    }
  );

  app.post("/inbound", async (request, reply) => {
    const raw =
      typeof request.body === "string" ? request.body : JSON.stringify(request.body ?? {});
    const secret = process.env.PROVIDER_WEBHOOK_SECRET || "dummy-provider-secret";
    if (
      !verifySignature(raw, request.headers["x-provider-signature"] as string | undefined, secret)
    ) {
      return error(reply, "unauthorized");
    }
    const inbound = inboundWebhookSchema.parse(
      typeof request.body === "string" ? JSON.parse(request.body) : request.body
    );
    const parsed = await parseInbound(inbound.raw_mime);
    const inbox = store.state.inboxes.find(
      (row) => parsed.to.includes(row.address) || row.name === inbound.inbox
    );
    if (!inbox) return error(reply, "not_found");
    const thread: ThreadRow = {
      id: store.nextId("thread"),
      inbox_id: inbox.id,
      subject: parsed.subject,
      root_message_id: parsed.messageId,
      updated_at: store.now()
    };
    const message: MessageRow = {
      id: store.nextId("message"),
      inbox_id: inbox.id,
      thread_id: thread.id,
      direction: "inbound",
      status: "received",
      mail_from: parsed.from,
      mail_to: parsed.to,
      subject: parsed.subject,
      text_body: parsed.text,
      html_body: parsed.html,
      headers_json: JSON.stringify(parsed.headers),
      message_id_header: parsed.messageId,
      in_reply_to: parsed.inReplyTo,
      created_at: store.now(),
      updated_at: store.now()
    };
    store.state.threads.push(thread);
    store.state.messages.push(message);
    writeAudit(store, "message.received", {
      inbox_id: inbox.id,
      message_id: message.id,
      actor: "provider"
    });
    await emitWebhook(loaded.config.webhook_url, "message.received", { message_id: message.id });
    return reply.code(202).send({ message_id: message.id, status: "received" });
  });

  app.get("/approvals", { preHandler: requireAuth("operator", loaded.config) }, async () => ({
    items: store.state.approvals.filter((approval) => approval.status === "pending"),
    next_cursor: null
  }));

  app.post(
    "/approvals/:id/approve",
    { preHandler: requireAuth("operator", loaded.config) },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const approval = store.state.approvals.find((row) => row.id === id);
      if (!approval) return error(reply, "not_found");
      const message = store.state.messages.find((row) => row.id === approval.message_id);
      if (!message) return error(reply, "not_found");
      approval.status = "approved";
      approval.decided_by = "operator";
      approval.decided_at = store.now();
      message.status = "sent";
      message.updated_at = store.now();
      await dispatchMessage(message, loaded.config);
      writeAudit(store, "approval.decided", {
        inbox_id: message.inbox_id,
        message_id: message.id,
        actor: "operator"
      });
      await emitWebhook(loaded.config.webhook_url, "approval.decided", {
        approval_id: approval.id
      });
      return reply.send({ approval_id: approval.id, decision: "approved", message_status: "sent" });
    }
  );

  app.post(
    "/approvals/:id/deny",
    { preHandler: requireAuth("operator", loaded.config) },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const approval = store.state.approvals.find((row) => row.id === id);
      if (!approval) return error(reply, "not_found");
      const message = store.state.messages.find((row) => row.id === approval.message_id);
      if (message) message.status = "denied";
      approval.status = "denied";
      approval.decided_by = "operator";
      approval.decided_at = store.now();
      writeAudit(store, "approval.decided", { message_id: approval.message_id, actor: "operator" });
      return reply.send({ approval_id: approval.id, decision: "denied", message_status: "denied" });
    }
  );

  app.post("/policy/reload", { preHandler: requireAuth("operator", loaded.config) }, async () => {
    const reloaded = loadPolicy(loaded.config.policy_file);
    Object.assign(policy, reloaded);
    return { status: "ok" };
  });

  app.get("/audit", { preHandler: requireAuth("api", loaded.config) }, async (request) => {
    const query = auditQuerySchema.parse(request.query);
    const rows = store.state.audit.filter((row) => {
      if (query.type && row.type !== query.type) return false;
      if (query.inbox && row.inbox_id !== query.inbox) return false;
      if (query.since && row.created_at < query.since) return false;
      return true;
    });
    return page(rows, query.limit, query.cursor);
  });

  app.get(
    "/console/approvals",
    { preHandler: requireAuth("operator", loaded.config) },
    async (_request, reply) =>
      reply.type("text/html").send(renderApprovals(store.state.approvals, store.state.messages))
  );

  app.decorate("mailbox", { loaded, policy, store });
  return app;
}

export async function startServer(options: { port?: number; configPath?: string } = {}) {
  const loaded = loadConfig(options.configPath, true);
  const app = createApp({ loaded });
  const port = options.port || loaded.config.port;
  await app.listen({ port, host: "0.0.0.0" });
  return app;
}
