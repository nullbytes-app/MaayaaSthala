import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createResolverHttpServer, type ResolverHttpServerHandle } from "../src/httpServer";

describe("viewer static hosting", () => {
  let handle: ResolverHttpServerHandle;
  let baseUrl: string;

  beforeAll(async () => {
    handle = await createResolverHttpServer({ port: 0 });
    baseUrl = `http://127.0.0.1:${handle.port}`;
  });

  afterAll(async () => {
    await handle.close();
  });

  it("serves viewer shell from /viewer", async () => {
    const response = await fetch(`${baseUrl}/viewer`);
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/html");
    expect(await response.text()).toContain("Story AI");
  });

  it("serves viewer stylesheet and script", async () => {
    const css = await fetch(`${baseUrl}/viewer/styles.css`);
    expect(css.status).toBe(200);
    expect(css.headers.get("content-type")).toContain("text/css");

    const js = await fetch(`${baseUrl}/viewer/main.js`);
    expect(js.status).toBe(200);
    expect(js.headers.get("content-type")).toContain("text/javascript");

    const castingStudio = await fetch(`${baseUrl}/viewer/castingStudio.js`);
    expect(castingStudio.status).toBe(200);
    expect(castingStudio.headers.get("content-type")).toContain("text/javascript");

    const replayAdapter = await fetch(`${baseUrl}/viewer/replayAdapter.js`);
    expect(replayAdapter.status).toBe(200);
    expect(replayAdapter.headers.get("content-type")).toContain("text/javascript");

    const stageRenderer = await fetch(`${baseUrl}/viewer/stageRenderer.js`);
    expect(stageRenderer.status).toBe(200);
    expect(stageRenderer.headers.get("content-type")).toContain("text/javascript");

    const liveAdapter = await fetch(`${baseUrl}/viewer/liveAdapter.js`);
    expect(liveAdapter.status).toBe(200);
    expect(liveAdapter.headers.get("content-type")).toContain("text/javascript");

    const storyDraft = await fetch(`${baseUrl}/viewer/storyDraft.js`);
    expect(storyDraft.status).toBe(200);
    expect(storyDraft.headers.get("content-type")).toContain("text/javascript");

    const puppetVisuals = await fetch(`${baseUrl}/viewer/puppetVisuals.js`);
    expect(puppetVisuals.status).toBe(200);
    expect(puppetVisuals.headers.get("content-type")).toContain("text/javascript");

    const artifactVisuals = await fetch(`${baseUrl}/viewer/artifactVisuals.js`);
    expect(artifactVisuals.status).toBe(200);
    expect(artifactVisuals.headers.get("content-type")).toContain("text/javascript");
  });

  it("returns 404 for unknown viewer paths", async () => {
    const unknown = await fetch(`${baseUrl}/viewer/unknown-file.js`);
    expect(unknown.status).toBe(404);

    const traversalLike = await fetch(`${baseUrl}/viewer/../../package.json`);
    expect(traversalLike.status).toBe(404);
  });

  it("serves generated preview placeholder assets for local stitch demos", async () => {
    const response = await fetch(`${baseUrl}/generated/raju_gen_v1.png`);
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("image/svg+xml");
    expect(await response.text()).toContain("raju_gen_v1");
  });

  it("returns 405 for unsupported methods on viewer endpoints", async () => {
    const response = await fetch(`${baseUrl}/viewer`, {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({})
    });

    expect(response.status).toBe(405);
    expect(response.headers.get("allow")).toContain("GET");
  });
});
