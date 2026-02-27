# ADK-First Service Rewrite Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace resolver-local heuristics with Gemini-backed ADK orchestration while preserving current viewer/API contracts.

**Architecture:** Add a new ADK orchestrator layer in `services/agent-orchestrator` and keep `services/resolver/src/httpServer.ts` as a compatibility edge. Gate each migration path (`analyze`, `casting`, `run`) behind feature flags so legacy logic remains a deterministic fallback until ADK paths are validated.

**Tech Stack:** TypeScript, Node.js, Vitest, `@google/adk`, `zod`, existing resolver/runtime services, Cloud Run.

---

> **Execution guidance:** Use @superpowers:test-driven-development for each task and @superpowers:verification-before-completion before each checkpoint report.

### Task 1: Scaffold ADK Orchestrator Service and Runtime Config

**Files:**
- Create: `services/agent-orchestrator/src/config.ts`
- Create: `services/agent-orchestrator/src/index.ts`
- Create: `services/agent-orchestrator/tests/config.spec.ts`
- Modify: `package.json`

**Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";

import { getOrchestratorConfig } from "../src/config";

describe("orchestrator config", () => {
  it("parses feature flags and model defaults", () => {
    const config = getOrchestratorConfig({
      AGENTIC_ANALYZE_ENABLED: "true",
      AGENTIC_CASTING_ENABLED: "false",
      AGENTIC_RUN_ENABLED: "true",
      AGENTIC_MODEL: "gemini-2.5-flash"
    });

    expect(config.flags.analyze).toBe(true);
    expect(config.flags.casting).toBe(false);
    expect(config.flags.run).toBe(true);
    expect(config.model).toBe("gemini-2.5-flash");
  });
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm vitest services/agent-orchestrator/tests/config.spec.ts --run`
Expected: FAIL with module-not-found for `services/agent-orchestrator/src/config.ts`.

**Step 3: Write minimal implementation**

```ts
export type OrchestratorConfig = {
  flags: { analyze: boolean; casting: boolean; run: boolean };
  model: string;
};

const parseBoolean = (value: string | undefined, fallback: boolean): boolean => {
  if (value === undefined) return fallback;
  return value.trim().toLowerCase() === "true";
};

export const getOrchestratorConfig = (
  env: Record<string, string | undefined> = process.env
): OrchestratorConfig => ({
  flags: {
    analyze: parseBoolean(env.AGENTIC_ANALYZE_ENABLED, false),
    casting: parseBoolean(env.AGENTIC_CASTING_ENABLED, false),
    run: parseBoolean(env.AGENTIC_RUN_ENABLED, false)
  },
  model: env.AGENTIC_MODEL?.trim() || "gemini-2.5-flash"
});
```

Update `package.json`:

```json
{
  "scripts": {
    "start:orchestrator": "tsx services/agent-orchestrator/src/index.ts"
  },
  "dependencies": {
    "@google/adk": "^1.0.0",
    "zod": "^3.23.8",
    "dotenv": "^16.4.5"
  }
}
```

**Step 4: Run test to verify it passes**

Run: `pnpm vitest services/agent-orchestrator/tests/config.spec.ts --run`
Expected: PASS

**Step 5: Commit**

```bash
git add package.json services/agent-orchestrator/src/config.ts services/agent-orchestrator/src/index.ts services/agent-orchestrator/tests/config.spec.ts
git commit -m "feat: scaffold adk orchestrator config and startup"
```

### Task 2: Add ADK Gateway Wrapper with JSON Output Contract

**Files:**
- Create: `services/agent-orchestrator/src/adk/modelGateway.ts`
- Create: `services/agent-orchestrator/tests/model-gateway.spec.ts`

**Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";

import { parseJsonResponse } from "../src/adk/modelGateway";

describe("model gateway", () => {
  it("parses fenced JSON responses", () => {
    const parsed = parseJsonResponse("```json\n{\"storyId\":\"s1\"}\n```");
    expect(parsed).toEqual({ storyId: "s1" });
  });
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm vitest services/agent-orchestrator/tests/model-gateway.spec.ts --run`
Expected: FAIL because `parseJsonResponse` is missing.

**Step 3: Write minimal implementation**

```ts
const FENCED_JSON = /^```json\s*([\s\S]*?)\s*```$/i;

