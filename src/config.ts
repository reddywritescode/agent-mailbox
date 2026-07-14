import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import YAML from "yaml";
import {
  DEFAULT_CONFIG_PATH,
  DEFAULT_DB_URL,
  DEFAULT_DOMAIN,
  DEFAULT_POLICY_PATH,
  DEFAULT_PORT,
  DEMO_API_KEY,
  DEMO_OPERATOR_TOKEN
} from "./constants.js";
import { configSchema, policySchema, type MailboxConfig, type MailboxPolicy } from "./schemas.js";

export interface LoadedConfig {
  config: MailboxConfig;
  path: string;
  looked: string[];
  created: boolean;
}

export function defaultConfig(): MailboxConfig {
  return configSchema.parse({
    port: DEFAULT_PORT,
    domain: process.env.MAILBOX_DOMAIN || DEFAULT_DOMAIN,
    database_url: DEFAULT_DB_URL,
    provider: { type: "smtp", smtp: { host: "", port: 587, user: "", pass_env: "SMTP_PASS" } },
    webhook_url: "",
    smtp_listener: { enabled: false, port: 2525 },
    policy_file: DEFAULT_POLICY_PATH,
    api_key: process.env.AGENT_MAILBOX_API_KEY || DEMO_API_KEY,
    operator_token: process.env.AGENT_MAILBOX_OPERATOR_TOKEN || DEMO_OPERATOR_TOKEN
  });
}

export function defaultPolicy(): MailboxPolicy {
  return policySchema.parse({
    default_action: "allow",
    allowlist_domains: ["allowed.com"],
    blocklist_domains: ["competitor.com"],
    require_approval_for: {
      external_domains: true,
      contains_keywords: ["refund", "pricing", "legal"]
    },
    caps: { per_inbox_per_day: 200, per_inbox_per_hour: 50 }
  });
}

export function configCandidates(explicit?: string): string[] {
  if (explicit) return [resolve(explicit)];
  const xdg = process.env.XDG_CONFIG_HOME
    ? resolve(process.env.XDG_CONFIG_HOME, "agent-mailbox", "config.yaml")
    : "";
  return [resolve(DEFAULT_CONFIG_PATH), xdg].filter(Boolean);
}

export function writeDefaultFiles(configPath = DEFAULT_CONFIG_PATH): LoadedConfig {
  const path = resolve(configPath);
  const config = defaultConfig();
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, YAML.stringify(config), "utf8");
  if (!existsSync(DEFAULT_POLICY_PATH)) {
    writeFileSync(DEFAULT_POLICY_PATH, YAML.stringify(defaultPolicy()), "utf8");
  }
  return { config, path, looked: configCandidates(configPath), created: true };
}

export function loadConfig(explicit?: string, createIfMissing = true): LoadedConfig {
  const looked = configCandidates(explicit);
  for (const candidate of looked) {
    if (existsSync(candidate)) {
      const raw = YAML.parse(readFileSync(candidate, "utf8")) ?? {};
      const config = configSchema.parse({
        ...raw,
        domain: process.env.MAILBOX_DOMAIN || raw.domain || DEFAULT_DOMAIN,
        api_key: process.env.AGENT_MAILBOX_API_KEY || raw.api_key || DEMO_API_KEY,
        operator_token:
          process.env.AGENT_MAILBOX_OPERATOR_TOKEN || raw.operator_token || DEMO_OPERATOR_TOKEN
      });
      return { config, path: candidate, looked, created: false };
    }
  }
  if (createIfMissing) return writeDefaultFiles(explicit || DEFAULT_CONFIG_PATH);
  return { config: defaultConfig(), path: resolve(DEFAULT_CONFIG_PATH), looked, created: false };
}

export function loadPolicy(path = DEFAULT_POLICY_PATH): MailboxPolicy {
  if (!existsSync(path)) {
    writeFileSync(path, YAML.stringify(defaultPolicy()), "utf8");
  }
  const raw = YAML.parse(readFileSync(path, "utf8")) ?? {};
  const parsed = policySchema.safeParse(raw);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const field = issue.path.join(".");
    if (field === "caps.per_inbox_per_day" && issue.code === "too_small") {
      throw new Error("policy invalid: caps.per_inbox_per_day must be a positive integer");
    }
    throw new Error(`policy invalid: ${field} ${issue.message}`);
  }
  return parsed.data;
}

export function dbPathFromUrl(databaseUrl: string): string {
  if (databaseUrl.startsWith("file:")) return databaseUrl.slice("file:".length);
  return databaseUrl;
}
