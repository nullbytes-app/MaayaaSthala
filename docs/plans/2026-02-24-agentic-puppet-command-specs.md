# Agentic Puppet Command Specs Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a command-first storytelling system where an AI agent parses a story, selects reusable puppet artifacts, and streams JSON stage commands that animate puppet parts without direct image-level control.

**Architecture:** The system has four runtime modules: (1) Story Analyzer extracts characters and scenes, (2) Character Resolver maps story roles to existing puppet artifacts, (3) Stage Planner emits typed `StageCommand` events, and (4) Puppet Runtime executes part-level motion from commands. Missing characters trigger an artifact generation path and then re-enter the resolver.

**Tech Stack:** TypeScript, Node.js, JSON Schema (Draft 2020-12), Fastify (or Express), WebSocket, gRPC (internal), Gemini model APIs, Canvas/WebGL runtime.

---

## Retrospective Validation Against Intent

This plan is aligned with the intended interaction model:

1. Puppets are pre-created artifacts with part-level structure (`body`, `face`, `hands`, `legs`, etc.).
2. Each movable part has stable IDs, pivots, constraints, and asset refs.
3. AI does not control raw images directly.
4. AI emits JSON commands only.
5. Runtime receives streamed commands and performs motion.
6. Story ingestion resolves which existing puppets can be used and reports missing ones.

---

## Spec 1: `ArtifactSpec v1`

