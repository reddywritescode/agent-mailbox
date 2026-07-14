import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const dir = "examples/litmus";
mkdirSync(dir, { recursive: true });

const cases = [];
for (const domain of [
  "allowed.com",
  "external.com",
  "competitor.com",
  "vendor.net",
  "customer.org"
]) {
  for (const keyword of ["plain", "refund", "pricing", "legal"]) {
    const to = `person@${domain}`;
    const subject = keyword === "plain" ? "hello" : keyword;
    let expect = "allow";
    let rule = "";
    if (domain === "competitor.com") {
      expect = "block";
      rule = "blocklist:competitor.com";
    } else if (keyword !== "plain") {
      expect = "approval";
      rule = `keyword:${keyword}`;
    } else if (domain !== "allowed.com") {
      expect = "approval";
      rule = `external:${domain}`;
    }
    cases.push({ to, subject, body: subject, expect, rule });
  }
}

while (cases.length < 40) {
  cases.push({
    to: `batch${cases.length}@allowed.com`,
    subject: "hello",
    body: "hello",
    expect: "allow",
    rule: ""
  });
}

for (let i = 0; i < 40; i += 1) {
  const scenario = cases[i];
  writeFileSync(
    join(dir, `${String(i + 1).padStart(2, "0")}-${scenario.expect}.yaml`),
    [
      `name: scenario-${String(i + 1).padStart(2, "0")}`,
      "send:",
      `  to: ${scenario.to}`,
      `  subject: "${scenario.subject}"`,
      `  body: "${scenario.body}"`,
      "policy:",
      "  default_action: allow",
      "  allowlist_domains: [allowed.com]",
      "  blocklist_domains: [competitor.com]",
      "  require_approval_for:",
      "    external_domains: true",
      "    contains_keywords: [refund, pricing, legal]",
      "  caps:",
      "    per_inbox_per_day: 200",
      "    per_inbox_per_hour: 50",
      "expect:",
      `  action: ${scenario.expect}`,
      `  rule: "${scenario.rule}"`,
      ""
    ].join("\n"),
    "utf8"
  );
}
