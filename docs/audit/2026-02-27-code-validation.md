# Code Validation Audit — 2026-02-27

## Summary

Full audit of the Story AI codebase as of February 27, 2026.
**191 tests across 34 files. Vitest test runner.**

---

## Service: `services/agent-orchestrator/`

### `src/adk/modelGateway.ts`
- **Status**: ✅ Complete
- **Purpose**: ADK LlmAgent wrapper for one-shot JSON prompts
- **Key exports**: `createModelGatewayFromEnv`, `parseJsonResponse`, `ModelGateway` interface
- **Limitation**: Creates new session per call (one-shot), NOT multi-turn
- **Tests**: `tests/model-gateway.spec.ts`

### `src/workflows/storyAnalyzerWorkflow.ts`
- **Status**: ✅ Complete (agentic path)
- **Purpose**: Uses ModelGateway to analyze story text → characters + scenes
- **Tests**: `tests/story-analyzer-workflow.spec.ts`

### `src/workflows/castingResolverWorkflow.ts`
- **Status**: ✅ Complete
- **Purpose**: Resolves character-to-artifact matching
- **Tests**: `tests/casting-resolver-workflow.spec.ts`

### `src/workflows/stageDirectorWorkflow.ts`
- **Status**: ✅ Complete
- **Tests**: `tests/stage-director-workflow.spec.ts`

### `src/workflows/artifactGenerationWorkflow.ts`
- **Status**: ✅ Complete
- **Tests**: `tests/artifact-generation-workflow.spec.ts`

---

## Service: `services/resolver/`

### `src/httpServer.ts`
- **Status**: ✅ Complete (REST routes)
- **Gap**: No WebSocket upgrade handler — needed for `/ws/chat`
- **Routes**: `/v1/stories/analyze`, `/v1/casting/*`, `/v1/artifacts/generate`, `/v1/demo/run`, viewer assets
- **Tests**: `tests/http-server.spec.ts`

### `src/routes/analyzeStory.ts`
- **Status**: ✅ Complete
- **Gap**: Only 4 archetypes in `ARCHETYPE_BY_NAME`: raju, elder, king, demon
- **Tests**: Covered via http-server.spec.ts + agentic-flags.spec.ts

### `src/routes/prepareCasting.ts`, `generateCastingCandidates.ts`, `approveCasting.ts`
- **Status**: ✅ Complete
- **Tests**: `tests/casting-*.spec.ts`

### `src/domain/matchScorer.ts`
- **Status**: ✅ Complete — scoring algorithm for character-to-artifact matching

### `src/domain/castingSessionStore.ts`
- **Status**: ✅ Complete — in-memory session store for casting state

### `src/integrations/stitchClient.ts`
- **Status**: ✅ Complete — HTTP adapter to Stitch (stub/fallback)
- **Tests**: `tests/stitch-client.spec.ts`

---

## App: `apps/story-runtime/`

### `src/natyaCompiler.ts`
- **Status**: ✅ Complete (95%)
- **DSL Format**: `@<beat> <OPCODE> key=value...` per line
- **Opcodes**: `SCENE_OPEN`, `SCENE_CLOSE`, `NARRATE`, `SPEAK`, `GESTURE`, `BARGE_IN`
- **Lanes**: control, narration, audio, puppet
- **Tests**: `tests/natya-compiler.spec.ts`

### `src/mythicEngine.ts`
- **Status**: ✅ Complete (95%)
- **States**: `invocation`, `temptation_peak`, `restoration`
- **Features**: oathIntegrity, desireLevel, shadowDoubleActive
- **Tests**: `tests/mythic-engine.spec.ts`

### `src/runtime.ts`
- **Status**: ✅ Complete
- **Purpose**: Executes stage commands from compiled NatyaScript
- **Tests**: via `tests/pipeline.e2e.spec.ts`

### `src/audienceEngine.ts`
- **Status**: ✅ Complete
- **Purpose**: Handles audience barge-in events
- **Tests**: `tests/audience-co-creation.spec.ts`

### `src/stagePlanner.ts`
- **Status**: ✅ Complete

---

## App: `apps/story-viewer/`

### `web/index.html`
- **Status**: 🔶 Partial (80%)
- **Gap**: No chat panel — button-driven only (Load, Generate Cast, Play, Pause)
- **Layout**: 3-column grid (controls | canvas | timeline)

### `web/stageRenderer.js`
- **Status**: ✅ Complete (80%) — Canvas renderer with replay + live adapters

### `web/puppetVisuals.js`
- **Status**: ✅ Complete

### `web/castingStudio.js`
- **Status**: ✅ Complete (80%) — Button-driven prepare/generate/approve flow

### `web/liveAdapter.js`, `web/replayAdapter.js`
- **Status**: ✅ Complete

### Chat Panel
- **Status**: ❌ Not started — `chatClient.js` and `chatPanel.js` don't exist

---

## Service: `services/stage-gateway/`

### `src/networkGateway.ts`
- **Status**: ✅ Complete (90%)
- **Features**: gRPC server + WebSocket broadcaster, telemetry ledger integration

### `src/telemetryLedger.ts`
- **Status**: ✅ Complete
- **Features**: cinemaCapture (frame data for replay), playbill, overlay

---

## Package: `packages/contracts/`

- **Status**: ✅ Complete — JSON schemas for artifact contracts

---

## Missing Components (0% completion)

| Component | File | Purpose |
|-----------|------|---------|
| Conversational Agent | `services/conversation-agent/` | Multi-turn ADK agent |
| Story Generator | `tools/storyGenerator.ts` | Create stories via Gemini |
| Character Browser | `tools/characterBrowser.ts` | Browse pre-gen library |
| Character Generator | `tools/characterGenerator.ts` | Provider router → asset generation |
| Scene Illustrator | `tools/sceneIllustrator.ts` | Vertex AI scene images |
| Audio Narrator | `tools/audioNarrator.ts` | Google Cloud TTS |
| Play Compiler Tool | `tools/playCompiler.ts` | NatyaScript → Stage Gateway |
| WebSocket Chat Server | `server.ts` | `/ws/chat` endpoint |
| Session Store | `sessionStore.ts` | Multi-turn conversation state |
| Chat Client | `chatClient.js` | Browser WebSocket client |
| Chat Panel | `chatPanel.js` | Multimodal message rendering |

---

## Test Coverage Summary

| Area | Tests | Status |
|------|-------|--------|
| ModelGateway | model-gateway.spec.ts | ✅ |
| Story Analyzer Workflow | story-analyzer-workflow.spec.ts | ✅ |
| Casting Resolver | casting-resolver-workflow.spec.ts | ✅ |
| HTTP Server | http-server.spec.ts | ✅ |
| NatyaCompiler | natya-compiler.spec.ts | ✅ |
| MythicEngine | mythic-engine.spec.ts | ✅ |
| Stage Gateway | network-gateway.spec.ts | ✅ |
| Chat Agent | (not yet created) | ❌ |
| Story Generator Tool | (not yet created) | ❌ |
