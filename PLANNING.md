# Story AI — PLANNING.md

## Project Overview

**Goal**: Transform the existing button-driven REST-API storytelling pipeline into a fully agentic, conversational storytelling system powered by Gemini 2.5 Flash for the [Gemini Live Agent Challenge](https://geminiliveagentchallenge.devpost.com/).

**Category**: Creative Storyteller
**Deadline**: March 16, 2026

---

## Architecture

```
User (Browser) ↔ WebSocket ↔ Conversational Agent (Gemini ADK)
                                    ↓ tools
                    ┌───────────────┼───────────────┐
                    ↓               ↓               ↓
            Story Generator   Provider Router   Audio Narrator
            (Gemini 2.5)      ↓           ↓     (Cloud TTS)
                          Stitch MCP  Nano Banana/
                          (puppets)   Vertex AI
                                    (illustrations)
                                    ↓
                    NatyaScript Compiler → MythicEngine → Stage Gateway
                                                          ↓ gRPC + WS
                                                    Canvas Renderer
                                                    (stage-viewer)

GCP Services: Cloud Run | Vertex AI | Cloud TTS
```

---

## Directory Structure

```
/
├── apps/
│   ├── story-runtime/          # NatyaScript compiler, MythicEngine, runtime
│   └── story-viewer/           # Web viewer (canvas renderer, chat panel)
├── packages/
│   └── contracts/              # JSON schemas
├── services/
│   ├── agent-orchestrator/     # ADK model gateway, workflow orchestration
│   ├── conversation-agent/     # NEW: Multi-turn conversational ADK agent
│   │   └── src/
│   │       ├── agent.ts        # LlmAgent definition + conversation loop
│   │       ├── prompts.ts      # System prompt + folklore templates
│   │       ├── sessionStore.ts # Persistent multi-turn session management
│   │       ├── server.ts       # WebSocket chat server
│   │       ├── providerRouter.ts # Routes: Stitch MCP vs Nano Banana/Vertex AI
│   │       ├── types.ts        # AgentStreamMessage union type
│   │       └── tools/
│   │           ├── storyGenerator.ts
│   │           ├── storyAnalyzer.ts
│   │           ├── characterBrowser.ts
│   │           ├── characterGenerator.ts
│   │           ├── sceneIllustrator.ts
│   │           ├── playCompiler.ts
│   │           └── audioNarrator.ts
│   ├── resolver/               # HTTP server + casting API routes
│   └── stage-gateway/          # gRPC ingest + WebSocket broadcast
├── docs/
│   ├── audit/                  # Code audit + traceability documents
│   ├── plans/                  # Design and implementation plans
│   └── submission/             # Devpost evidence
├── PLANNING.md                 # This file
└── TASK.md                     # Active task tracking
```

---

## Key Technical Decisions

### Character Generation Providers
- **Puppet-part assets** (head/torso/limbs for animation): Stitch MCP → Stitch HTTP stub → SVG placeholder
- **Illustrations/portraits/scenes** (full images, no parts): Nano Banana/Vertex AI → Stitch generate_screen_from_text → SVG placeholder
- Stitch MCP tools (`mcp__stitch__*`) available in Claude Code dev env only; use Option (c) for production: pre-generated character library bundled as static assets

### TTS / Audio
- Primary: Google Cloud TTS (WaveNet/Neural2 — free tier 1M chars/mo, Indian English + Hindi)
- Stretch: VibeVoice-Realtime 0.5B for multi-speaker narration

### Conversational Agent
- `@google/adk ^0.3.0` `LlmAgent` with persistent per-user sessions (NOT create-and-discard)
- Model: `gemini-2.5-flash` via Vertex AI or API key
- Multi-turn WebSocket protocol at `/ws/chat`

### Video Modality
- Live: canvas animation via `stage_command` WebSocket events IS the live video stream
- Recorded: `captureStream()` + `MediaRecorder` → MP4 artifact via `{ type: "video" }` message

---

## Naming Conventions

- Files: `camelCase.ts` for TypeScript source, `camelCase.js` for browser scripts
- Types: `PascalCase` for interfaces/types, `camelCase` for functions/variables
- Tests: `kebab-case.spec.ts` in a `tests/` directory mirroring `src/`
- NatyaScript: `@<beat> <OPCODE> key=value` format, one command per line

---

## Environment Variables

| Variable | Purpose |
|----------|---------|
| `GEMINI_API_KEY` / `GOOGLE_GENAI_API_KEY` | Gemini API authentication |
| `GOOGLE_GENAI_USE_VERTEXAI=true` | Use Vertex AI instead of API key |
| `GOOGLE_CLOUD_PROJECT` | GCP project ID (for Vertex AI + Cloud TTS) |
| `GOOGLE_CLOUD_LOCATION` | GCP region (e.g. `us-central1`) |
| `AGENTIC_MODEL` | Override model name (default: `gemini-2.5-flash`) |
| `AGENTIC_ANALYZE_ENABLED=true` | Enable agentic story analysis |
| `CONVERSATION_AGENT_ENABLED=true` | Enable conversational agent endpoint |
| `GOOGLE_CLOUD_TTS_ENABLED=true` | Enable Google Cloud TTS audio generation |

---

## Testing Strategy

- **Framework**: Vitest
- **Unit tests**: Each tool/function in `tests/` mirroring `src/`
- **Coverage per test file**: expected use, edge case, failure case
- **Run**: `pnpm test`

---

## Constraints

- Max 500 lines per file; split into modules if approaching limit
- Use `@google/adk` for all Gemini agent interactions
- No external databases; use `InMemoryRunner` for sessions
- Must deploy to Cloud Run with WebSocket support
- Demo video must be ≤ 4 minutes
