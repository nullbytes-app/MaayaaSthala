# MaayaaSthala — AI Puppet Theatre

MaayaaSthala is a live AI puppet theatre that turns a story request into a staged Indian folklore performance. Gemini-powered agents write the tale, assemble the cast, and perform it in the browser with narration, visuals, and animation.

## Why this is different

This is not a chatbot that replies with a block of text and a few generated assets. The experience moves through a live show pipeline:

1. You ask for a story.
2. The system pitches the story for approval.
3. You confirm the cast.
4. The agents perform the final story as a staged multimodal production.

Built for the [Gemini Live Agent Challenge](https://geminiliveagentchallenge.devpost.com/) — Creative Storyteller category. For the full challenge package, see `submission/README.md`.

## Project Links

<!-- Live Project / Submission / Proof -->

- Live experience: [Open the viewer](https://maayaasthala.nullbytes.app/viewer)
- Challenge materials: [Submission hub](submission/README.md) | [Devpost description](submission/devpost-description.md) | [Demo script](submission/demo-script.md)
- Technical materials: [Cloud setup + proof notes](submission/cloud-proof-script.md) | [Architecture diagram](submission/architecture/architecture-diagram.png) | [Cloud Run console proof](submission/evidence/cloud-run-console.png)

## Quick Start

```bash
# 1. Install dependencies
pnpm install

# 2. Set your Gemini API key
export GEMINI_API_KEY="your-key-here"
export CONVERSATION_AGENT_ENABLED=true
export GOOGLE_CLOUD_TTS_ENABLED=true  # optional, for narration audio

# 3. Start the server
pnpm start:resolver
```

Open `http://127.0.0.1:8080/viewer` and type "Tell me a Panchatantra story about a clever crow."

## How It Works

You type a story request. Three agents hand the show off in sequence:

1. **Sutradhar** writes the folklore story beat and NatyaScript screenplay with Gemini 2.5 Flash
2. **Chitrakar** builds the cast from the character library or generates missing puppets with 4 expression variants
3. **You approve the cast** to move the experience from planning into performance
4. **Rangmanch** compiles the screenplay into stage cues and stages the live show with streamed text, visuals, audio, and animation in the browser

## Architecture

```
Browser ←→ WebSocket ←→ Cloud Run (Resolver + Conversation Agent)
                              ↓
                    Theatre Orchestrator (State Machine)
                    ├── Sutradhar  → Story Generator (Gemini 2.5 Flash)
                    ├── Chitrakar → Character Browser + Generator (Gemini Image Gen)
                    └── Rangmanch → Play Compiler + Audio Narrator (Cloud TTS)
                              ↓
                    14+ message types streamed over WebSocket
                              ↓
                    HTML5 Canvas Stage
                    ├── Expression Engine (4-zone crossfade)
                    ├── Mood Engine (atmospheric lighting)
                    └── Cinematic Effects (pan/zoom/shake)
```

See `submission/architecture/architecture-diagram.png` for the architecture overview, `submission/architecture/architecture-diagram.excalidraw` for the editable source, and `submission/architecture/architecture-notes.md` for the companion notes.

## Features

- **Approval-gated story flow** — prompt, story pitch, cast confirmation, then live performance
- **4 expression variants per character** — neutral, happy, angry, sad with crossfade animation
- **AI-generated props and backdrops** — unique images for each story
- **Character-aware narration** — per-character voice casting with Indian English delivery for the staged performance
- **Cinematic rendering** — camera pan/zoom/shake, mood-based atmospheric lighting
- **5 folklore traditions** — Panchatantra, Chandamama, Vikram-Betaal, Tenali Raman, regional folk tales

## Project Structure

```
apps/
  story-runtime/          # NatyaScript compiler + MythicEngine runtime
  story-viewer/           # Web viewer (HTML5 canvas, chat panel, expression engine)

services/
  conversation-agent/     # Multi-turn conversational ADK agent
    src/
      agent.ts            # LlmAgent + InMemoryRunner setup
      agents/             # Sutradhar, Chitrakar, Rangmanch + Orchestrator
      tools/              # Story generator, character browser/gen, play compiler, audio, scene illustrator
      prompts.ts          # System prompt + 5 folklore templates
      types.ts            # 14+ AgentStreamMessage types
      providerRouter.ts   # Image generation routing (Gemini, Vertex AI, fallbacks)
  resolver/               # HTTP server + WebSocket handler
  agent-orchestrator/     # ADK model gateway
  stage-gateway/          # gRPC ingest + WebSocket broadcast

packages/
  contracts/              # JSON schemas

submission/               # Devpost materials, deployment helpers, architecture assets
```

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `GEMINI_API_KEY` | Yes* | Gemini API key |
| `CONVERSATION_AGENT_ENABLED` | Yes | Set to `true` to enable the conversational agent |
| `GOOGLE_CLOUD_TTS_ENABLED` | No | Set to `true` for Cloud TTS narration |
| `GOOGLE_CLOUD_PROJECT` | For Vertex AI | GCP project ID |
| `GOOGLE_CLOUD_LOCATION` | For Vertex AI | GCP region (e.g., `asia-south1`) |
| `GOOGLE_GENAI_USE_VERTEXAI` | For Vertex AI | Set to `true` to use Vertex AI instead of API key |
| `AGENTIC_MODEL` | No | Override model (default: `gemini-2.5-flash`) |

*Either `GEMINI_API_KEY` or Vertex AI configuration is required.

## GCP Deployment Guide

Deploy to Cloud Run with the helper script:

```bash
./submission/deploy.sh YOUR_PROJECT_ID asia-south1
```

This helper script enables the required GCP APIs, configures WebSocket session affinity, and sets the core environment variables for Cloud Run. See [submission/gcp-deployment-checklist.md](submission/gcp-deployment-checklist.md) for the step-by-step checklist and verification details.

## Tests

```bash
pnpm test
```

Vitest covers the conversation flow, tool behavior, orchestrator state machine, and runtime contracts. Run the suite locally before deployment or submission updates.

## Technical Stack

- **Gemini 2.5 Flash** — story generation, NatyaScript generation, structured JSON
- **Google ADK** — multi-agent orchestration across Sutradhar, Chitrakar, Rangmanch, and the conversation flow
- **Google GenAI SDK** — Gemini model access and generation tooling
- **WebSocket streaming** — live agent and stage updates from Cloud Run to the browser viewer across 14+ real-time message types
- **Google Cloud TTS** — deployed narration with Indian English Chirp3-HD voices, with evidence captured in `submission/evidence/deployment-logs.txt`
- **Google Cloud Run** — deployment target for the resolver and conversation agent with WebSocket support
- **Gemini Image Generation** — character portraits, expression variants, props, scene backdrops
- **Runtime & tooling** — TypeScript, Node.js, `ws`, HTML5 Canvas, Vitest, and zod

## License

MIT

## Author

Ravi Kumar Sriram — [github.com/nullbytes-app](https://github.com/nullbytes-app)
