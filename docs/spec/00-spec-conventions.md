# Spec Conventions — Master Template for Codex-Ready Product Specs

This document is the contract every product spec in this folder follows. It exists so that a
coding agent (Codex, Claude Code, Cursor, etc.) can be handed a single spec file and produce a
**launch-ready, open-source repository with zero follow-up prompts**.

Read this file first. Every `NN-<product>.md` spec in this folder inherits every rule here and
only overrides what it explicitly restates.

---

## 0. How to use a spec in this folder (instructions to the implementing agent)

1. Read the entire spec top to bottom before writing any code.
2. Treat Section 2 (scope) and Section 16 (build checklist) as binding. Do not add features that
   are listed as non-goals. Do not skip checklist items.
3. Implement in the single build phase described in Section 16. There are **no multiple phases or
   milestones** — there is one ordered task list and one final verification gate.
4. When a decision seems open, it is not: consult Section 17 (decisions ledger). Every product spec
   resolves every judgment call there. If something is genuinely missing, choose the option most
   consistent with the decisions ledger and the shared defaults below, and record it in the
   repo's `DECISIONS.md`. Do not stop to ask.
5. The build is done only when every command in the Section 16 verification gate exits `0` and the
   golden-path transcripts in Section 4 reproduce exactly.

---

## 1. Shared product decisions (apply to all 14 products unless a spec overrides)

These are pre-resolved so no spec has to re-litigate them.

- **License:** MIT, unless the spec's Section 17 says Apache-2.0 (used only when patent-grant matters).
  `LICENSE` file at repo root, copyright `Copyright (c) 2026 <MAINTAINER>`.
- **Telemetry:** none by default. No phone-home, no analytics, no crash reporting unless the user
  opts in via an explicit config flag. This is a stated selling point in READMEs.
- **Data locality:** local-first. Default storage is SQLite on the user's disk or a user-provided
  Postgres URL. Nothing leaves the machine unless the product's core function requires it (e.g. an
  email send), and that is documented.
- **Secrets:** never hardcoded, never logged, never committed. Read from environment variables or a
  git-ignored `.env`. Provide `.env.example` with dummy values. Redact secrets in all log output.
