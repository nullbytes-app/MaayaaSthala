# Casting Studio Visual MVP Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a visual storytelling MVP where users can choose existing puppet assets or generate new Stitch-based candidates per story character before starting playback.

**Architecture:** Add a pre-show Casting Studio flow in resolver APIs, freeze approved choices into a session cast map, and drive a browser viewer with a shared stage renderer that supports replay-first playback plus optional live stream mode. Keep runtime deterministic by default while allowing Stitch candidate generation before show start.

**Tech Stack:** TypeScript, Node.js HTTP server, Vitest, WebSocket, gRPC, JSON Schema contracts, browser Canvas 2D, Stitch MCP adapter boundary.

---

> **Execution guidance:** Use @superpowers:test-driven-development for each task and @superpowers:verification-before-completion before each checkpoint report.

### Task 1: Fix Stage Gateway Runtime Import Regression

**Files:**
- Modify: `services/stage-gateway/src/networkGateway.ts`
- Test: `services/stage-gateway/tests/network-gateway.spec.ts`

**Step 1: Write the failing test**

Add a test case that boots `startNetworkGateway()` and verifies gRPC proto loader actually resolves at runtime path.

```ts
it("starts gateway without proto-loader import errors", async () => {
  const handle = await startNetworkGateway({ grpcPort: 0, wsPort: 0 });
  expect(handle.grpcPort).toBeGreaterThan(0);
  await handle.close();
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm vitest services/stage-gateway/tests/network-gateway.spec.ts`
Expected: FAIL with proto loader `loadSync` import error in runtime-like path.

**Step 3: Write minimal implementation**

Change proto-loader import to namespace import so `loadSync` is always defined.

```ts
import * as protoLoader from "@grpc/proto-loader";
```

**Step 4: Run test to verify it passes**

Run: `pnpm vitest services/stage-gateway/tests/network-gateway.spec.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add services/stage-gateway/src/networkGateway.ts services/stage-gateway/tests/network-gateway.spec.ts
git commit -m "fix: stabilize proto-loader import for stage gateway"
```

### Task 2: Add Casting Prepare API (Existing Candidates)

**Files:**
- Create: `services/resolver/src/routes/prepareCasting.ts`
- Modify: `services/resolver/src/httpServer.ts`
- Modify: `services/resolver/src/domain/matchScorer.ts`
- Test: `services/resolver/tests/casting-prepare.spec.ts`

**Step 1: Write the failing test**

```ts
it("returns per-character existing casting candidates", async () => {
  const body = await prepareCasting({
    storyId: "story_casting_1",
    style: "leather-shadow",
    text: "Raju meets Elder and faces his shadow."
  });
  expect(body.characters.length).toBeGreaterThan(0);
  expect(body.characters[0]?.existingCandidates.length).toBeGreaterThan(0);
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm vitest services/resolver/tests/casting-prepare.spec.ts`
Expected: FAIL because route/module does not exist.

**Step 3: Write minimal implementation**

Implement `prepareCasting` as orchestration:
- call `analyzeStory`
- call `resolveCharacters`
- return `characterProfiles` + ranked `existingCandidates`

```ts
export async function prepareCasting(input: PrepareCastingInput): Promise<PrepareCastingResponse> {
  const analyzed = await analyzeStory({ storyId: input.storyId, language: input.language ?? "en", text: input.text });
  const resolved = await resolveCharacters({ storyId: input.storyId, style: input.style, characters: analyzed.characters });
  return buildCastingResponse(analyzed, resolved);
}
```

Add POST route: `/v1/casting/prepare`.

**Step 4: Run test to verify it passes**

Run: `pnpm vitest services/resolver/tests/casting-prepare.spec.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add services/resolver/src/routes/prepareCasting.ts services/resolver/src/httpServer.ts services/resolver/src/domain/matchScorer.ts services/resolver/tests/casting-prepare.spec.ts
git commit -m "feat: add casting prepare API with existing candidates"
```

