import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createResolverHttpServer, type ResolverHttpServerHandle } from "../src/httpServer";

type CastingCandidate = {
  artifactId: string;
  source: "existing" | "generated" | "default";
};

type PreparedCharacter = {
  charId: string;
  name: string;
  archetype: string;
  existingCandidates: CastingCandidate[];
};

type PrepareCastingResponse = {
  storyId: string;
  language: string;
  characters: PreparedCharacter[];
};

type GenerateCastingResponse = {
  generatedCandidates: CastingCandidate[];
};

type RunDemoResponse = {
  storyId: string;
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

const AGENTIC_FLAG_KEYS = [
  "AGENTIC_ANALYZE_ENABLED",
  "AGENTIC_CASTING_ENABLED",
  "AGENTIC_RUN_ENABLED"
] as const;

describe("agentic compatibility e2e", () => {
  let handle: ResolverHttpServerHandle;
  let baseUrl: string;
  const previousEnvValues = new Map<string, string | undefined>();

  beforeAll(async () => {
    for (const key of AGENTIC_FLAG_KEYS) {
      previousEnvValues.set(key, process.env[key]);
      process.env[key] = "true";
    }

    handle = await createResolverHttpServer({ port: 0 });
    baseUrl = `http://127.0.0.1:${handle.port}`;
  });

  afterAll(async () => {
    await handle.close();

    for (const key of AGENTIC_FLAG_KEYS) {
      const previousValue = previousEnvValues.get(key);
      if (previousValue === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = previousValue;
      }
    }
  });

  it("runs prepare -> generate -> approve -> run with agentic flags enabled", async () => {
    const storyId = "agentic_compat_e2e_story_1";

    const prepareResponse = await fetch(`${baseUrl}/v1/casting/prepare`, {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({
        storyId,
        language: "en",
        style: "leather-shadow",
        text: "Raju met Elder and faced his shadow before returning to his vow."
      })
    });
    expect(prepareResponse.status).toBe(200);
    const prepareBody = (await prepareResponse.json()) as PrepareCastingResponse;
    expect(prepareBody.storyId).toBe(storyId);
    expect(prepareBody.language).toBe("en");
    expect(prepareBody.characters.length).toBeGreaterThan(0);
    expect(prepareBody.characters[0]?.existingCandidates.length).toBeGreaterThan(0);

    const firstCharacter = prepareBody.characters[0];
    expect(firstCharacter).toBeDefined();

    const generateResponse = await fetch(`${baseUrl}/v1/casting/generate`, {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({
        storyId,
        style: "leather-shadow",
        character: {
          charId: firstCharacter!.charId,
          name: firstCharacter!.name,
          archetype: firstCharacter!.archetype
        }
      })
    });
    expect(generateResponse.status).toBe(200);
    const generateBody = (await generateResponse.json()) as GenerateCastingResponse;
    expect(generateBody.generatedCandidates.length).toBeGreaterThan(0);

    const generatedCandidate = generateBody.generatedCandidates[0];
    expect(generatedCandidate).toBeDefined();

    const castSelections = prepareBody.characters.map((character) => {
      const selectedCandidate =
        character.charId === firstCharacter!.charId
          ? generatedCandidate
          : character.existingCandidates[0];

      expect(selectedCandidate).toBeDefined();

      return {
        charId: character.charId,
        artifactId: selectedCandidate!.artifactId,
        source: selectedCandidate!.source
      };
    });

    const approveResponse = await fetch(`${baseUrl}/v1/casting/approve`, {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({
        storyId,
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
        storyId,
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
    expect(runBody.storyId).toBe(storyId);
    expect(Array.isArray(runBody.replay)).toBe(true);
    expect(runBody.replay.length).toBeGreaterThan(0);
    expect(Array.isArray(runBody.playbill.cast)).toBe(true);
    expect(runBody.playbill.cast.length).toBeGreaterThan(0);
    expect(runBody.runtimeReport.endsWithRestoration).toBe(true);

    const selectedArtifactIds = new Set(castSelections.map((selection) => selection.artifactId));
    expect(runBody.playbill.cast.some((artifactId) => selectedArtifactIds.has(artifactId))).toBe(true);
    expect(
      runBody.replay.some((command) => selectedArtifactIds.has(command.target.artifactId))
    ).toBe(true);
  });
});
