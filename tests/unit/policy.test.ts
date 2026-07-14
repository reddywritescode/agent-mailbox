import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import YAML from "yaml";
import { defaultPolicy } from "../../src/config.js";
import { JsonStore } from "../../src/db/migrate.js";
import { redactSecrets } from "../../src/audit.js";
import { evaluatePolicy, sanitizeFilename } from "../../src/policy.js";
import { policySchema } from "../../src/schemas.js";
import { readFileSync, readdirSync } from "node:fs";

function store() {
  const dir = mkdtempSync(join(tmpdir(), "agent-mailbox-unit-"));
  const s = new JsonStore(`file:${join(dir, "db.json")}`);
  s.migrate();
  return { s, dir };
}

describe("policy evaluator", () => {
  it("blocks blocklisted domains first", () => {
    const { s, dir } = store();
    const decision = evaluatePolicy(
      defaultPolicy(),
      { to: "sales@competitor.com", subject: "hi", body: "hi" },
      s,
      "support"
    );
    expect(decision).toEqual({ action: "block", rule: "blocklist:competitor.com" });
    rmSync(dir, { recursive: true, force: true });
  });

  it("requires approval for external domains and sensitive keywords", () => {
    const { s, dir } = store();
    expect(
      evaluatePolicy(
        defaultPolicy(),
        { to: "press@external.com", subject: "Statement", body: "..." },
        s,
        "support"
      )
    ).toEqual({ action: "require_approval", rule: "external:external.com" });
    expect(
      evaluatePolicy(
        defaultPolicy(),
        { to: "customer@allowed.com", subject: "refund", body: "refund" },
        s,
        "support"
      )
    ).toEqual({ action: "require_approval", rule: "keyword:refund" });
    rmSync(dir, { recursive: true, force: true });
  });

  it("allows allowlisted normal mail", () => {
    const { s, dir } = store();
    expect(
      evaluatePolicy(
        defaultPolicy(),
        { to: "customer@allowed.com", subject: "hello", body: "hello" },
        s,
        "support"
      )
    ).toEqual({ action: "allow" });
    rmSync(dir, { recursive: true, force: true });
  });

  it("sanitizes paths and redacts tokens", () => {
    expect(sanitizeFilename("../secret/key.txt")).toBe("key.txt");
    expect(redactSecrets("AGENT_MAILBOX_API_KEY=amb_live_9f2c... op_7b1a...")).toContain(
      "amb_live_[redacted]"
    );
  });
});

describe("litmus suite", () => {
  it("contains 40 scenarios and each expected decision matches", () => {
    const files = readdirSync("examples/litmus").filter((file) => file.endsWith(".yaml"));
    expect(files).toHaveLength(40);
    for (const file of files) {
      const scenario = YAML.parse(readFileSync(join("examples/litmus", file), "utf8")) as {
        send: { to: string; subject: string; body: string };
        policy: unknown;
        expect: { action: "allow" | "approval" | "block"; rule: string };
      };
      const { s, dir } = store();
      const decision = evaluatePolicy(
        policySchema.parse(scenario.policy),
        scenario.send,
        s,
        "support"
      );
      expect(decision.action === "require_approval" ? "approval" : decision.action).toBe(
        scenario.expect.action
      );
      if (scenario.expect.rule)
        expect("rule" in decision ? decision.rule : "").toBe(scenario.expect.rule);
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
