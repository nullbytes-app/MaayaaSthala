# Story AI

This repository contains a prototype pipeline for command-driven storytelling:

- story analysis + character resolution
- NatyaScript screenplay compilation to stage commands
- gRPC ingest + WebSocket stage gateway
- runtime mythic execution (invocation -> temptation peak -> restoration)
- telemetry artifacts (replay, playbill, cinema capture, overlay)

## Visual MVP (Casting Studio + Viewer)

Start the demo server (`start:demo` is an alias of `start:resolver`):

```bash
pnpm start:demo
```

Then open:

- `http://127.0.0.1:8080/viewer`

The Casting Studio is embedded directly in the viewer controls panel.

### Viewer flow

1. Edit the **Story Draft** fields (Story ID, style, language, story text, Natya script)
2. **Load Story** -> calls `/v1/casting/prepare`
3. **Generate Cast** (optional) -> calls `/v1/casting/generate`
4. Select candidates per character and **Play** -> calls `/v1/casting/approve`
5. Playback executes via `/v1/demo/run`

Playback modes:

- **Replay**: deterministic frame playback from ordered replay commands
- **Live (simulated)**: command-by-command timed streaming through the live adapter

## Demo Runner Endpoint

`POST /v1/demo/run` executes the full demo flow and returns replay artifacts in one response.

### Run local resolver server

```bash
pnpm start:resolver
```

Equivalent demo alias:

```bash
pnpm start:demo
```

Optional env vars:

- `PORT` (default: `8080`)
- `MAX_BODY_BYTES` (default: `1048576`)
- `STITCH_GENERATE_URL` (optional; when set, casting generation calls this HTTP endpoint instead of the local stub client)
- `STITCH_TIMEOUT_MS` (optional; HTTP adapter request timeout in milliseconds, default: `5000`)
- `STITCH_MAX_RETRIES` (optional; retry count for transient HTTP failures/timeouts, default: `1`)
- `STITCH_RETRY_BASE_MS` (optional; base retry delay in milliseconds for exponential backoff, default: `200`)
- `STITCH_RETRY_JITTER_MS` (optional; random jitter added per retry in milliseconds, default: `100`)
- `STITCH_AUTH_BEARER_TOKEN` (optional; when set, sends `Authorization: Bearer <token>` to `STITCH_GENERATE_URL`)
- `AGENTIC_MODEL` (optional; default: `gemini-2.5-flash`)
- `GEMINI_API_KEY`, `GOOGLE_GENAI_API_KEY`, or `GOOGLE_API_KEY` (optional; enables Gemini API mode for ADK model gateway)
- `GOOGLE_GENAI_USE_VERTEXAI=true` with `GOOGLE_CLOUD_PROJECT` and `GOOGLE_CLOUD_LOCATION` (optional; enables Vertex AI mode for ADK model gateway)
- `MODEL_GATEWAY_MAX_JSON_ATTEMPTS` (optional; retries model JSON generation on transient/format errors, default: `3`)
- `MODEL_GATEWAY_RETRY_BACKOFF_MS` (optional; linear retry backoff base in milliseconds, default: `200`)

### Agentic feature flags

Resolver keeps legacy behavior by default and enables agentic paths per route when these flags are set to `true`:

- `AGENTIC_ANALYZE_ENABLED` -> enables ADK-backed analyze workflow, falls back to legacy analyze when gateway/workflow is unavailable
- `AGENTIC_CASTING_ENABLED` -> enables ADK-backed casting ranking and generation workflow path, falls back to deterministic baseline ranking/generation
- `AGENTIC_RUN_ENABLED` -> enables stage-director primary artifact selection during `/v1/demo/run`

When no model gateway auth env vars are set, resolver keeps compatibility mode and falls back to deterministic legacy behavior even if agentic flags are enabled.

### Local agentic smoke commands

Run the compatibility E2E (prepare -> generate -> approve -> run) with all agentic flags enabled:

