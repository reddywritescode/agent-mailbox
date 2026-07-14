# Agent Mailbox

Every agent gets an inbox. You keep the veto.

[![CI](https://github.com/example/agent-mailbox/actions/workflows/ci.yml/badge.svg)](https://github.com/example/agent-mailbox/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/agent-mailbox.svg)](https://www.npmjs.com/package/agent-mailbox)
[![license](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)
[![docker](https://img.shields.io/badge/docker-ready-blue.svg)](Dockerfile)

Agent Mailbox is a self-hosted email server for AI agents. It provisions addressable inboxes, parses inbound mail into structured JSON, and sends outbound mail through your SMTP or SES provider while enforcing allowlists, caps, blocklists, and human approval.

## 60-second quickstart

```bash
docker compose up -d
curl -s localhost:8081/healthz
```

```json
{ "status": "ok", "version": "0.1.0" }
```

First run prints:

```text
[agent-mailbox] no config found; wrote agent-mailbox.config.yaml (defaults)
[agent-mailbox] created ./data/agent-mailbox.db
[agent-mailbox] API key: amb_live_9f2c... (shown once)  operator token: op_7b1a... (shown once)
[agent-mailbox] listening on http://0.0.0.0:8081  — set MAILBOX_DOMAIN to send/receive
```

Provision and send:

```bash
export K=amb_live_9f2c...
curl -s -XPOST localhost:8081/inboxes -H "authorization: Bearer $K" \
  -H 'content-type: application/json' -d '{"name":"support"}'
```

```json
{ "inbox_id": "018f...", "address": "support@example.com", "created_at": "2026-07-07T12:00:00Z" }
```

```bash
curl -s -XPOST localhost:8081/inboxes/018f.../messages -H "authorization: Bearer $K" \
  -H 'content-type: application/json' \
  -d '{"to":"customer@allowed.com","subject":"Re: order","body":"On its way."}'
```

```json
{ "message_id": "019a...", "status": "sent" }
```

## Why self-hosted

Hosted agent inboxes are useful until an agent sends something you cannot inspect, stop, or recover. Agent Mailbox keeps mail data on your disk, uses your provider, and makes every outbound action auditable.

## Comparison

| Product              | Self-hosted | Approval queue | Policy engine | BYO provider | Data locality | Price       |
| -------------------- | ----------: | -------------: | ------------: | -----------: | ------------: | ----------- |
| Agent Mailbox        |         Yes |            Yes |           Yes |          Yes |   Local-first | Open source |
| AgentMail            |          No |             No |       Limited |           No |        Hosted | Hosted      |
| Dead Simple Email    |          No |             No |            No |           No |        Hosted | Hosted      |
| Atomic Mail          |          No |             No |       Limited |           No |        Hosted | Hosted      |
| Nylas Agent Accounts |          No |             No |       Limited |           No |        Hosted | Hosted      |

## Policy

```yaml
default_action: allow
allowlist_domains: [allowed.com]
blocklist_domains: [competitor.com]
require_approval_for:
  external_domains: true
  contains_keywords: [refund, pricing, legal]
caps:
  per_inbox_per_day: 200
  per_inbox_per_hour: 50
```

Precedence is blocklist, approval rules, allowlist, then default action.

## MCP setup

```json
{
  "mcpServers": {
    "agent-mailbox": {
      "command": "npx",
      "args": ["agent-mailbox", "mcp"]
    }
  }
}
```

The MCP surface exposes `create_inbox`, `list_inboxes`, `list_messages`, `get_message`, `send_message`, and `list_pending_approvals`.

## CLI

```bash
npx agent-mailbox init
npx agent-mailbox serve
agent-mailbox send --inbox support --to sales@competitor.com --subject hi --body hi
```

Blocked sends exit with code `3` and print:

```text
error: policy_blocked (rule: blocklist:competitor.com)
```

## Links

- Docs landing page: [docs/index.html](docs/index.html)
- Product spec: [docs/spec/01-agent-mailbox.md](docs/spec/01-agent-mailbox.md)
- Launch assets: [launch-assets/product-hunt](launch-assets/product-hunt)