### 1.1 JSON Schema (authoritative contract)

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://story-ai/specs/artifact-spec.v1.schema.json",
  "title": "ArtifactSpecV1",
  "type": "object",
  "required": [
    "version",
    "artifactId",
    "displayName",
    "style",
    "parts",
    "defaultPose",
    "capabilities"
  ],
  "properties": {
    "version": { "const": "1.0" },
    "artifactId": {
      "type": "string",
      "pattern": "^[a-z0-9_\\-]+$"
    },
    "displayName": { "type": "string", "minLength": 1 },
    "style": {
      "type": "object",
      "required": ["tradition", "palette"],
      "properties": {
        "tradition": {
          "type": "string",
          "enum": ["leather-shadow", "tholu-bommalata-inspired"]
        },
        "palette": { "type": "array", "items": { "type": "string" } },
        "motifs": { "type": "array", "items": { "type": "string" } }
      }
    },
    "parts": {
      "type": "array",
      "minItems": 1,
      "items": {
        "type": "object",
        "required": [
          "partId",
          "role",
          "assetRef",
          "anchor",
          "pivot",
          "zIndex",
          "constraints"
        ],
        "properties": {
          "partId": {
            "type": "string",
            "pattern": "^[a-z0-9_\\-]+$"
          },
          "role": {
            "type": "string",
            "enum": [
              "head",
              "face",
              "torso",
              "left_arm",
              "right_arm",
              "left_hand",
              "right_hand",
              "left_leg",
              "right_leg",
              "prop"
            ]
          },
          "assetRef": {
            "type": "string",
            "description": "URI or storage key for part image"
          },
          "anchor": {
            "type": "object",
            "required": ["x", "y"],
            "properties": {
              "x": { "type": "number" },
              "y": { "type": "number" }
            }
          },
          "pivot": {
            "type": "object",
            "required": ["x", "y"],
            "properties": {
              "x": { "type": "number" },
              "y": { "type": "number" }
            }
          },
          "zIndex": { "type": "integer" },
          "constraints": {
            "type": "object",
            "required": ["rotationDegMin", "rotationDegMax"],
            "properties": {
              "rotationDegMin": { "type": "number" },
              "rotationDegMax": { "type": "number" },
              "translateXMax": { "type": "number", "default": 0 },
              "translateYMax": { "type": "number", "default": 0 },
              "scaleMin": { "type": "number", "default": 1 },
              "scaleMax": { "type": "number", "default": 1 }
            }
          },
          "tags": { "type": "array", "items": { "type": "string" } }
        }
      }
    },
    "defaultPose": {
      "type": "object",
      "additionalProperties": {
        "type": "object",
        "properties": {
          "rotationDeg": { "type": "number" },
          "translateX": { "type": "number" },
          "translateY": { "type": "number" },
          "scale": { "type": "number" }
        }
      }
    },
    "capabilities": {
      "type": "object",
      "required": ["gestures", "supportsShadowDouble"],
      "properties": {
        "gestures": { "type": "array", "items": { "type": "string" } },
        "supportsShadowDouble": { "type": "boolean" },
        "voiceProfiles": { "type": "array", "items": { "type": "string" } }
      }
    }
  }
}
```

### 1.2 Minimal Artifact Example

```json
{
  "version": "1.0",
  "artifactId": "hanuman_v1",
  "displayName": "Hanuman",
  "style": {
    "tradition": "leather-shadow",
    "palette": ["#F6C177", "#3B2F2F"],
    "motifs": ["sunburst", "temple-arch"]
  },
  "parts": [
    {"partId": "head_01", "role": "head", "assetRef": "gs://puppets/hanuman/head.png", "anchor": {"x": 0, "y": -40}, "pivot": {"x": 0.5, "y": 0.8}, "zIndex": 30, "constraints": {"rotationDegMin": -25, "rotationDegMax": 25}},
    {"partId": "torso_01", "role": "torso", "assetRef": "gs://puppets/hanuman/torso.png", "anchor": {"x": 0, "y": 0}, "pivot": {"x": 0.5, "y": 0.5}, "zIndex": 20, "constraints": {"rotationDegMin": -10, "rotationDegMax": 10}},
    {"partId": "left_hand_01", "role": "left_hand", "assetRef": "gs://puppets/hanuman/left_hand.png", "anchor": {"x": -20, "y": -10}, "pivot": {"x": 0.2, "y": 0.2}, "zIndex": 40, "constraints": {"rotationDegMin": -80, "rotationDegMax": 20}},
    {"partId": "right_hand_01", "role": "right_hand", "assetRef": "gs://puppets/hanuman/right_hand.png", "anchor": {"x": 20, "y": -10}, "pivot": {"x": 0.8, "y": 0.2}, "zIndex": 40, "constraints": {"rotationDegMin": -20, "rotationDegMax": 80}},
    {"partId": "left_leg_01", "role": "left_leg", "assetRef": "gs://puppets/hanuman/left_leg.png", "anchor": {"x": -10, "y": 30}, "pivot": {"x": 0.4, "y": 0.1}, "zIndex": 10, "constraints": {"rotationDegMin": -20, "rotationDegMax": 25}},
    {"partId": "right_leg_01", "role": "right_leg", "assetRef": "gs://puppets/hanuman/right_leg.png", "anchor": {"x": 10, "y": 30}, "pivot": {"x": 0.6, "y": 0.1}, "zIndex": 10, "constraints": {"rotationDegMin": -25, "rotationDegMax": 20}}
  ],
  "defaultPose": {
    "head_01": {"rotationDeg": 0, "translateX": 0, "translateY": 0, "scale": 1},
    "torso_01": {"rotationDeg": 0, "translateX": 0, "translateY": 0, "scale": 1}
  },
  "capabilities": {
    "gestures": ["anjali", "point", "bless", "strike"],
    "supportsShadowDouble": true,
    "voiceProfiles": ["heroic_male_tenor"]
  }
}
```

---

## Spec 2: `CharacterResolver` Flow and API

### 2.1 Flow

1. `StoryIngest`: accept full story text (example: Chandamama kadalu story).
2. `EntityExtract`: identify characters, aliases, role hints, and relationships.
3. `SceneSplit`: split into scenes and track which characters appear where.
4. `ArtifactMatch`: search artifact registry by tags, archetype, role, and style compatibility.
5. `ScoreRank`: assign confidence scores per character-artifact pair.
6. `ResolveOutput`: return suggested cast, alternates, and unresolved characters.
7. `MissingPath`: optionally trigger image generation pipeline for unresolved characters.
8. `FinalizeCast`: produce a deterministic cast map for the stage planner.

### 2.2 APIs

#### `POST /v1/stories/analyze`

Request:

```json
{
  "storyId": "chandamama_001",
  "language": "te",
  "text": "...story text..."
}
```

Response:

```json
{
  "storyId": "chandamama_001",
  "characters": [
    {"charId": "c_hero", "name": "Raju", "aliases": ["Rajanna"], "archetype": "hero"},
    {"charId": "c_mentor", "name": "Village Elder", "aliases": [], "archetype": "mentor"}
  ],
  "scenes": [
    {"sceneId": "s1", "characters": ["c_hero", "c_mentor"], "summary": "Opening conflict"}
  ]
}
```

#### `POST /v1/character-resolver/resolve`

Request:

```json
{
  "storyId": "chandamama_001",
  "style": "leather-shadow",
  "characters": [
    {"charId": "c_hero", "name": "Raju", "archetype": "hero"}
  ]
}
```

Response:

```json
{
  "storyId": "chandamama_001",
  "resolvedCharacters": [
    {
      "charId": "c_hero",
      "selectedArtifactId": "hero_raju_v2",
      "confidence": 0.91,
      "alternates": ["hero_generic_v1", "youth_male_v3"],
      "status": "resolved"
    }
  ],
  "unresolvedCharacters": [
    {
      "charId": "c_demon",
      "reason": "No compatible artifact in registry",
      "recommendedAction": "generate_artifact"
    }
  ]
}
```

#### `POST /v1/artifacts/generate`

Request:

```json
{
  "charId": "c_demon",
  "prompt": "leather shadow puppet demon king, segmented parts for animation",
  "requiredParts": ["head", "torso", "left_hand", "right_hand", "left_leg", "right_leg"],
  "style": "tholu-bommalata-inspired"
}
```

Response:

```json
{
  "jobId": "gen_7432",
  "status": "queued"
}
```

---

## Spec 3: `StageCommand v1` Streaming Contract

### 3.1 Envelope

```json
{
  "version": "1.0",
  "eventId": "evt_000123",
  "sceneId": "s1",
  "beat": 12,
  "wallTimeMs": 1730001123,
  "lane": "puppet",
  "opcode": "GESTURE",
  "target": {
    "artifactId": "hero_raju_v2",
    "partId": "right_hand_01"
  },
  "payload": {},
  "fallback": {"mode": "auto_correct"},
  "provenance": {
    "source": "model",
    "model": "gemini-live",
    "promptTraceId": "pt_98ab"
  }
}
```

### 3.2 Core Opcodes (v1)

1. `SCENE_OPEN`
2. `ARTIFACT_BIND`
3. `PLACE`
4. `GESTURE`
5. `SPEAK`
6. `NARRATE`
7. `LIGHT`
8. `SCORE`
9. `PROP`
10. `FRAME`
11. `BARGE_IN`
12. `SCENE_CLOSE`

### 3.3 NDJSON Stream Example

```json
{"version":"1.0","eventId":"evt_1","sceneId":"s1","beat":0,"lane":"narration","opcode":"SCENE_OPEN","target":{"artifactId":"stage"},"payload":{"rasa":"adbhuta","tala":"adi"}}
{"version":"1.0","eventId":"evt_2","sceneId":"s1","beat":0,"lane":"puppet","opcode":"ARTIFACT_BIND","target":{"artifactId":"hero_raju_v2"},"payload":{"charId":"c_hero"}}
{"version":"1.0","eventId":"evt_3","sceneId":"s1","beat":1,"lane":"puppet","opcode":"PLACE","target":{"artifactId":"hero_raju_v2"},"payload":{"from":"offstage_left","to":"stage_left"}}
{"version":"1.0","eventId":"evt_4","sceneId":"s1","beat":2,"lane":"puppet","opcode":"GESTURE","target":{"artifactId":"hero_raju_v2","partId":"right_hand_01"},"payload":{"gesture":"anjali","intensity":0.7}}
{"version":"1.0","eventId":"evt_5","sceneId":"s1","beat":2,"lane":"audio","opcode":"SPEAK","target":{"artifactId":"hero_raju_v2"},"payload":{"text":"I must keep my vow.","voiceProfile":"heroic_male_tenor"}}
{"version":"1.0","eventId":"evt_6","sceneId":"s1","beat":3,"lane":"narration","opcode":"NARRATE","target":{"artifactId":"sutradhar"},"payload":{"text":"Desire now enters as shadow."}}
{"version":"1.0","eventId":"evt_7","sceneId":"s1","beat":4,"lane":"control","opcode":"SCENE_CLOSE","target":{"artifactId":"stage"},"payload":{"nextSceneId":"s2"}}
```

---

### Task 1: Add Contract Schemas

**Files:**
- Create: `packages/contracts/artifact-spec.v1.schema.json`
- Create: `packages/contracts/stage-command.v1.schema.json`
- Test: `packages/contracts/tests/schema-contracts.spec.ts`

**Step 1: Write the failing test**

```ts
it("validates a minimal artifact spec and stage command sample", () => {
  expect(validateArtifact(sampleArtifact)).toBe(true);
  expect(validateStageEvent(sampleEvent)).toBe(true);
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm vitest packages/contracts/tests/schema-contracts.spec.ts`
Expected: FAIL because schema files/validators do not exist yet

**Step 3: Write minimal implementation**

- Add both schema files.
- Add small validator helpers.

**Step 4: Run test to verify it passes**

Run: `pnpm vitest packages/contracts/tests/schema-contracts.spec.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add packages/contracts
git commit -m "feat: add artifact and stage command v1 schemas"
```

### Task 2: Implement Character Resolver API

**Files:**
- Create: `services/resolver/src/routes/analyzeStory.ts`
- Create: `services/resolver/src/routes/resolveCharacters.ts`
- Create: `services/resolver/src/domain/matchScorer.ts`
- Test: `services/resolver/tests/character-resolver.spec.ts`

**Step 1: Write the failing test**

```ts
it("returns resolved and unresolved character sets", async () => {
  const res = await resolveCharacters(storyInput);
  expect(res.resolvedCharacters.length).toBeGreaterThan(0);
  expect(Array.isArray(res.unresolvedCharacters)).toBe(true);
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm vitest services/resolver/tests/character-resolver.spec.ts`
Expected: FAIL because resolver endpoints/domain are missing

**Step 3: Write minimal implementation**

- Implement entity extraction adapter + artifact scoring.
- Return response matching Spec 2.

**Step 4: Run test to verify it passes**

Run: `pnpm vitest services/resolver/tests/character-resolver.spec.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add services/resolver
git commit -m "feat: add character resolver flow and APIs"
```

### Task 3: Implement StageCommand Stream Gateway

**Files:**
- Create: `services/stage-gateway/src/wsPublisher.ts`
- Create: `services/stage-gateway/src/grpcIngest.ts`
- Create: `services/stage-gateway/src/validator.ts`
- Test: `services/stage-gateway/tests/stream-ordering.spec.ts`

**Step 1: Write the failing test**

```ts
it("preserves event ordering and drops invalid commands", async () => {
  const output = await runGateway(sampleEvents);
  expect(output.map((e) => e.eventId)).toEqual(["evt_1", "evt_2", "evt_3"]);
  expect(output.find((e) => e.eventId === "evt_bad")).toBeUndefined();
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm vitest services/stage-gateway/tests/stream-ordering.spec.ts`
Expected: FAIL because gateway is not implemented

**Step 3: Write minimal implementation**

- Ingest internal gRPC event stream.
- Validate against `StageCommand v1` schema.
- Publish ordered NDJSON over WebSocket.

**Step 4: Run test to verify it passes**

Run: `pnpm vitest services/stage-gateway/tests/stream-ordering.spec.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add services/stage-gateway
git commit -m "feat: add stage command streaming gateway"
```

### Task 4: Golden Path End-to-End Scene

**Files:**
- Create: `apps/story-runtime/src/scenes/goldenPath.scene.json`
- Create: `apps/story-runtime/tests/golden-path.e2e.spec.ts`
- Modify: `apps/story-runtime/src/runtime.ts`

**Step 1: Write the failing test**

```ts
it("plays invocation -> temptation peak -> restoration", async () => {
  const report = await playScene("goldenPath");
  expect(report.hasTemptationPeak).toBe(true);
  expect(report.endsWithRestoration).toBe(true);
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm vitest apps/story-runtime/tests/golden-path.e2e.spec.ts`
Expected: FAIL because scene/runtime hooks are incomplete

**Step 3: Write minimal implementation**

- Add one scene using resolved cast + streamed commands.
- Ensure shadow-double peak and restoration states are triggered.

**Step 4: Run test to verify it passes**

Run: `pnpm vitest apps/story-runtime/tests/golden-path.e2e.spec.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add apps/story-runtime
git commit -m "feat: add golden path story runtime flow"
```

---

Plan complete and saved to `docs/plans/2026-02-24-agentic-puppet-command-specs.md`. Two execution options:

**1. Subagent-Driven (this session)** - I dispatch fresh subagent per task, review between tasks, fast iteration

**2. Parallel Session (separate)** - Open new session with executing-plans, batch execution with checkpoints

Which approach?
