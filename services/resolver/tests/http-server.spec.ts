import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createResolverHttpServer, type ResolverHttpServerHandle } from "../src/httpServer";
import type { TraceEvent } from "../../agent-orchestrator/src/telemetry/traceLogger";

describe("resolver http server", () => {
  let handle: ResolverHttpServerHandle;
  let baseUrl: string;

  beforeAll(async () => {
    handle = await createResolverHttpServer({ port: 0 });
    baseUrl = `http://127.0.0.1:${handle.port}`;
  });

  afterAll(async () => {
    await handle.close();
  });

  it("serves POST /v1/stories/analyze", async () => {
    const response = await fetch(`${baseUrl}/v1/stories/analyze`, {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({
        storyId: "story-http-analyze",
        language: "en",
        text: "Raju met Elder. Later Raju crossed the river."
      })
    });

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.storyId).toBe("story-http-analyze");
    expect(body.characters.length).toBeGreaterThan(0);
  });

  it("returns 400 for invalid /v1/stories/analyze payload", async () => {
    const response = await fetch(`${baseUrl}/v1/stories/analyze`, {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({
        storyId: "story-http-analyze-invalid",
        language: "en",
        text: ""
      })
    });

    expect(response.status).toBe(400);
  });

  it("serves POST /v1/character-resolver/resolve", async () => {
    const response = await fetch(`${baseUrl}/v1/character-resolver/resolve`, {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({
        storyId: "story-http-resolve",
        style: "leather-shadow",
        characters: [
          {
            charId: "c_hero",
            name: "Raju",
            archetype: "hero"
          }
        ]
      })
    });

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.storyId).toBe("story-http-resolve");
    expect(Array.isArray(body.resolvedCharacters)).toBe(true);
    expect(Array.isArray(body.unresolvedCharacters)).toBe(true);
  });

  it("returns 400 for invalid /v1/character-resolver/resolve payload", async () => {
    const response = await fetch(`${baseUrl}/v1/character-resolver/resolve`, {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({
        storyId: "story-http-resolve-invalid",
        style: "leather-shadow",
        characters: [
          {
            charId: "c_hero",
            name: "",
            archetype: "hero"
          }
        ]
      })
    });

    expect(response.status).toBe(400);
  });

  it("serves POST /v1/artifacts/generate", async () => {
    const response = await fetch(`${baseUrl}/v1/artifacts/generate`, {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({
        charId: "c_demon",
        prompt: "shadow puppet demon king segmented parts",
        requiredParts: ["head", "torso"],
        style: "tholu-bommalata-inspired"
      })
    });

    expect(response.status).toBe(202);
    const body = await response.json();
    expect(typeof body.jobId).toBe("string");
    expect(body.status).toBe("queued");
  });

  it("returns 400 for invalid /v1/artifacts/generate payload", async () => {
    const response = await fetch(`${baseUrl}/v1/artifacts/generate`, {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({
        charId: "c_demon",
        prompt: "shadow puppet demon king segmented parts",
        requiredParts: [],
        style: "tholu-bommalata-inspired"
      })
    });

    expect(response.status).toBe(400);
  });

  it("returns 415 when content-type is not application/json", async () => {
    const response = await fetch(`${baseUrl}/v1/stories/analyze`, {
      method: "POST",
      headers: {
        "content-type": "text/plain"
      },
      body: "story text"
    });

    expect(response.status).toBe(415);
  });

  it("returns 405 for unsupported methods on known routes", async () => {
    const response = await fetch(`${baseUrl}/v1/stories/analyze`, {
      method: "GET"
    });

    expect(response.status).toBe(405);
  });

  it("echoes x-request-id response header when provided", async () => {
    const requestId = "req-http-server-test";
    const response = await fetch(`${baseUrl}/v1/stories/analyze`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-request-id": requestId
      },
      body: JSON.stringify({
        storyId: "story-http-analyze-request-id",
        language: "en",
        text: "Raju met Elder."
      })
    });

    expect(response.status).toBe(200);
    expect(response.headers.get("x-request-id")).toBe(requestId);
  });

  it("sets x-request-id response header when request header is missing", async () => {
    const response = await fetch(`${baseUrl}/missing-route`, {
      method: "GET"
    });

    expect(response.status).toBe(404);
    expect(response.headers.get("x-request-id")).toMatch(/\S+/);
  });

  it("emits trace events with request id from x-request-id header", async () => {
    const traceEvents: TraceEvent[] = [];

    const tracedHandle = await createResolverHttpServer({
      port: 0,
      onTraceEvent: (event) => {
        traceEvents.push(event);
      }
    });

    const tracedBaseUrl = `http://127.0.0.1:${tracedHandle.port}`;
    const requestId = "req-http-trace";

    try {
      const response = await fetch(`${tracedBaseUrl}/v1/stories/analyze`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-request-id": requestId
        },
        body: JSON.stringify({
          storyId: "story-http-trace",
          language: "en",
          text: "Raju met Elder."
        })
      });

      expect(response.status).toBe(200);

      const startEvent = traceEvents.find((event) => event.stage === "resolver.http.request.start");
      const finishEvent = traceEvents.find((event) => event.stage === "resolver.http.request.finish");

      expect(startEvent?.requestId).toBe(requestId);
      expect(finishEvent?.requestId).toBe(requestId);
    } finally {
      await tracedHandle.close();
    }
  });

  it("still responds successfully when onTraceEvent throws", async () => {
    const tracedHandle = await createResolverHttpServer({
      port: 0,
      onTraceEvent: () => {
        throw new Error("telemetry hook failed");
      }
    });

    const tracedBaseUrl = `http://127.0.0.1:${tracedHandle.port}`;

    try {
      const response = await fetch(`${tracedBaseUrl}/v1/stories/analyze`, {
        method: "POST",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify({
          storyId: "story-http-trace-throws",
          language: "en",
          text: "Raju met Elder."
        })
      });

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.storyId).toBe("story-http-trace-throws");
    } finally {
      await tracedHandle.close();
    }
  });

  it("bridges analyze warnings into trace events", async () => {
    const previousAnalyzeFlag = process.env.AGENTIC_ANALYZE_ENABLED;
    const previousApiKey = process.env.GEMINI_API_KEY;
    const previousGoogleApiKey = process.env.GOOGLE_GENAI_API_KEY;

    process.env.AGENTIC_ANALYZE_ENABLED = "true";
    delete process.env.GEMINI_API_KEY;
    delete process.env.GOOGLE_GENAI_API_KEY;

    const traceEvents: TraceEvent[] = [];
    const tracedHandle = await createResolverHttpServer({
      port: 0,
      onTraceEvent: (event) => {
        traceEvents.push(event);
      }
    });

    const tracedBaseUrl = `http://127.0.0.1:${tracedHandle.port}`;

    try {
      const response = await fetch(`${tracedBaseUrl}/v1/stories/analyze`, {
        method: "POST",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify({
          storyId: "story-http-warning-analyze",
          language: "en",
          text: "Raju met Elder."
        })
      });

      expect(response.status).toBe(200);

      const warningEvent = traceEvents.find(
        (event) => event.stage === "resolver.http.route.warning"
      );

      expect(warningEvent?.payload).toMatchObject({
        routePath: "/v1/stories/analyze",
        warning: {
          storyId: "story-http-warning-analyze",
          reason: "story_gateway_not_configured"
        }
      });
    } finally {
      await tracedHandle.close();

      if (previousAnalyzeFlag === undefined) {
        delete process.env.AGENTIC_ANALYZE_ENABLED;
      } else {
        process.env.AGENTIC_ANALYZE_ENABLED = previousAnalyzeFlag;
      }

      if (previousApiKey === undefined) {
        delete process.env.GEMINI_API_KEY;
      } else {
        process.env.GEMINI_API_KEY = previousApiKey;
      }

      if (previousGoogleApiKey === undefined) {
        delete process.env.GOOGLE_GENAI_API_KEY;
      } else {
        process.env.GOOGLE_GENAI_API_KEY = previousGoogleApiKey;
      }
    }
  });

  it("bridges casting warnings into trace events", async () => {
    const previousAnalyzeFlag = process.env.AGENTIC_ANALYZE_ENABLED;
    const previousCastingFlag = process.env.AGENTIC_CASTING_ENABLED;
    const previousApiKey = process.env.GEMINI_API_KEY;
    const previousGoogleApiKey = process.env.GOOGLE_GENAI_API_KEY;

    process.env.AGENTIC_ANALYZE_ENABLED = "false";
    process.env.AGENTIC_CASTING_ENABLED = "true";
    delete process.env.GEMINI_API_KEY;
    delete process.env.GOOGLE_GENAI_API_KEY;

    const traceEvents: TraceEvent[] = [];
    const tracedHandle = await createResolverHttpServer({
      port: 0,
      onTraceEvent: (event) => {
        traceEvents.push(event);
      }
    });

    const tracedBaseUrl = `http://127.0.0.1:${tracedHandle.port}`;

    try {
      const response = await fetch(`${tracedBaseUrl}/v1/casting/prepare`, {
        method: "POST",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify({
          storyId: "story-http-warning-casting",
          style: "leather-shadow",
          language: "en",
          text: "Raju met Elder and returned with resolve."
        })
      });

      expect(response.status).toBe(200);

      const warningEvent = traceEvents.find(
        (event) => event.stage === "resolver.http.route.warning"
      );

      expect(warningEvent?.payload).toMatchObject({
        routePath: "/v1/casting/prepare",
        warning: {
          storyId: "story-http-warning-casting",
          reason: "casting_gateway_not_configured"
        }
      });
    } finally {
      await tracedHandle.close();

      if (previousAnalyzeFlag === undefined) {
        delete process.env.AGENTIC_ANALYZE_ENABLED;
      } else {
        process.env.AGENTIC_ANALYZE_ENABLED = previousAnalyzeFlag;
      }

      if (previousCastingFlag === undefined) {
        delete process.env.AGENTIC_CASTING_ENABLED;
      } else {
        process.env.AGENTIC_CASTING_ENABLED = previousCastingFlag;
      }

      if (previousApiKey === undefined) {
        delete process.env.GEMINI_API_KEY;
      } else {
        process.env.GEMINI_API_KEY = previousApiKey;
      }

      if (previousGoogleApiKey === undefined) {
        delete process.env.GOOGLE_GENAI_API_KEY;
      } else {
        process.env.GOOGLE_GENAI_API_KEY = previousGoogleApiKey;
      }
    }
  });

  it("serves POST /v1/demo/run and returns replay artifacts", async () => {
    const response = await fetch(`${baseUrl}/v1/demo/run`, {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({
        storyId: "demo_story_1",
        language: "en",
        style: "leather-shadow",
        text: "Raju met Elder and faced his shadow before returning to his vow.",
        script: [
          "@0 SCENE_OPEN rasa=adbhuta tala=adi",
          "@0 NARRATE storyState=invocation oathDelta=5",
          "@1 BARGE_IN chorusRole=elder intent=warn window=1-2",
          "@2 NARRATE storyState=temptation_peak shadowDouble=true oathDelta=-35 desireDelta=70",
          "@3 NARRATE storyState=restoration oathDelta=20 desireDelta=-30",
          "@4 SCENE_CLOSE nextSceneId=next_scene"
        ].join("\n")
      })
    });

    expect(response.status).toBe(200);
    const body = await response.json();

    expect(body.storyId).toBe("demo_story_1");
    expect(body.ack.accepted).toBeGreaterThan(0);
    expect(Array.isArray(body.replay)).toBe(true);
    expect(body.playbill.sceneId).toBe("demo_story_1");
    expect(Array.isArray(body.cinema.highlights)).toBe(true);
    expect(body.runtimeReport.endsWithRestoration).toBe(true);
  });

  it("returns 400 for invalid /v1/demo/run payload", async () => {
    const response = await fetch(`${baseUrl}/v1/demo/run`, {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({
        storyId: "   ",
        language: "en",
        style: "leather-shadow",
        text: "Raju met Elder.",
        script: "@0 SCENE_OPEN rasa=adbhuta tala=adi"
      })
    });

    expect(response.status).toBe(400);
  });

  it("serves POST /v1/casting/prepare", async () => {
    const response = await fetch(`${baseUrl}/v1/casting/prepare`, {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({
        storyId: "story_casting_http_1",
        style: "leather-shadow",
        text: "Raju met Elder and returned with resolve."
      })
    });

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.storyId).toBe("story_casting_http_1");
    expect(Array.isArray(body.characters)).toBe(true);
    expect(body.characters.length).toBeGreaterThan(0);
  });

  it("returns 400 for invalid /v1/casting/prepare payload", async () => {
    const response = await fetch(`${baseUrl}/v1/casting/prepare`, {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({
        storyId: "story_casting_http_2",
        style: "leather-shadow",
        text: ""
      })
    });

    expect(response.status).toBe(400);
  });

  it("serves POST /v1/casting/generate", async () => {
    const response = await fetch(`${baseUrl}/v1/casting/generate`, {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({
        storyId: "story_casting_http_3",
        style: "leather-shadow",
        character: {
          charId: "c_raju",
          name: "Raju",
          archetype: "hero"
        }
      })
    });

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.storyId).toBe("story_casting_http_3");
    expect(Array.isArray(body.generatedCandidates)).toBe(true);
    expect(body.generatedCandidates.length).toBeGreaterThan(0);
  });

  it("returns 400 for invalid /v1/casting/generate payload", async () => {
    const response = await fetch(`${baseUrl}/v1/casting/generate`, {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({
        storyId: "story_casting_http_4",
        style: "leather-shadow",
        character: {
          charId: "c_raju",
          name: "",
          archetype: "hero"
        }
      })
    });

    expect(response.status).toBe(400);
  });

  it("serves POST /v1/casting/approve", async () => {
    const response = await fetch(`${baseUrl}/v1/casting/approve`, {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({
        storyId: "story_casting_http_5",
        castSelections: [
          {
            charId: "c_raju",
            artifactId: "hero_raju_v2",
            source: "existing"
          }
        ]
      })
    });

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.storyId).toBe("story_casting_http_5");
    expect(body.sessionArtifactMap.castSelections[0].artifactId).toBe("hero_raju_v2");
  });

  it("returns 400 for invalid /v1/casting/approve payload", async () => {
    const response = await fetch(`${baseUrl}/v1/casting/approve`, {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({
        storyId: "story_casting_http_6",
        castSelections: []
      })
    });

    expect(response.status).toBe(400);
  });

  it("returns 400 for duplicate charId in /v1/casting/approve payload", async () => {
    const response = await fetch(`${baseUrl}/v1/casting/approve`, {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({
        storyId: "story_casting_http_7",
        castSelections: [
          {
            charId: "c_raju",
            artifactId: "hero_raju_v2",
            source: "existing"
          },
          {
            charId: "c_raju",
            artifactId: "hero_raju_gen_1",
            source: "generated"
          }
        ]
      })
    });

    expect(response.status).toBe(400);
  });
});
