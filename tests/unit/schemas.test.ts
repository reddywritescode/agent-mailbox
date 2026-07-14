import { describe, expect, it } from "vitest";
import { configSchema, sendMessageSchema } from "../../src/schemas.js";

describe("schemas", () => {
  it("validates send requests", () => {
    expect(sendMessageSchema.parse({ to: "a@b.com", subject: "s", body: "b" }).to).toBe("a@b.com");
    expect(() => sendMessageSchema.parse({ to: "bad", subject: "", body: "b" })).toThrow();
  });

  it("applies config defaults", () => {
    const config = configSchema.parse({});
    expect(config.port).toBe(8081);
    expect(config.domain).toBe("example.com");
  });
});
