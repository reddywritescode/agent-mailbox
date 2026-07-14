import { spawn, spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const root = process.cwd();

function run(cmd, args, opts = {}) {
  return spawnSync(cmd, args, {
    cwd: opts.cwd ?? root,
    env: { ...process.env, ...(opts.env ?? {}) },
    encoding: "utf8"
  });
}

function assertEqual(actual, expected, label) {
  if (actual !== expected) {
    console.error(
      `${label} mismatch\nexpected: ${JSON.stringify(expected)}\nactual:   ${JSON.stringify(actual)}`
    );
    process.exit(1);
  }
}

function assertCode(result, code, label) {
  if (result.status !== code) {
    console.error(
      `${label} exit ${result.status}, expected ${code}\n${result.stdout}\n${result.stderr}`
    );
    process.exit(1);
  }
}

const build = run("pnpm", ["build"]);
assertCode(build, 0, "pnpm build");

const dir = mkdtempSync(join(tmpdir(), "agent-mailbox-transcripts-"));
const cli = join(root, "dist", "src", "cli.js");

try {
  const init = run("node", [cli, "init"], { cwd: dir });
  assertCode(init, 0, "T1 init");
  const expectedLogs = [
    "[agent-mailbox] no config found; wrote agent-mailbox.config.yaml (defaults)",
    "[agent-mailbox] created ./data/agent-mailbox.db",
    "[agent-mailbox] API key: amb_live_9f2c... (shown once)  operator token: op_7b1a... (shown once)",
    "[agent-mailbox] listening on http://0.0.0.0:8081  — set MAILBOX_DOMAIN to send/receive"
  ].join("\n");
  assertEqual(init.stdout.trim(), expectedLogs, "T1 log");

  const port = "18081";
  const server = spawn("node", [cli, "serve", "--port", port], {
    cwd: dir,
    stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env }
  });
  await new Promise((resolve) => setTimeout(resolve, 900));
  const health = await fetch(`http://127.0.0.1:${port}/healthz`).then((r) => r.text());
  assertEqual(health, '{"status":"ok","version":"0.1.0"}', "T1 health");

  const headers = {
    authorization: "Bearer amb_live_9f2c...",
    "content-type": "application/json"
  };
  const inbox = await fetch(`http://127.0.0.1:${port}/inboxes`, {
    method: "POST",
    headers,
    body: '{"name":"support"}'
  }).then((r) => r.text());
  assertEqual(
    inbox,
    '{"inbox_id":"018f...","address":"support@example.com","created_at":"2026-07-07T12:00:00Z"}',
    "T2 inbox"
  );
  const sent = await fetch(`http://127.0.0.1:${port}/inboxes/018f.../messages`, {
    method: "POST",
    headers,
    body: '{"to":"customer@allowed.com","subject":"Re: order","body":"On its way."}'
  }).then((r) => r.text());
  assertEqual(sent, '{"message_id":"019a...","status":"sent"}', "T2 send");

  const pending = await fetch(`http://127.0.0.1:${port}/inboxes/018f.../messages`, {
    method: "POST",
    headers,
    body: '{"to":"press@external.com","subject":"Statement","body":"..."}'
  }).then((r) => r.text());
  assertEqual(
    pending,
    '{"message_id":"019b...","status":"pending_approval","approval_id":"02aa..."}',
    "T3 pending"
  );
  const approved = await fetch(`http://127.0.0.1:${port}/approvals/02aa.../approve`, {
    method: "POST",
    headers: { authorization: "Bearer op_7b1a..." }
  }).then((r) => r.text());
  assertEqual(
    approved,
    '{"approval_id":"02aa...","decision":"approved","message_status":"sent"}',
    "T3 approve"
  );

  const blocked = run(
    "node",
    [
      cli,
      "send",
      "--inbox",
      "support",
      "--to",
      "sales@competitor.com",
      "--subject",
      "hi",
      "--body",
      "hi"
    ],
    { cwd: dir }
  );
  assertCode(blocked, 3, "T4 blocked");
  assertEqual(
    blocked.stderr.trim(),
    "error: policy_blocked (rule: blocklist:competitor.com)",
    "T4 stderr"
  );
  server.kill("SIGTERM");
  console.log("verified transcripts T1-T4");
} finally {
  rmSync(dir, { recursive: true, force: true });
}
