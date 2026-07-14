# Contributing

Thanks for helping make agent email safer to run in the open. Please run the full local gate before opening a pull request:

```bash
pnpm install
pnpm lint && pnpm typecheck
pnpm test:unit && pnpm test:integration && pnpm test:e2e
docker build -t agent-mailbox .
node scripts/verify-transcripts.mjs
```

Keep changes local-first, secrets-safe, and within the v1 scope in `docs/spec/01-agent-mailbox.md`.
