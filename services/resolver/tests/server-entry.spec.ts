import { describe, expect, it } from "vitest";

import { getResolverServerConfig } from "../src/server";

describe("resolver server entry", () => {
  it("uses default config when env vars are missing", () => {
    const config = getResolverServerConfig({});

    expect(config.port).toBe(8080);
    expect(config.maxBodyBytes).toBe(1024 * 1024);
  });

  it("uses env overrides for port and max body bytes", () => {
    const config = getResolverServerConfig({
      PORT: "9090",
      MAX_BODY_BYTES: "2048"
    });

    expect(config.port).toBe(9090);
    expect(config.maxBodyBytes).toBe(2048);
  });

  it("throws on invalid env values", () => {
    expect(() =>
      getResolverServerConfig({
        PORT: "0"
      })
    ).toThrow("PORT must be a positive integer");
  });
});
