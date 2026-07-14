import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";

describe("golden transcripts", () => {
  it("replays T1-T4 exactly through the verifier", () => {
    const result = spawnSync("node", ["scripts/verify-transcripts.mjs"], {
      encoding: "utf8",
      env: { ...process.env }
    });
    expect(result.status, `${result.stdout}\n${result.stderr}`).toBe(0);
    expect(result.stdout).toContain("verified transcripts T1-T4");
  }, 30000);
});