- **Versioning:** Semantic Versioning. Start at `0.1.0`. `CHANGELOG.md` in
  [Keep a Changelog](https://keepachangelog.com) format, updated in the same PR as each change.
- **Config discovery order (identical across products):** explicit `--config <path>` flag →
  `./<product>.config.{yaml,json}` in CWD → `$XDG_CONFIG_HOME/<product>/config.yaml` →
  built-in defaults. First run with no config must succeed using defaults and print where it looked.
- **First-run behavior:** never crash on missing config or missing DB. Auto-create the DB and a
  commented default config, print a 3-line "what just happened / what to do next" message.
- **Naming:** repo name = product slug (kebab-case). Package name matches. CLI binary = product slug.
  Env var prefix = `UPPER_SNAKE` of slug.
- **Ports (pre-assigned to avoid collisions across the suite):** each spec's Section 17 pins a
  default HTTP port. Health endpoint is always `GET /healthz` → `{"status":"ok","version":"x.y.z"}`.
- **Time & IDs:** all timestamps UTC ISO-8601. All primary IDs are UUIDv7 (sortable) unless a spec
  needs a human-readable ID scheme (then documented).

## 1a. Shared stack policy (pre-decided per product family)

- **TypeScript / Node 22 LTS** for API-and-webhook services (Fastify 5, Zod 3 for validation,
  Drizzle ORM, Vitest, tsup for build, pnpm). Products: Agent Mailbox, Agent Spend Firewall,
  Outbound Gateway, Shared Task Ledger, Session Receipts.
- **Python 3.12** for scanner / pipeline / data products (Typer for CLI, Pydantic v2 for schemas,
  FastAPI where a server is needed, pytest, uv for packaging, ruff for lint/format). Products:
  Vibe Audit, Schema-Locked Extraction, Distill, Realcheck, Eval Gate, Receipts Agent.
- **Go 1.23 (single static binary)** where local performance / zero-runtime install matters.
  Products: Branch, Local Context Daemon, Agent Lighthouse. (Each spec confirms Go vs. alternative
  in its Section 6.)
- **Every product regardless of language:** SQLite default (via the language's standard driver),
  Docker + `docker-compose.yml`, an MCP server surface when the product is agent-facing, structured
  JSON logging, and a one-line install path.

---

## 2. The 17 required sections (every spec must contain all, in this order)

Each spec is a single markdown file. Section headings must match exactly so specs are diffable and
an agent can navigate them. Below, each section states its **purpose**, **what to write**, and the
**failure mode it prevents** (the reason it exists — this is the built-in defense of the template).

### Section 1 — Product definition & competitive wedge
- **Write:** one-line pitch; 2-3 sentence description; target user; the specific wedge vs. named
  competitors (cite the ones found in research, e.g. "self-hosted where AgentMail/Dead Simple are
  hosted"); the Product Hunt dataset evidence that justifies demand (upvotes/comments of comparables).
- **Prevents:** the agent building a generic clone aimed at the wrong competitor.

### Section 2 — v1 scope & non-goals
- **Write:** a numbered feature list; each feature as `Given / When / Then` acceptance criteria; a
  separate, explicit **Non-goals** list of things v1 must NOT do.
- **Prevents:** scope creep and gold-plating. Non-goals are as binding as goals.

### Section 3 — Customer personas & all interaction flows
- **Write:** 2-4 personas (who, their goal, their environment). Then **every** way a customer touches
  the product, each as a numbered step list with the system's response at each step. Cover at minimum:
  - **F0 Install / first run** (fresh machine → working default state)
  - **F1..Fn Happy-path flows** (one per core job-to-be-done)
  - **Edge flows** (empty state, large input, concurrent use, offline)
  - **Error / recovery flows** (bad input, auth failure, downstream failure, interrupted run,
    partial state → how the user recovers)
  - **Config / policy change flow**
  - **Upgrade flow** (old version → new, including any migration the user sees)
  - **Uninstall / data-export flow** (how a user leaves cleanly and takes their data)
  Each flow references the exact API/CLI/UI surface from Section 5 that powers it.
- **Prevents:** shipping a happy-path demo that falls over on first real use; missing the unglamorous
  flows (recovery, upgrade, uninstall) that separate a toy from a product.

### Section 4 — Golden-path terminal transcripts
- **Write:** the 3-5 most important flows from Section 3 as **literal** terminal sessions: exact
  command typed, exact stdout/stderr, exact files created, exact exit code. Include one failure
  transcript (bad input → error message → non-zero exit).
- **Prevents:** the #1 agent failure — a repo whose quickstart doesn't actually run. These transcripts
  are the e2e test oracle: the e2e suite asserts these exact outputs.

### Section 5 — Complete API surface
- **Write:** an exhaustive catalogue of every interface the product exposes. For each item: name,
  purpose, full request schema, full response schema, concrete example, and status/exit codes.
  Organized into these subsections (include only those that apply, but state "N/A" for the rest):
  - **5a REST/HTTP endpoints** — method, path, auth, request body (Zod/Pydantic schema), response
    body, status codes. Include `/healthz`.
  - **5b CLI commands** — full command tree, every flag with type/default/required, stdout format,
    exit codes.
  - **5c MCP tools** — tool name, JSON input schema, JSON output schema, example call/result (for
    agent-facing products).
  - **5d Webhooks** — inbound (what the product receives, with signature-verification rule) and
    outbound (what the product emits, payload schema, retry policy).
  - **5e SDK / library methods** — public function signatures and types, if a library is exposed.
  - **5f Error taxonomy** — the single shared list of error codes/messages used everywhere, each with
    meaning, HTTP/exit mapping, and remediation text.
- **Prevents:** inconsistent flags/endpoints across modules; an agent inventing ad-hoc errors. This
  section is effectively the integration tests written as prose, and it is where "all the APIs we
  would need" live.

### Section 6 — Architecture & pinned stack
- **Write:** language + framework + pinned dependency versions (with a one-line rationale each); a
  component diagram (mermaid); the runtime data-flow for the primary use case; concurrency/process
  model; where state lives.
- **Prevents:** the agent picking a stack you must maintain, or blending two frameworks.

### Section 7 — Data model
- **Write:** exact DDL for every table (SQLite dialect, note Postgres deltas); every file/format the
  product reads or writes with a schema; the migration mechanism and how migrations are named/run.
- **Prevents:** hallucinated schemas that drift between modules; no migration story.

### Section 8 — Config & policy file schemas
- **Write:** the full schema of every user-facing config/policy file; a complete **valid** example; a
  deliberately **invalid** example and the exact validation error it must produce.
- **Prevents:** "config exists but nothing validates it"; unclear precedence.

### Section 9 — Security & threat model
- **Write:** secrets handling specifics; authn/authz for any server surface; 2-3 concrete attacks with
  the mitigation (e.g. webhook forgery, SSRF from a URL input, prompt injection, path traversal);
  explicit list of what must never be logged.
- **Prevents:** the vulnerability class that gets torn apart in launch-day comments.

### Section 10 — Test plan & hard gates
- **Write:** the test matrix (unit / integration / e2e) with named fixtures; a **litmus example
  suite** (a directory of realistic scenario files, modeled on open-agentops `litmus_100`) with a
  target count and category coverage; the exact commands that must exit `0`; a coverage floor.
- **Prevents:** "implemented but unverified." Agents honor executable gates.

### Section 11 — Observability & ops
- **Write:** structured-log field spec; `/healthz` (and `/readyz` if a server); metrics if any;
  graceful shutdown behavior; how migrations run on startup; log levels and where logs go.
- **Prevents:** the demo-vs-production gap.

### Section 12 — Packaging & release
- **Write:** registry publish config (npm/PyPI/Homebrew/GH Releases as appropriate); `Dockerfile` +
  `docker-compose.yml` spec; one-line install command; the release GitHub Action (tag → build →
  publish → changelog); the version-bump process.
- **Prevents:** a repo that only works from `git clone`.

### Section 13 — Repo layout & governance files
- **Write:** the **verbatim** file tree the agent must create (like open-agentops'); the lint/format
  config; `LICENSE`, `README.md`, `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`, `SECURITY.md`,
  `.github/ISSUE_TEMPLATE/*`, `.github/workflows/ci.yml`, `.gitignore`, `.env.example`, `DECISIONS.md`.
- **Prevents:** structural bikeshedding and "where does this file go" stalls.

### Section 14 — README & docs landing page
- **Write:** the **full README copy** (hero line, badges list, 60-second quickstart, the Section 4
  transcript, a comparison table naming real competitors, config snippet, links); the content of the
  GitHub Pages `docs/index.html` landing page (sections, copy, which screenshots go where).
- **Prevents:** the last-mile problem — agents write weak docs unless handed the copy.

### Section 15 — Product Hunt launch kit
- **Write:** the PH tagline (drawn from the dataset's tested tagline patterns — imperative verb,
  names one workflow, "for agents" where apt); the 4-5 gallery frames with the exact content/caption
  of each; the spec for an asset-generator script (like open-agentops'
  `generate_product_hunt_assets.mjs`) that renders the gallery deterministically; a 45-second demo
  script; a first-comment/README "why I built this" blurb; 5 seed issues to file for contributors.
- **Prevents:** "code done, launch not ready."

### Section 16 — Single build checklist (one phase)
- **Write:** ONE ordered, exhaustive task list that takes the repo from empty to launch-ready. No
  multi-phase milestones. Group tasks by area (scaffold, data, core, API, tests, packaging, docs,
  launch) but it remains one continuous list executed in order. End with a single
  **Verification Gate**: a fenced block of shell commands that must all exit `0` (install, lint,
  typecheck, unit, integration, e2e replaying Section 4 transcripts, docker build, package build).
  The build is complete iff the gate passes.
- **Prevents:** breadth-first building that leaves everything 80% done; ambiguity about "done."

### Section 17 — Pre-resolved decisions ledger
- **Write:** a table of every judgment call with the chosen answer: default port, DB path, config
  location, naming, default model provider (and offline fallback), first-run behavior, rate limits,
  pagination defaults, timeouts, retry counts, license, min language version. Zero open questions.
- **Prevents:** the residual prompts you'd otherwise answer mid-build. This section is the direct
  guarantee of "no prompts after handoff."

---

## 3. Production-readiness definition (the launch gate, shared by all specs)

A repo is "production-ready for an open-source launch" — the bar set by
`reddywritescode/open-agentops` — when ALL of the following are true. Each spec's Section 16
verification gate must enforce these:

1. **Runs from clean checkout:** documented one-line install works on a fresh machine; first run
   succeeds with no config.
2. **Golden paths verified:** the Section 4 transcripts are reproduced by an automated e2e test.
3. **CI is green in public:** `.github/workflows/ci.yml` runs lint + typecheck + unit + integration +
   e2e + docker build on push and PR, and passes.
4. **Installable two ways:** from the language registry (npm/PyPI/GH Releases/Homebrew) AND via
   `docker compose up`.
5. **Secrets-safe:** no secret in the repo; `.env.example` present; secret redaction covered by a test.
6. **Documented:** README quickstart verified by the e2e test; competitor comparison table present;
   `/docs` landing page builds.
7. **Governed:** LICENSE, CONTRIBUTING, CODE_OF_CONDUCT, SECURITY, issue templates, CHANGELOG present.
8. **Observable & operable:** `/healthz` (for servers), structured logs, graceful shutdown, migrations
   auto-run.
9. **Launch assets in-repo:** `launch-assets/product-hunt/` with generated gallery images + the
   generator script + thumbnail; tagline and demo script committed.
10. **Zero open decisions:** `DECISIONS.md` present; no `TODO`/`FIXME` in shipped code paths.

---

## 4. Shared repo skeleton (each spec specializes this in its Section 13)

```
<product-slug>/
  README.md
  LICENSE
  CHANGELOG.md
  CONTRIBUTING.md
  CODE_OF_CONDUCT.md
  SECURITY.md
  DECISIONS.md
  .gitignore
  .env.example
  .github/
    workflows/ci.yml
    workflows/release.yml
    ISSUE_TEMPLATE/bug_report.md
    ISSUE_TEMPLATE/feature_request.md
  <src-dir>/            # src/<pkg> (TS) or <pkg>/ (py) or cmd+internal (go)
  tests/
    unit/
    integration/
    e2e/
  examples/
    litmus/             # realistic scenario suite (open-agentops style)
    <quickstart-example>/
  docs/
    index.html
    styles.css
    assets/
  launch-assets/
    product-hunt/
      generate_assets.mjs
      thumbnail.png
      gallery-01..05.png
  Dockerfile
  docker-compose.yml
  <manifest>            # package.json / pyproject.toml / go.mod
```

---

## 5. Style rules for writing the specs themselves

- Be concrete over abstract: real command strings, real JSON, real DDL — never "e.g. some endpoint."
- Every schema is copy-pasteable (valid Zod/Pydantic/SQL). Every example validates against its schema.
- Cross-reference by section number so flows, APIs, tests, and transcripts stay consistent.
- Keep each product spec self-contained: an agent should need only that file + this conventions file.
- Target 600-1200 lines per product spec. Depth over brevity; this is the one place verbosity is correct.
- No open questions. If a choice exists, make it and record it in Section 17.