### Task 3: Add Stitch Candidate Generation Adapter and API

**Files:**
- Create: `services/resolver/src/integrations/stitchClient.ts`
- Create: `services/resolver/src/routes/generateCastingCandidates.ts`
- Modify: `services/resolver/src/httpServer.ts`
- Test: `services/resolver/tests/casting-generate.spec.ts`

**Step 1: Write the failing test**

```ts
it("generates candidate set for one character using stitch adapter", async () => {
  const fakeClient = { generateCharacterParts: vi.fn().mockResolvedValue([{ artifactId: "hero_raju_gen_1" }]) };
  const res = await generateCastingCandidates(
    { storyId: "story_casting_1", character: { charId: "c_raju", name: "Raju", archetype: "hero" }, style: "leather-shadow" },
    fakeClient
  );
  expect(res.generatedCandidates).toHaveLength(1);
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm vitest services/resolver/tests/casting-generate.spec.ts`
Expected: FAIL because adapter/route missing.

**Step 3: Write minimal implementation**

Create adapter boundary:

```ts
export interface StitchClient {
  generateCharacterParts(input: StitchGenerateInput): Promise<GeneratedCandidate[]>;
}
```

Default implementation can be a safe placeholder that returns empty list unless configured.
Add route: `/v1/casting/generate`.

**Step 4: Run test to verify it passes**

Run: `pnpm vitest services/resolver/tests/casting-generate.spec.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add services/resolver/src/integrations/stitchClient.ts services/resolver/src/routes/generateCastingCandidates.ts services/resolver/src/httpServer.ts services/resolver/tests/casting-generate.spec.ts
git commit -m "feat: add stitch-backed casting candidate generation API"
```

### Task 4: Add Casting Approval API and Session Cast Freeze

**Files:**
- Create: `services/resolver/src/routes/approveCasting.ts`
- Create: `services/resolver/src/domain/castingSessionStore.ts`
- Modify: `services/resolver/src/httpServer.ts`
- Test: `services/resolver/tests/casting-approve.spec.ts`

**Step 1: Write the failing test**

```ts
it("stores approved cast and returns session artifact map", async () => {
  const res = await approveCasting({
    storyId: "story_casting_1",
    castSelections: [{ charId: "c_raju", artifactId: "hero_raju_v2", source: "existing" }]
  });
  expect(res.sessionArtifactMap.castSelections[0]?.artifactId).toBe("hero_raju_v2");
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm vitest services/resolver/tests/casting-approve.spec.ts`
Expected: FAIL because approval flow/store missing.

**Step 3: Write minimal implementation**

In-memory store with simple API:

```ts
export const saveSessionArtifactMap = (map: SessionArtifactMap): SessionArtifactMap => {
  sessionByStoryId.set(map.storyId, map);
  return map;
};
```

Add route: `/v1/casting/approve`.

**Step 4: Run test to verify it passes**

Run: `pnpm vitest services/resolver/tests/casting-approve.spec.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add services/resolver/src/routes/approveCasting.ts services/resolver/src/domain/castingSessionStore.ts services/resolver/src/httpServer.ts services/resolver/tests/casting-approve.spec.ts
git commit -m "feat: add casting approval and session artifact freeze"
```

### Task 5: Wire Session Cast into `runDemo`

**Files:**
- Modify: `services/resolver/src/routes/runDemo.ts`
- Modify: `apps/story-runtime/src/natyaCompiler.ts`
- Test: `services/resolver/tests/run-demo-casting.spec.ts`

**Step 1: Write the failing test**

```ts
it("uses approved cast selections when running demo", async () => {
  const out = await runDemo({
    storyId: "story_casting_1",
    language: "en",
    style: "leather-shadow",
    text: "Raju met Elder.",
    script: "@0 SCENE_OPEN rasa=adbhuta tala=adi",
    castSelections: [{ charId: "c_raju", artifactId: "hero_raju_custom", source: "generated" }]
  });
  expect(out.replay.some((c) => c.target.artifactId === "hero_raju_custom")).toBe(true);
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm vitest services/resolver/tests/run-demo-casting.spec.ts`
Expected: FAIL because `runDemo` does not consume session cast map yet.