export const parseJsonResponse = (raw: string): unknown => {
  const trimmed = raw.trim();
  const match = trimmed.match(FENCED_JSON);
  const jsonText = (match?.[1] ?? trimmed).trim();
  return JSON.parse(jsonText);
};

export interface ModelGateway {
  runJsonPrompt(prompt: string): Promise<unknown>;
}
```

**Step 4: Run test to verify it passes**

Run: `pnpm vitest services/agent-orchestrator/tests/model-gateway.spec.ts --run`
Expected: PASS

**Step 5: Commit**

```bash
git add services/agent-orchestrator/src/adk/modelGateway.ts services/agent-orchestrator/tests/model-gateway.spec.ts
git commit -m "feat: add adk model gateway json parser"
```

### Task 3: Implement StoryAnalyzer Agent Workflow with Legacy Fallback

**Files:**
- Create: `services/agent-orchestrator/src/workflows/storyAnalyzerWorkflow.ts`
- Create: `services/agent-orchestrator/tests/story-analyzer-workflow.spec.ts`
- Modify: `services/resolver/src/routes/analyzeStory.ts`

**Step 1: Write the failing test**

```ts
import { describe, expect, it, vi } from "vitest";

import { runStoryAnalyzerWorkflow } from "../src/workflows/storyAnalyzerWorkflow";

