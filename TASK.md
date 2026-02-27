# Story AI — TASK.md

## Active Sprint: Gemini Live Agent Challenge (Deadline: March 16, 2026)

---

## Phase 0: Validation Baseline + Traceability

| Status | Task | Notes |
|--------|------|-------|
| ✅ Done | Create PLANNING.md | Project conventions, architecture, env vars |
| ✅ Done | Create TASK.md | This file |
| ✅ Done | Write code audit document | `docs/audit/2026-02-27-code-validation.md` |
| ✅ Done | Write BMAT brainstorming review | (included in code-validation) |
| ✅ Done | Write requirement traceability matrix | `docs/audit/2026-02-27-requirement-traceability.md` |
| ✅ Done | Lock provider decision | Stitch MCP for puppet parts, Nano Banana/Vertex AI for illustrations. Prod: pre-gen library |

---

## Phase 1: Conversational Agent Core

| Status | Task | Notes |
|--------|------|-------|
| ✅ Done | Create `services/conversation-agent/` skeleton | agent.ts, server.ts, sessionStore.ts, prompts.ts, types.ts, providerRouter.ts |
| ✅ Done | Implement `storyGenerator.ts` | Gemini generates story text + NatyaScript, with retry |
| ✅ Done | Implement `storyAnalyzer.ts` | Wraps existing analyzeStory route |
| ✅ Done | Implement `characterBrowser.ts` | Pre-gen library + runtime cache |
| ✅ Done | Implement `characterGenerator.ts` | Provider router → Stitch stub / SVG |
| ✅ Done | Implement `playCompiler.ts` | NatyaScript → MythicEngine, streams all 4 modalities |
| ✅ Done | Add WebSocket `/ws/chat` to `httpServer.ts` | Upgrade handler, CONVERSATION_AGENT_ENABLED env |
| ✅ Done | Write Vitest tests for Phase 1 tools | 49 tests across 7 test files, all passing |

---

## Phase 2: Multimodal Output Pipeline

| Status | Task | Notes |
|--------|------|-------|
| ✅ Done | Define `AgentStreamMessage` types | text, image, audio, video, stage_command, approval_request, play_start, play_frame |
| ✅ Done | Implement `audioNarrator.ts` | Google Cloud TTS, beat-based sync, graceful fallback |
| ✅ Done | Implement `sceneIllustrator.ts` | Vertex AI Imagen with SVG fallback |
| ✅ Done | Wire multimodal stream through WebSocket | playCompiler emits text+image+audio+stage_command |

---

## Phase 3: Chat UI in Viewer

| Status | Task | Notes |
|--------|------|-------|
| ✅ Done | Add chat panel to `index.html` | Split-view: Chat tab + Casting Studio tab |
| ✅ Done | Create `chatClient.js` | WebSocket to `/ws/chat`, auto-reconnect, ping/pong |
| ✅ Done | Create `chatPanel.js` | Renders text, images, audio, approval cards, play banners |
| ✅ Done | Update `styles.css` | Chat panel, approval cards, stage controls, tab navigation |
| ✅ Done | Update `main.js` | Tab switching + chat client wired to canvas renderer |
| ✅ Done | Register new viewer static assets in `httpServer.ts` | chatClient.js, chatPanel.js routes |

---

## Phase 4: Folklore Quality + Archetypes

| Status | Task | Notes |
|--------|------|-------|
| ✅ Done | Expand `ARCHETYPE_BY_NAME` in `analyzeStory.ts` | gandharva, rakshasa, apsara, rishi, vanara, naga, yaksha, raja, devi, asura + heroes/mentors/animals |
| ✅ Done | Add 5 folklore templates to `prompts.ts` | Chandamama, Panchatantra, Vikram-Betaal, Tenali Raman, Regional — all with NatyaScript hints |

---

## Phase 5: Cloud Deploy + Demo + Submission

| Status | Task | Notes |
|--------|------|-------|
| ⬜ Todo | Deploy conversation agent to Cloud Run | Add env vars, WebSocket support |
| ⬜ Todo | Create architecture diagram | agent + tools + GCP services |
| ⬜ Todo | Record demo video (< 4 min) | Full conversational flow |
| ⬜ Todo | Update `docs/submission/devpost-evidence-*.md` | |
| ⬜ Todo | Update `README.md` | Conversation agent docs |

---

## Discovered During Work

*(Add new sub-tasks here as they are discovered)*

---

## Completion Checklist

- [ ] Agent responds to "Tell me a story" with generated story + NatyaScript
- [ ] User can approve/reject via WebSocket chat
- [ ] Character generation via provider router works
- [ ] `compile_and_run_play` produces stage commands
- [ ] All new tools have passing Vitest tests
- [ ] Google Cloud TTS generates audio for narration beats
- [ ] Scene images generated via Vertex AI
- [ ] Multimodal stream sends all 4 modalities
- [ ] Chat panel renders in viewer with approval cards
- [ ] At least 3 folklore templates produce valid stories
- [ ] Cloud Run deployment works with WebSocket
- [ ] Demo video recorded (< 4 min)