**Step 3: Write minimal implementation**

Add optional `castSelections` in run demo input and map character -> artifact before compile.

```ts
const selectedByChar = new Map(input.castSelections?.map((s) => [s.charId, s.artifactId]) ?? []);
```

Fallback to resolved/default artifacts when not provided.

**Step 4: Run test to verify it passes**

Run: `pnpm vitest services/resolver/tests/run-demo-casting.spec.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add services/resolver/src/routes/runDemo.ts apps/story-runtime/src/natyaCompiler.ts services/resolver/tests/run-demo-casting.spec.ts
git commit -m "feat: run demo with approved per-character cast selections"
```

### Task 6: Add Viewer App Shell and Static Hosting Route

**Files:**
- Create: `apps/story-viewer/web/index.html`
- Create: `apps/story-viewer/web/styles.css`
- Create: `apps/story-viewer/web/main.js`
- Modify: `services/resolver/src/httpServer.ts`
- Test: `services/resolver/tests/viewer-static.spec.ts`

**Step 1: Write the failing test**

```ts
it("serves viewer shell from /viewer", async () => {
  const response = await fetch(`${baseUrl}/viewer`);
  expect(response.status).toBe(200);
  expect(await response.text()).toContain("Story Viewer");
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm vitest services/resolver/tests/viewer-static.spec.ts`
Expected: FAIL because static route/files do not exist.

**Step 3: Write minimal implementation**

Add GET route:
- `/viewer` -> `index.html`
- `/viewer/styles.css` and `/viewer/main.js` -> static assets

Create shell with sections:
- top controls
- casting panel
- canvas stage
- timeline/state panel

**Step 4: Run test to verify it passes**

Run: `pnpm vitest services/resolver/tests/viewer-static.spec.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add apps/story-viewer/web services/resolver/src/httpServer.ts services/resolver/tests/viewer-static.spec.ts
git commit -m "feat: add story viewer shell and static hosting route"
```

### Task 7: Implement Casting Studio UI (Existing vs Generate)

**Files:**
- Create: `apps/story-viewer/web/castingStudio.js`
- Modify: `apps/story-viewer/web/main.js`
- Modify: `apps/story-viewer/web/styles.css`
- Test: `apps/story-viewer/tests/casting-state.spec.ts`

**Step 1: Write the failing test**

```ts
it("tracks selected candidate per character", () => {
  const state = reduceCastingState(initialState, {
    type: "selectCandidate",
    charId: "c_raju",
    candidateId: "hero_raju_v2"
  });
  expect(state.byCharId.c_raju.selectedCandidateId).toBe("hero_raju_v2");
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm vitest apps/story-viewer/tests/casting-state.spec.ts`
Expected: FAIL because reducer/state module missing.

**Step 3: Write minimal implementation**

Implement state + actions:
- load prepare response
- trigger generate for selected characters
- select candidate
- approve cast

Wire buttons in `castingStudio.js` to resolver APIs.

**Step 4: Run test to verify it passes**

Run: `pnpm vitest apps/story-viewer/tests/casting-state.spec.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add apps/story-viewer/web/castingStudio.js apps/story-viewer/web/main.js apps/story-viewer/web/styles.css apps/story-viewer/tests/casting-state.spec.ts
git commit -m "feat: add casting studio with existing-or-generate workflow"
```

### Task 8: Implement Replay Mode Stage Renderer

**Files:**
- Create: `apps/story-viewer/web/stageRenderer.js`
- Create: `apps/story-viewer/web/replayAdapter.js`
- Modify: `apps/story-viewer/web/main.js`
- Test: `apps/story-viewer/tests/replay-adapter.spec.ts`