```bash
AGENTIC_ANALYZE_ENABLED=true \
AGENTIC_CASTING_ENABLED=true \
AGENTIC_RUN_ENABLED=true \
pnpm test:agentic
```

Run the full test suite in agentic mode:

```bash
AGENTIC_ANALYZE_ENABLED=true \
AGENTIC_CASTING_ENABLED=true \
AGENTIC_RUN_ENABLED=true \
pnpm test -- --run
```

`test:agentic` runs `services/resolver/tests/agentic-compat.e2e.spec.ts` directly.

Cloud Run deploy guide for resolver runtime: `docs/deploy/cloud-run-agent-orchestrator.md`.

### Stitch adapter contract

When `STITCH_GENERATE_URL` is configured, resolver sends this request payload:

```json
{
  "storyId": "story_casting_2",
  "style": "leather-shadow",
  "character": {
    "charId": "c_raju",
    "name": "Raju",
    "archetype": "hero"
  }
}
```

The adapter should return either a root array of candidates or an object with `generatedCandidates`.

The viewer uses each selected candidate's `previewUrl` as the first-choice texture source during canvas rendering, and falls back to procedural leather texturing when preview assets are unavailable.

For local stub demos, resolver serves deterministic placeholder preview assets at `/generated/<artifactId>.png`.

Retries use exponential backoff plus jitter for retryable adapter failures (`5xx`, `429`, `408`) and timeouts.

Recommended response shape:

```json
{
  "generatedCandidates": [
    {
      "candidateId": "cand_http_1",
      "artifactId": "hero_raju_http_v1",
      "previewUrl": "https://cdn.example.test/hero_raju_http_v1.png",
      "source": "generated",
      "partsManifest": {
        "parts": ["head", "torso", "left_arm", "right_arm"]
      }
    }
  ]
}
```

### Optional real Stitch smoke test

The repository includes an opt-in integration smoke test in `services/resolver/tests/stitch-client.spec.ts`.

Run it against a real endpoint by setting `STITCH_REAL_SMOKE_URL`:

```bash
STITCH_REAL_SMOKE_URL="https://your-stitch-endpoint.example/generate" \
STITCH_AUTH_BEARER_TOKEN="your-token-if-needed" \
pnpm test services/resolver/tests/stitch-client.spec.ts --run
```

### Request body

```json
{
  "storyId": "demo_story_1",
  "language": "en",
  "style": "leather-shadow",
  "text": "Raju met Elder and faced his shadow before returning to his vow.",
  "script": "@0 SCENE_OPEN rasa=adbhuta tala=adi\n@0 NARRATE storyState=invocation oathDelta=5\n@1 BARGE_IN chorusRole=elder intent=warn window=1-2\n@2 NARRATE storyState=temptation_peak shadowDouble=true oathDelta=-35 desireDelta=70\n@3 NARRATE storyState=restoration oathDelta=20 desireDelta=-30\n@4 SCENE_CLOSE nextSceneId=next_scene"
}
```

### Curl example

```bash
curl -sS -X POST "http://127.0.0.1:8080/v1/demo/run" \
  -H "content-type: application/json" \
  -d '{
    "storyId": "demo_story_1",
    "language": "en",
    "style": "leather-shadow",
    "text": "Raju met Elder and faced his shadow before returning to his vow.",
    "script": "@0 SCENE_OPEN rasa=adbhuta tala=adi\n@0 NARRATE storyState=invocation oathDelta=5\n@1 BARGE_IN chorusRole=elder intent=warn window=1-2\n@2 NARRATE storyState=temptation_peak shadowDouble=true oathDelta=-35 desireDelta=70\n@3 NARRATE storyState=restoration oathDelta=20 desireDelta=-30\n@4 SCENE_CLOSE nextSceneId=next_scene"
  }'
```

### Response fields

- `storyId`
- `analyzed`
- `resolution`
- `ack`
- `replay`
- `playbill`
- `cinema`
- `overlay`
- `runtimeReport`
