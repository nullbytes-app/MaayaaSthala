import { afterEach, describe, expect, it, vi } from "vitest";

import { createStitchClient } from "../src/integrations/stitchClient";

const originalGenerateUrl = process.env.STITCH_GENERATE_URL;
const originalTimeoutMs = process.env.STITCH_TIMEOUT_MS;
const originalMaxRetries = process.env.STITCH_MAX_RETRIES;
const originalAuthToken = process.env.STITCH_AUTH_BEARER_TOKEN;
const originalRetryBaseMs = process.env.STITCH_RETRY_BASE_MS;
const originalRetryJitterMs = process.env.STITCH_RETRY_JITTER_MS;

const sampleInput = {
  storyId: "story_casting_2",
  style: "leather-shadow",
  character: {
    charId: "c_raju",
    name: "Raju",
    archetype: "hero"
  }
};

const sampleGeneratedResponse = {
  generatedCandidates: [
    {
      candidateId: "cand_http_1",
      artifactId: "hero_raju_http_v1",
      previewUrl: "https://cdn.example.test/hero_raju_http_v1.png",
      source: "generated",
      partsManifest: {
        parts: ["head", "torso", "left_arm", "right_arm"]
      }
    }
  ]
};

afterEach(() => {
  if (originalGenerateUrl === undefined) {
    delete process.env.STITCH_GENERATE_URL;
  } else {
    process.env.STITCH_GENERATE_URL = originalGenerateUrl;
  }

  if (originalTimeoutMs === undefined) {
    delete process.env.STITCH_TIMEOUT_MS;
  } else {
    process.env.STITCH_TIMEOUT_MS = originalTimeoutMs;
  }

  if (originalMaxRetries === undefined) {
    delete process.env.STITCH_MAX_RETRIES;
  } else {
    process.env.STITCH_MAX_RETRIES = originalMaxRetries;
  }

  if (originalAuthToken === undefined) {
    delete process.env.STITCH_AUTH_BEARER_TOKEN;
  } else {
    process.env.STITCH_AUTH_BEARER_TOKEN = originalAuthToken;
  }

  if (originalRetryBaseMs === undefined) {
    delete process.env.STITCH_RETRY_BASE_MS;
  } else {
    process.env.STITCH_RETRY_BASE_MS = originalRetryBaseMs;
  }

  if (originalRetryJitterMs === undefined) {
    delete process.env.STITCH_RETRY_JITTER_MS;
  } else {
    process.env.STITCH_RETRY_JITTER_MS = originalRetryJitterMs;
  }

  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("stitch client", () => {
  it("falls back to the local stub when no generate URL is configured", async () => {
    delete process.env.STITCH_GENERATE_URL;
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    const client = createStitchClient();
    const result = await client.generateCharacterParts({
      storyId: "story_casting_1",
      style: "leather-shadow",
      character: {
        charId: "c_raju",
        name: "Raju",
        archetype: "hero"
      }
    });

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(result).toHaveLength(1);
    expect(result[0]?.source).toBe("generated");
  });

  it("calls configured HTTP adapter when STITCH_GENERATE_URL is set", async () => {
    process.env.STITCH_GENERATE_URL = "https://stitch.example.test/generate";

    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => sampleGeneratedResponse
    });
    vi.stubGlobal("fetch", fetchSpy);

    const client = createStitchClient();
    const result = await client.generateCharacterParts(sampleInput);

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(fetchSpy).toHaveBeenCalledWith(
      "https://stitch.example.test/generate",
      expect.objectContaining({
        method: "POST",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify(sampleInput)
      })
    );
    expect(result).toHaveLength(1);
    expect(result[0]?.artifactId).toBe("hero_raju_http_v1");
  });

  it("retries transient HTTP failures and eventually returns candidates", async () => {
    process.env.STITCH_GENERATE_URL = "https://stitch.example.test/generate";
    process.env.STITCH_MAX_RETRIES = "2";

    const stdoutSpy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);

    const fetchSpy = vi
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 503,
        json: async () => ({})
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => sampleGeneratedResponse
      });

    vi.stubGlobal("fetch", fetchSpy);

    const client = createStitchClient();
    const result = await client.generateCharacterParts(sampleInput);

    expect(fetchSpy).toHaveBeenCalledTimes(2);
    expect(result).toHaveLength(1);
    expect(result[0]?.artifactId).toBe("hero_raju_http_v1");
    const logLines = stdoutSpy.mock.calls.map((call) => String(call[0]));
    expect(logLines.some((line) => line.includes("[resolver][stitch] retry"))).toBe(true);
  });

  it("waits the configured backoff delay before retrying", async () => {
    vi.useFakeTimers();
    vi.spyOn(process.stdout, "write").mockImplementation(() => true);

    process.env.STITCH_GENERATE_URL = "https://stitch.example.test/generate";
    process.env.STITCH_MAX_RETRIES = "1";
    process.env.STITCH_RETRY_BASE_MS = "30";
    process.env.STITCH_RETRY_JITTER_MS = "0";

    const fetchSpy = vi
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 503,
        json: async () => ({})
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => sampleGeneratedResponse
      });

    vi.stubGlobal("fetch", fetchSpy);

    const client = createStitchClient();
    const resultPromise = client.generateCharacterParts(sampleInput);

    await Promise.resolve();

    expect(fetchSpy).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(29);
    expect(fetchSpy).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(1);
    const result = await resultPromise;

    expect(fetchSpy).toHaveBeenCalledTimes(2);
    expect(result).toHaveLength(1);
  });

  it("uses exponential backoff for consecutive retries", async () => {
    vi.useFakeTimers();
    vi.spyOn(process.stdout, "write").mockImplementation(() => true);

    process.env.STITCH_GENERATE_URL = "https://stitch.example.test/generate";
    process.env.STITCH_MAX_RETRIES = "2";
    process.env.STITCH_RETRY_BASE_MS = "10";
    process.env.STITCH_RETRY_JITTER_MS = "0";

    const fetchSpy = vi
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 503,
        json: async () => ({})
      })
      .mockResolvedValueOnce({
        ok: false,
        status: 503,
        json: async () => ({})
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => sampleGeneratedResponse
      });

    vi.stubGlobal("fetch", fetchSpy);

    const client = createStitchClient();
    const resultPromise = client.generateCharacterParts(sampleInput);

    await Promise.resolve();
    expect(fetchSpy).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(9);
    expect(fetchSpy).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(1);
    expect(fetchSpy).toHaveBeenCalledTimes(2);

    await vi.advanceTimersByTimeAsync(19);
    expect(fetchSpy).toHaveBeenCalledTimes(2);

    await vi.advanceTimersByTimeAsync(1);
    const result = await resultPromise;

    expect(fetchSpy).toHaveBeenCalledTimes(3);
    expect(result).toHaveLength(1);
  });

  it("adds Authorization header when STITCH_AUTH_BEARER_TOKEN is configured", async () => {
    process.env.STITCH_GENERATE_URL = "https://stitch.example.test/generate";
    process.env.STITCH_AUTH_BEARER_TOKEN = "my-secret-token";

    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => sampleGeneratedResponse
    });
    vi.stubGlobal("fetch", fetchSpy);

    const client = createStitchClient();
    await client.generateCharacterParts(sampleInput);

    expect(fetchSpy).toHaveBeenCalledWith(
      "https://stitch.example.test/generate",
      expect.objectContaining({
        headers: {
          "content-type": "application/json",
          authorization: "Bearer my-secret-token"
        }
      })
    );
  });

  it("fails with timeout when request exceeds configured timeout", async () => {
    vi.useFakeTimers();

    process.env.STITCH_GENERATE_URL = "https://stitch.example.test/generate";
    process.env.STITCH_TIMEOUT_MS = "10";
    process.env.STITCH_MAX_RETRIES = "0";

    const stdoutSpy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);

    const fetchSpy = vi.fn().mockImplementation((_url, init?: RequestInit) => {
      const signal = init?.signal as AbortSignal | undefined;

      return new Promise((_resolve, reject) => {
        signal?.addEventListener("abort", () => {
          reject(new DOMException("The operation was aborted", "AbortError"));
        });
      });
    });

    vi.stubGlobal("fetch", fetchSpy);

    const client = createStitchClient();
    const resultPromise = client.generateCharacterParts(sampleInput);
    const rejectionExpectation = expect(resultPromise).rejects.toThrow("timed out");

    await vi.advanceTimersByTimeAsync(20);

    await rejectionExpectation;
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const logLines = stdoutSpy.mock.calls.map((call) => String(call[0]));
    expect(logLines.some((line) => line.includes("[resolver][stitch] timeout"))).toBe(true);
  });

  it.runIf(Boolean(process.env.STITCH_REAL_SMOKE_URL))("smoke test: calls real stitch endpoint", async () => {
    process.env.STITCH_GENERATE_URL = process.env.STITCH_REAL_SMOKE_URL;
    process.env.STITCH_MAX_RETRIES = "0";

    const client = createStitchClient();
    const result = await client.generateCharacterParts(sampleInput);

    expect(result.length).toBeGreaterThan(0);
    expect(result[0]?.artifactId).toBeTruthy();
    expect(result[0]?.previewUrl).toBeTruthy();
  });
});