**Step 1: Write the failing test**

```ts
it("orders replay events by beat and emits frame updates", () => {
  const frames = buildReplayFrames([
    { beat: 2, opcode: "NARRATE" },
    { beat: 0, opcode: "SCENE_OPEN" }
  ] as never);
  expect(frames[0]?.beat).toBe(0);
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm vitest apps/story-viewer/tests/replay-adapter.spec.ts`
Expected: FAIL because replay adapter/renderer does not exist.

**Step 3: Write minimal implementation**

Implement:
- replay frame builder (beat ordered)
- command-to-render action mapping
- canvas draw loop for part sprites
- side panel updates for mythic/audience telemetry

**Step 4: Run test to verify it passes**

Run: `pnpm vitest apps/story-viewer/tests/replay-adapter.spec.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add apps/story-viewer/web/stageRenderer.js apps/story-viewer/web/replayAdapter.js apps/story-viewer/web/main.js apps/story-viewer/tests/replay-adapter.spec.ts
git commit -m "feat: add replay-mode stage renderer for visual storytelling"
```

### Task 9: Implement Live Mode Toggle and WS Adapter

**Files:**
- Create: `apps/story-viewer/web/liveAdapter.js`
- Modify: `apps/story-viewer/web/main.js`
- Test: `apps/story-viewer/tests/live-adapter.spec.ts`

**Step 1: Write the failing test**

```ts
it("parses websocket NDJSON frames into stage commands", () => {
  const out = parseWsFrame('{"eventId":"evt_1","beat":0,"lane":"narration","opcode":"NARRATE","target":{"artifactId":"hero"},"payload":{}}\n');
  expect(out?.eventId).toBe("evt_1");
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm vitest apps/story-viewer/tests/live-adapter.spec.ts`
Expected: FAIL because live adapter missing.

**Step 3: Write minimal implementation**

Implement:
- WS connection manager
- NDJSON frame parsing
- handoff to shared renderer
- UI mode toggle between replay and live

**Step 4: Run test to verify it passes**

Run: `pnpm vitest apps/story-viewer/tests/live-adapter.spec.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add apps/story-viewer/web/liveAdapter.js apps/story-viewer/web/main.js apps/story-viewer/tests/live-adapter.spec.ts
git commit -m "feat: add optional live stream mode for story viewer"
```

### Task 10: End-to-End Demo Validation and Documentation

**Files:**
- Modify: `README.md`
- Create: `services/resolver/tests/visual-demo.e2e.spec.ts`
- Modify: `package.json`

**Step 1: Write the failing test**

```ts
it("runs casting prepare and returns replay payload consumable by viewer", async () => {
  const prepare = await fetch(`${baseUrl}/v1/casting/prepare`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ storyId: "demo_visual_1", language: "en", style: "leather-shadow", text: "Raju met Elder." }) });
  expect(prepare.status).toBe(200);
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm vitest services/resolver/tests/visual-demo.e2e.spec.ts`
Expected: FAIL until final wiring is complete.

**Step 3: Write minimal implementation**

Add:
- README walkthrough for visual MVP
- `start:demo` script if needed (resolver start + viewer URL guidance)
- E2E test assertions for prepare -> approve -> run flow

**Step 4: Run test to verify it passes**

Run:
- `pnpm vitest services/resolver/tests/visual-demo.e2e.spec.ts`
- `pnpm test -- --run`

Expected: PASS

**Step 5: Commit**

```bash
git add README.md services/resolver/tests/visual-demo.e2e.spec.ts package.json
git commit -m "docs: add visual mvp demo flow and e2e validation"
```

---

Plan complete and saved to `docs/plans/2026-02-24-casting-studio-visual-mvp-implementation.md`. Two execution options:

**1. Subagent-Driven (this session)** - I dispatch fresh subagent per task, review between tasks, fast iteration

**2. Parallel Session (separate)** - Open new session with executing-plans, batch execution with checkpoints

Which approach?
