#!/usr/bin/env node
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { Command } from "commander";
import { DEFAULT_DB_URL, DEFAULT_PORT, DEMO_API_KEY, DEMO_OPERATOR_TOKEN } from "./constants.js";
import {
  dbPathFromUrl,
  defaultPolicy,
  loadConfig,
  loadPolicy,
  writeDefaultFiles
} from "./config.js";
import { JsonStore } from "./db/migrate.js";
import { evaluatePolicy } from "./policy.js";
import { sendMessageSchema } from "./schemas.js";
import { createApp } from "./server.js";
import YAML from "yaml";

function printFirstRun(configPath = "agent-mailbox.config.yaml", dbUrl = DEFAULT_DB_URL): void {
  console.log(`[agent-mailbox] no config found; wrote ${configPath} (defaults)`);
  console.log(`[agent-mailbox] created ${dbPathFromUrl(dbUrl)}`);
  console.log(
    `[agent-mailbox] API key: ${DEMO_API_KEY} (shown once)  operator token: ${DEMO_OPERATOR_TOKEN} (shown once)`
  );
  console.log(
    `[agent-mailbox] listening on http://0.0.0.0:8081  — set MAILBOX_DOMAIN to send/receive`
  );
}

export async function runCli(argv = process.argv): Promise<void> {
  const program = new Command();
  program.name("agent-mailbox").version("0.1.0");

  program
    .command("init")
    .option("--config <path>", "config path", "agent-mailbox.config.yaml")
    .action((opts: { config: string }) => {
      const loaded = writeDefaultFiles(opts.config);
      const db = new JsonStore(loaded.config.database_url);
      db.migrate();
      printFirstRun(opts.config, loaded.config.database_url);
    });

  program
    .command("serve")
    .option("--port <port>", "HTTP port")
    .option("--config <path>", "config path")
    .action(async (opts: { port?: string; config?: string }) => {
      const loaded = loadConfig(opts.config, true);
      const store = new JsonStore(loaded.config.database_url);
      store.migrate();
      if (loaded.created) printFirstRun("agent-mailbox.config.yaml", loaded.config.database_url);
      const app = createApp({ loaded, store });
      const port = opts.port
        ? Number(opts.port)
        : Number(process.env.PORT || loaded.config.port || DEFAULT_PORT);
      await app.listen({ port, host: "0.0.0.0" });
      process.on("SIGTERM", () => void app.close().then(() => process.exit(0)));
      process.on("SIGINT", () => void app.close().then(() => process.exit(0)));
    });

  program
    .command("send")
    .requiredOption("--inbox <nameOrId>")
    .requiredOption("--to <addr>")
    .requiredOption("--subject <subject>")
    .requiredOption("--body <body>")
    .option("--html <html>")
    .action(
      async (opts: { inbox: string; to: string; subject: string; body: string; html?: string }) => {
        const loaded = loadConfig(undefined, true);
        const store = new JsonStore(loaded.config.database_url);
        store.migrate();
        const policy = loadPolicy(loaded.config.policy_file);
        const parsed = sendMessageSchema.safeParse({
          to: opts.to,
          subject: opts.subject,
          body: opts.body,
          html: opts.html
        });
        if (!parsed.success) {
          console.error("error: validation_error");
          process.exitCode = 2;
          return;
        }
        const inbox = store.state.inboxes.find(
          (row) => row.id === opts.inbox || row.name === opts.inbox
        ) ?? {
          id: opts.inbox,
          name: opts.inbox,
          address: `${opts.inbox}@${loaded.config.domain}`,
          created_at: store.now()
        };
        const decision = evaluatePolicy(policy, parsed.data, store, inbox.id);
        if (decision.action === "block") {
          console.error(`error: policy_blocked (rule: ${decision.rule})`);
          process.exitCode = 3;
          return;
        }
        const response = await fetch(
          `http://127.0.0.1:${loaded.config.port}/inboxes/${opts.inbox}/messages`,
          {
            method: "POST",
            headers: {
              authorization: `Bearer ${loaded.config.api_key}`,
              "content-type": "application/json"
            },
            body: JSON.stringify(parsed.data)
          }
        );
        console.log(await response.text());
        process.exitCode = response.ok ? 0 : 1;
      }
    );

  program
    .command("inboxes")
    .option("--json")
    .action(async (opts: { json?: boolean }) => {
      const loaded = loadConfig(undefined, true);
      const response = await fetch(`http://127.0.0.1:${loaded.config.port}/inboxes`, {
        headers: { authorization: `Bearer ${loaded.config.api_key}` }
      });
      const text = await response.text();
      if (opts.json) console.log(text);
      else {
        const body = JSON.parse(text) as { items: Array<{ name: string; address: string }> };
        for (const inbox of body.items) console.log(`${inbox.name}\t${inbox.address}`);
      }
    });

  program.command("approvals").action(async () => {
    const loaded = loadConfig(undefined, true);
    const response = await fetch(`http://127.0.0.1:${loaded.config.port}/approvals`, {
      headers: { authorization: `Bearer ${loaded.config.operator_token}` }
    });
    console.log(await response.text());
  });

  program
    .command("approve")
    .argument("<approval_id>")
    .action(async (approvalId: string) => {
      const loaded = loadConfig(undefined, true);
      const response = await fetch(
        `http://127.0.0.1:${loaded.config.port}/approvals/${approvalId}/approve`,
        {
          method: "POST",
          headers: { authorization: `Bearer ${loaded.config.operator_token}` }
        }
      );
      console.log(await response.text());
      process.exitCode = response.ok ? 0 : 1;
    });

  program
    .command("deny")
    .argument("<approval_id>")
    .action(async (approvalId: string) => {
      const loaded = loadConfig(undefined, true);
      const response = await fetch(
        `http://127.0.0.1:${loaded.config.port}/approvals/${approvalId}/deny`,
        {
          method: "POST",
          headers: { authorization: `Bearer ${loaded.config.operator_token}` }
        }
      );
      console.log(await response.text());
      process.exitCode = response.ok ? 0 : 1;
    });

  program
    .command("export")
    .requiredOption("--out <file>")
    .action((opts: { out: string }) => {
      const loaded = loadConfig(undefined, true);
      const store = new JsonStore(loaded.config.database_url);
      store.migrate();
      mkdirSync(dirname(opts.out), { recursive: true });
      writeFileSync(opts.out, `${JSON.stringify(store.state, null, 2)}\n`, "utf8");
      console.log(`exported ${opts.out}`);
    });

  program.command("migrate").action(() => {
    const loaded = loadConfig(undefined, true);
    const store = new JsonStore(loaded.config.database_url);
    store.migrate();
    console.log("migrations applied");
  });

  program.command("mcp").action(async () => {
    await import("./mcp/server.js");
  });

  program.command("policy:example").action(() => {
    console.log(YAML.stringify(defaultPolicy()));
  });

  await program.parseAsync(argv);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runCli().catch((err: unknown) => {
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  });
}
