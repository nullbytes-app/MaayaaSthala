import { describe, expect, it } from "vitest";

import { compileNatyaScript } from "../src/natyaCompiler";
import { playStageCommands } from "../src/runtime";

const script = `
# NatyaScript sample
@0 SCENE_OPEN rasa=adbhuta tala=adi
@0 NARRATE storyState=invocation oathDelta=5
@1 BARGE_IN chorusRole=elder intent=warn window=1-2
@2 NARRATE storyState=temptation_peak shadowDouble=true oathDelta=-35 desireDelta=70
@3 NARRATE storyState=restoration oathDelta=20 desireDelta=-30
@4 SCENE_CLOSE nextSceneId=next_scene
`;

describe("natya compiler", () => {
  it("compiles NatyaScript screenplay into stage commands", () => {
    const commands = compileNatyaScript({
      storyId: "natya_story_1",
      script,
      resolvedArtifactId: "hero_raju_v2",
      shadowArtifactId: "shadow_double_v1"
    });

    expect(commands[0]?.opcode).toBe("SCENE_OPEN");
    expect(commands[2]?.opcode).toBe("BARGE_IN");
    expect(commands[2]?.payload).toMatchObject({
      chorusRole: "elder",
      intent: "warn",
      windowStart: 1,
      windowEnd: 2
    });
    expect(commands[3]?.target.artifactId).toBe("shadow_double_v1");
  });

  it("routes SPEAK and GESTURE to their role's artifactId", () => {
    const multiCharScript = `
@1 SCENE_OPEN scene=forest setting=A forest
@2 SPEAK role=c_crow text=I am the clever crow
@3 GESTURE role=c_fox gesture=bow
@4 SCENE_CLOSE scene=forest
`;
    const commands = compileNatyaScript({
      storyId: "multi_char_test",
      script: multiCharScript,
      resolvedArtifactId: "gemini_c_crow_001",
      roleArtifactIds: {
        c_crow: "gemini_c_crow_001",
        c_fox: "gemini_c_fox_002"
      }
    });

    const speakCmd = commands.find(c => c.opcode === "SPEAK");
    const gestureCmd = commands.find(c => c.opcode === "GESTURE");
    expect(speakCmd?.target.artifactId).toBe("gemini_c_crow_001");
    expect(gestureCmd?.target.artifactId).toBe("gemini_c_fox_002");
  });

  it("parses MOOD opcode into the control lane with mood payload", () => {
    const moodScript = `
@1 SCENE_OPEN rasa=adbhuta tala=adi
@2 MOOD mood=scary
@3 SCENE_CLOSE nextSceneId=end
`;
    const commands = compileNatyaScript({
      storyId: "mood_test",
      script: moodScript,
      resolvedArtifactId: "hero_v1"
    });

    const moodCmd = commands.find(c => c.opcode === "MOOD");
    expect(moodCmd).toBeDefined();
    expect(moodCmd?.opcode).toBe("MOOD");
    expect(moodCmd?.payload.mood).toBe("scary");
    expect(moodCmd?.lane).toBe("control");
  });

  it("supports runtime execution from compiled commands", async () => {
    const commands = compileNatyaScript({
      storyId: "natya_story_2",
      script,
      resolvedArtifactId: "hero_raju_v2",
      shadowArtifactId: "shadow_double_v1"
    });

    const report = await playStageCommands(commands, ["hero_raju_v2", "shadow_double_v1"]);
    expect(report.endsWithRestoration).toBe(true);
    expect(report.audience.processed).toBe(1);
  });
});
