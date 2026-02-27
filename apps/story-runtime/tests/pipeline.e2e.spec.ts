import { afterAll, describe, expect, it } from "vitest";
import { createResolverHttpServer } from "../../../services/resolver/src/httpServer";
import {
  createStageGatewayClient,
  sendStageCommands,
  startNetworkGateway,
  type NetworkGatewayHandle
} from "../../../services/stage-gateway/src/networkGateway";
import { playStageCommands } from "../src/runtime";
import { planGoldenPathStageCommands } from "../src/stagePlanner";

describe("pipeline integration", () => {
  const handles: Array<{ close: () => Promise<void> }> = [];

  afterAll(async () => {
    await Promise.all(handles.map((handle) => handle.close()));
  });

  it("executes resolver -> planner -> gateway -> runtime as one flow", async () => {
    const resolver = await createResolverHttpServer({ port: 0 });
    handles.push(resolver);

    const gateway = await startNetworkGateway({ grpcPort: 0, wsPort: 0 });
    handles.push(gateway);

    const analyzeResponse = await fetch(`http://127.0.0.1:${resolver.port}/v1/stories/analyze`, {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({
        storyId: "pipeline_story_1",
        language: "en",
        text: "Raju met the Village Elder. Later Raju faced his shadow and returned to his vow."
      })
    });
    const analyzed = await analyzeResponse.json();

    const resolveResponse = await fetch(
      `http://127.0.0.1:${resolver.port}/v1/character-resolver/resolve`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify({
          storyId: "pipeline_story_1",
          style: "leather-shadow",
          characters: analyzed.characters
        })
      }
    );
    const resolved = await resolveResponse.json();

    const stageCommands = planGoldenPathStageCommands({
      storyId: "pipeline_story_1",
      resolvedCharacters: resolved.resolvedCharacters
    });

    const client = createStageGatewayClient(`127.0.0.1:${gateway.grpcPort}`);
    await sendStageCommands(
      client,
      stageCommands.map((command) => ({
        json: JSON.stringify(command)
      }))
    );

    const replayed = gateway.replay("pipeline_story_1");
    const cast = Array.from(new Set(replayed.map((command) => command.target.artifactId)));
    const report = await playStageCommands(replayed, cast);

    expect(report.hasTemptationPeak).toBe(true);
    expect(report.endsWithRestoration).toBe(true);

    client.close();
  });
});
