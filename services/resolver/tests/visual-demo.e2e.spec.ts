import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createResolverHttpServer, type ResolverHttpServerHandle } from "../src/httpServer";

type CastingCandidate = {
  artifactId: string;
  source: "existing" | "generated" | "default";
};

type PreparedCharacter = {
  charId: string;
  existingCandidates: CastingCandidate[];
};

type PrepareCastingResponse = {
  characters: PreparedCharacter[];
};

type GenerateCastingResponse = {
  generatedCandidates: CastingCandidate[];
};

type RunDemoResponse = {
  replay: Array<{
    target: {
      artifactId: string;
    };
  }>;
  playbill: {
    cast: string[];
  };
  runtimeReport: {
    endsWithRestoration: boolean;
  };
};

describe("visual demo e2e", () => {
  let handle: ResolverHttpServerHandle;
  let baseUrl: string;

  beforeAll(async () => {
    handle = await createResolverHttpServer({ port: 0 });
    baseUrl = `http://127.0.0.1:${handle.port}`;
  });

  afterAll(async () => {
    await handle.close();
  });

  it("runs casting prepare -> approve -> demo replay for viewer flow", async () => {
    const prepareResponse = await fetch(`${baseUrl}/v1/casting/prepare`, {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({
        storyId: "visual_demo_1",
        language: "en",
        style: "leather-shadow",
        text: "Raju met Elder and faced his shadow before returning to his vow."
      })
    });
    expect(prepareResponse.status).toBe(200);
    const prepareBody = (await prepareResponse.json()) as PrepareCastingResponse;
    expect(Array.isArray(prepareBody.characters)).toBe(true);
    expect(prepareBody.characters.length).toBeGreaterThan(0);

    const generatedResponse = await fetch(`${baseUrl}/v1/casting/generate`, {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({
        storyId: "visual_demo_1",
        style: "leather-shadow",
        character: prepareBody.characters[0]
      })
    });
    expect(generatedResponse.status).toBe(200);
    const generatedBody = (await generatedResponse.json()) as GenerateCastingResponse;
    expect(generatedBody.generatedCandidates.length).toBeGreaterThan(0);

    const generatedArtifactId = generatedBody.generatedCandidates[0]!.artifactId;

    const castSelections = prepareBody.characters.map((character) => {
      const generatedCandidate =
        character.charId === prepareBody.characters[0].charId
          ? generatedBody.generatedCandidates[0]
          : null;
      const selected = generatedCandidate ?? character.existingCandidates[0];
      expect(selected).toBeDefined();
      return {
        charId: character.charId,
        artifactId: selected!.artifactId,
        source: selected!.source
      };
    });

    const approveResponse = await fetch(`${baseUrl}/v1/casting/approve`, {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({
        storyId: "visual_demo_1",
        castSelections
      })
    });
    expect(approveResponse.status).toBe(200);

    const runResponse = await fetch(`${baseUrl}/v1/demo/run`, {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({
        storyId: "visual_demo_1",
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

    expect(runResponse.status).toBe(200);
    const runBody = (await runResponse.json()) as RunDemoResponse;
    expect(Array.isArray(runBody.replay)).toBe(true);
    expect(runBody.replay.length).toBeGreaterThan(0);
    expect(runBody.playbill.cast).toContain(generatedArtifactId);
    expect(runBody.replay.some((command) => command.target.artifactId === generatedArtifactId)).toBe(true);
    expect(runBody.runtimeReport.endsWithRestoration).toBe(true);
  });
});