describe("story analyzer workflow", () => {
  it("returns schema-valid output from model response", async () => {
    const output = await runStoryAnalyzerWorkflow(
      { storyId: "s1", language: "en", text: "Raju met Elder." },
      {
        runJsonPrompt: vi.fn().mockResolvedValue({
          storyId: "s1",
          characters: [{ charId: "c_raju", name: "Raju", aliases: [], archetype: "hero" }],
          scenes: [{ sceneId: "s1", characters: ["c_raju"], summary: "Raju met Elder." }]
        })
      }
    );

    expect(output.characters[0]?.charId).toBe("c_raju");
  });
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm vitest services/agent-orchestrator/tests/story-analyzer-workflow.spec.ts --run`
Expected: FAIL because workflow module does not exist.

**Step 3: Write minimal implementation**

```ts
import { z } from "zod";

const storySchema = z.object({
  storyId: z.string(),
  characters: z.array(
    z.object({
      charId: z.string(),
      name: z.string(),
      aliases: z.array(z.string()),
      archetype: z.string()
    })
  ),
  scenes: z.array(
    z.object({
      sceneId: z.string(),
      characters: z.array(z.string()),
      summary: z.string()
    })
  )
});

export const runStoryAnalyzerWorkflow = async (input: AnalyzeInput, gateway: ModelGateway) => {
  const raw = await gateway.runJsonPrompt(buildAnalyzePrompt(input));
  return storySchema.parse(raw);
};
```

Refactor `services/resolver/src/routes/analyzeStory.ts` so current heuristic implementation is moved to a `legacyAnalyzeStory` function that can be reused as fallback later.

**Step 4: Run test to verify it passes**

Run: `pnpm vitest services/agent-orchestrator/tests/story-analyzer-workflow.spec.ts --run`
Expected: PASS

**Step 5: Commit**

```bash
git add services/agent-orchestrator/src/workflows/storyAnalyzerWorkflow.ts services/agent-orchestrator/tests/story-analyzer-workflow.spec.ts services/resolver/src/routes/analyzeStory.ts
git commit -m "feat: add adk story analyzer workflow with schema validation"
```

### Task 4: Implement CastingResolver Agent Workflow and Candidate Ranking Output

**Files:**
- Create: `services/agent-orchestrator/src/workflows/castingResolverWorkflow.ts`
- Create: `services/agent-orchestrator/tests/casting-resolver-workflow.spec.ts`
- Modify: `services/resolver/src/routes/prepareCasting.ts`

**Step 1: Write the failing test**

```ts
import { describe, expect, it, vi } from "vitest";

import { runCastingResolverWorkflow } from "../src/workflows/castingResolverWorkflow";

describe("casting resolver workflow", () => {
  it("returns ranked existing candidates per character", async () => {
    const result = await runCastingResolverWorkflow(
      {
        storyId: "s1",
        style: "leather-shadow",
        characters: [{ charId: "c_raju", name: "Raju", aliases: [], archetype: "hero" }]
      },
      { runJsonPrompt: vi.fn().mockResolvedValue({ byCharId: { c_raju: ["hero_raju_v2"] } }) }
    );

    expect(result.byCharId.c_raju[0]).toBe("hero_raju_v2");
  });
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm vitest services/agent-orchestrator/tests/casting-resolver-workflow.spec.ts --run`
Expected: FAIL because workflow module does not exist.

**Step 3: Write minimal implementation**

```ts
type CastingResult = {
  byCharId: Record<string, string[]>;
  unresolvedCharIds: string[];
  reasoning: Record<string, string>;
};

export const runCastingResolverWorkflow = async (
  input: CastingWorkflowInput,
  gateway: ModelGateway
): Promise<CastingResult> => {
  const raw = await gateway.runJsonPrompt(buildCastingPrompt(input));
  return castingSchema.parse(raw);
};
```

Integrate this workflow into `prepareCasting` under flag `AGENTIC_CASTING_ENABLED`, with fallback to existing `scoreCharacterToArtifact` logic.

**Step 4: Run test to verify it passes**

Run: `pnpm vitest services/agent-orchestrator/tests/casting-resolver-workflow.spec.ts services/resolver/tests/casting-prepare.spec.ts --run`
Expected: PASS

**Step 5: Commit**

```bash
git add services/agent-orchestrator/src/workflows/castingResolverWorkflow.ts services/agent-orchestrator/tests/casting-resolver-workflow.spec.ts services/resolver/src/routes/prepareCasting.ts
git commit -m "feat: add adk casting resolver workflow and prepare integration"
```

### Task 5: Implement ArtifactGeneration Agent Workflow and Adapter Bridge

**Files:**
- Create: `services/agent-orchestrator/src/workflows/artifactGenerationWorkflow.ts`
- Create: `services/agent-orchestrator/tests/artifact-generation-workflow.spec.ts`
- Modify: `services/resolver/src/routes/generateCastingCandidates.ts`
- Modify: `services/resolver/src/integrations/stitchClient.ts`

**Step 1: Write the failing test**

```ts
import { describe, expect, it, vi } from "vitest";

import { runArtifactGenerationWorkflow } from "../src/workflows/artifactGenerationWorkflow";

describe("artifact generation workflow", () => {
  it("delegates generation to stitch tool with structured request", async () => {
    const stitch = { generateCharacterParts: vi.fn().mockResolvedValue([{ candidateId: "c1", artifactId: "a1", previewUrl: "/generated/a1.png", source: "generated", partsManifest: { parts: ["head"] } }]) };
    const result = await runArtifactGenerationWorkflow(
      { storyId: "s1", style: "leather-shadow", character: { charId: "c1", name: "Raju", archetype: "hero" } },
      stitch
    );

    expect(stitch.generateCharacterParts).toHaveBeenCalledTimes(1);
    expect(result.generatedCandidates[0]?.artifactId).toBe("a1");
  });
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm vitest services/agent-orchestrator/tests/artifact-generation-workflow.spec.ts --run`
Expected: FAIL because workflow module does not exist.

**Step 3: Write minimal implementation**

```ts
export const runArtifactGenerationWorkflow = async (
  input: StitchGenerateInput,
  stitchClient: StitchClient
) => {
  const generatedCandidates = await stitchClient.generateCharacterParts(input);
  return {
    storyId: input.storyId,
    character: input.character,
    generatedCandidates
  };
};
```

Use this workflow from `generateCastingCandidates` when `AGENTIC_CASTING_ENABLED=true`, keeping current direct behavior as fallback.

**Step 4: Run test to verify it passes**

Run: `pnpm vitest services/agent-orchestrator/tests/artifact-generation-workflow.spec.ts services/resolver/tests/casting-generate.spec.ts --run`
Expected: PASS

**Step 5: Commit**

```bash
git add services/agent-orchestrator/src/workflows/artifactGenerationWorkflow.ts services/agent-orchestrator/tests/artifact-generation-workflow.spec.ts services/resolver/src/routes/generateCastingCandidates.ts services/resolver/src/integrations/stitchClient.ts
git commit -m "feat: add adk artifact generation workflow bridge"
```

### Task 6: Implement StageDirector Workflow for Run Orchestration

**Files:**
- Create: `services/agent-orchestrator/src/workflows/stageDirectorWorkflow.ts`
- Create: `services/agent-orchestrator/tests/stage-director-workflow.spec.ts`
- Modify: `services/resolver/src/routes/runDemo.ts`

**Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";

import { buildStageDirectorPlan } from "../src/workflows/stageDirectorWorkflow";

describe("stage director workflow", () => {
  it("selects primary artifact from approved hero cast", () => {
    const plan = buildStageDirectorPlan({
      resolvedCharacters: [{ charId: "c_raju", selectedArtifactId: "hero_default", confidence: 0.8, alternates: [], status: "resolved" }],
      castSelections: [{ charId: "c_raju", artifactId: "hero_custom", source: "generated" }]
    });

    expect(plan.primaryArtifactId).toBe("hero_custom");
  });
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm vitest services/agent-orchestrator/tests/stage-director-workflow.spec.ts --run`
Expected: FAIL because workflow module does not exist.

**Step 3: Write minimal implementation**

```ts
export const buildStageDirectorPlan = (input: StageDirectorInput): StageDirectorPlan => {
  const selectedByCharId = new Map(input.castSelections.map((entry) => [entry.charId, entry.artifactId]));
  const hero = input.resolvedCharacters.find((entry) => entry.charId.toLowerCase().includes("hero"));
  const fallback = input.resolvedCharacters[0];

  const primaryArtifactId = hero
    ? (selectedByCharId.get(hero.charId) ?? hero.selectedArtifactId)
    : (fallback ? (selectedByCharId.get(fallback.charId) ?? fallback.selectedArtifactId) : undefined);

  if (!primaryArtifactId) throw new Error("Unable to build stage plan: no primary artifact");

  return { primaryArtifactId };
};
```

Integrate into `runDemo` under `AGENTIC_RUN_ENABLED` so compile/runtime still return current response shape.

**Step 4: Run test to verify it passes**

Run: `pnpm vitest services/agent-orchestrator/tests/stage-director-workflow.spec.ts services/resolver/tests/run-demo-casting.spec.ts --run`
Expected: PASS

**Step 5: Commit**

```bash
git add services/agent-orchestrator/src/workflows/stageDirectorWorkflow.ts services/agent-orchestrator/tests/stage-director-workflow.spec.ts services/resolver/src/routes/runDemo.ts
git commit -m "feat: add adk stage director workflow for run orchestration"
```

### Task 7: Wire Compatibility Layer Flags in Resolver Routes

**Files:**
- Modify: `services/resolver/src/routes/analyzeStory.ts`
- Modify: `services/resolver/src/routes/prepareCasting.ts`
- Modify: `services/resolver/src/routes/generateCastingCandidates.ts`
- Modify: `services/resolver/src/routes/runDemo.ts`
- Create: `services/resolver/tests/agentic-flags.spec.ts`

**Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";

import { isAgenticAnalyzeEnabled } from "../src/routes/analyzeStory";

describe("agentic flags", () => {
  it("reads analyze flag from env", () => {
    expect(isAgenticAnalyzeEnabled({ AGENTIC_ANALYZE_ENABLED: "true" })).toBe(true);
    expect(isAgenticAnalyzeEnabled({ AGENTIC_ANALYZE_ENABLED: "false" })).toBe(false);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm vitest services/resolver/tests/agentic-flags.spec.ts --run`
Expected: FAIL because helper and route wiring do not exist.

**Step 3: Write minimal implementation**

```ts
export const isAgenticAnalyzeEnabled = (env: Record<string, string | undefined> = process.env): boolean =>
  env.AGENTIC_ANALYZE_ENABLED?.trim().toLowerCase() === "true";

export const isAgenticCastingEnabled = (env: Record<string, string | undefined> = process.env): boolean =>
  env.AGENTIC_CASTING_ENABLED?.trim().toLowerCase() === "true";

export const isAgenticRunEnabled = (env: Record<string, string | undefined> = process.env): boolean =>
  env.AGENTIC_RUN_ENABLED?.trim().toLowerCase() === "true";
```

Use these helpers in route entrypoints to choose ADK workflow path or legacy fallback.

**Step 4: Run test to verify it passes**

Run: `pnpm vitest services/resolver/tests/agentic-flags.spec.ts services/resolver/tests/http-server.spec.ts --run`
Expected: PASS

**Step 5: Commit**

```bash
git add services/resolver/src/routes/analyzeStory.ts services/resolver/src/routes/prepareCasting.ts services/resolver/src/routes/generateCastingCandidates.ts services/resolver/src/routes/runDemo.ts services/resolver/tests/agentic-flags.spec.ts
git commit -m "feat: gate resolver routes with agentic feature flags"
```

### Task 8: Add Request-Scoped Trace Logging and Request IDs

**Files:**
- Create: `services/agent-orchestrator/src/telemetry/traceLogger.ts`
- Create: `services/agent-orchestrator/tests/trace-logger.spec.ts`
- Modify: `services/resolver/src/httpServer.ts`

**Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";

import { createTraceEvent } from "../src/telemetry/traceLogger";

describe("trace logger", () => {
  it("builds structured trace with request id", () => {
    const event = createTraceEvent("req_1", "story.analyze", { storyId: "s1" });
    expect(event.requestId).toBe("req_1");
    expect(event.stage).toBe("story.analyze");
  });
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm vitest services/agent-orchestrator/tests/trace-logger.spec.ts --run`
Expected: FAIL because trace logger module does not exist.

**Step 3: Write minimal implementation**

```ts
export type TraceEvent = {
  requestId: string;
  stage: string;
  timestamp: string;
  payload: Record<string, unknown>;
};

export const createTraceEvent = (
  requestId: string,
  stage: string,
  payload: Record<string, unknown>
): TraceEvent => ({
  requestId,
  stage,
  timestamp: new Date().toISOString(),
  payload
});
```

In `httpServer.ts`:

- generate request id if `x-request-id` is absent,
- set `x-request-id` response header,
- pass request id into route context for trace events.

**Step 4: Run test to verify it passes**

Run: `pnpm vitest services/agent-orchestrator/tests/trace-logger.spec.ts services/resolver/tests/http-server.spec.ts --run`
Expected: PASS

**Step 5: Commit**

```bash
git add services/agent-orchestrator/src/telemetry/traceLogger.ts services/agent-orchestrator/tests/trace-logger.spec.ts services/resolver/src/httpServer.ts
git commit -m "feat: add request-scoped trace events and request ids"
```

### Task 9: Add ADK Compatibility E2E and Cloud Run Deployment Docs

**Files:**
- Create: `services/resolver/tests/agentic-compat.e2e.spec.ts`
- Create: `docs/deploy/cloud-run-agent-orchestrator.md`
- Modify: `README.md`
- Modify: `package.json`

**Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";

describe("agentic compatibility e2e", () => {
  it("runs prepare -> generate -> approve -> run with agentic flags enabled", async () => {
    expect(true).toBe(false);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm vitest services/resolver/tests/agentic-compat.e2e.spec.ts --run`
Expected: FAIL due to placeholder assertion and missing flow.

**Step 3: Write minimal implementation**

- Implement the E2E flow with env flags enabled for the process:

```ts
process.env.AGENTIC_ANALYZE_ENABLED = "true";
process.env.AGENTIC_CASTING_ENABLED = "true";
process.env.AGENTIC_RUN_ENABLED = "true";
```

- Add deployment doc with exact Cloud Run commands:

```bash
gcloud run deploy story-ai-orchestrator \
  --source . \
  --region asia-south1 \
  --allow-unauthenticated \
  --set-env-vars AGENTIC_ANALYZE_ENABLED=true,AGENTIC_CASTING_ENABLED=true,AGENTIC_RUN_ENABLED=true
```

- Update README with required env vars, local smoke commands, and challenge-evidence outputs.
- Add script:

```json
{
  "scripts": {
    "test:agentic": "vitest services/resolver/tests/agentic-compat.e2e.spec.ts --run"
  }
}
```

**Step 4: Run test to verify it passes**

Run:
- `pnpm vitest services/resolver/tests/agentic-compat.e2e.spec.ts --run`
- `pnpm test -- --run`

Expected: PASS

**Step 5: Commit**

```bash
git add services/resolver/tests/agentic-compat.e2e.spec.ts docs/deploy/cloud-run-agent-orchestrator.md README.md package.json
git commit -m "docs: add adk compatibility e2e and cloud run deployment guide"
```

---

Plan complete and saved to `docs/plans/2026-02-25-adk-first-service-rewrite-implementation.md`. Two execution options:

**1. Subagent-Driven (this session)** - I dispatch fresh subagent per task, review between tasks, fast iteration

**2. Parallel Session (separate)** - Open new session with executing-plans, batch execution with checkpoints

Which approach?
