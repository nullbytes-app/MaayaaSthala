# Judging Criteria Self-Assessment

Self-assessment against the Gemini Live Agent Challenge scoring rubric.

---

## 1. Innovation & Multimodal UX (40%)

**How we score: HIGH**

| Criterion | Evidence |
|-----------|----------|
| Novel use of Gemini | Three-agent theatre metaphor (Sutradhar/Chitrakar/Rangmanch) — not a generic chatbot, but an AI director orchestrating a live performance |
| Multimodal output | 14+ simultaneous message types: text, images, audio, stage commands, expressions, props, backdrops, moods, voice casting, play lifecycle |
| Creative interleaving | All modalities stream over a single WebSocket in real-time — audio plays while characters animate while expressions crossfade while camera moves |
| Cultural dimension | Indian folklore traditions (Panchatantra, Chandamama, Vikram-Betaal, Tenali Raman, regional) with authentic mythic arc structure |
| Custom DSL | NatyaScript — a purpose-built screenplay language that Gemini generates directly, enabling precise stage direction control |
| Expression system | 4 expression variants per character with multimodal reference-based generation for consistency + crossfade animation |
| Cinematic rendering | Pan, zoom, shake camera effects + mood-based atmospheric lighting on HTML5 Canvas |

**Key differentiator:** This isn't text generation with images attached — it's a live, directed performance where multiple AI outputs (text, images, audio, animation) are synchronized into a coherent theatrical experience.

---

## 2. Technical Implementation (30%)

**How we score: HIGH**

| Criterion | Evidence |
|-----------|----------|
| Google ADK usage | `@google/adk ^0.3.0` — `LlmAgent`, `InMemoryRunner`, multi-turn sessions |
| Google GenAI SDK | `@google/genai ^1.0.0` — image generation for characters, props, scenes, expressions |
| Gemini model | `gemini-2.5-flash` for story generation, structured JSON, NatyaScript |
| Google Cloud TTS | Indian English Chirp3-HD voices with per-character casting, reflected in the deployed runtime logs |
| Cloud Run deployment | Source deploy with session affinity for WebSocket support |
| Multi-agent architecture | Theatre Orchestrator state machine coordinating 3 specialized agents |
| Test coverage | Comprehensive Vitest coverage across the core conversation, orchestration, and runtime flows |
| Code quality | TypeScript, modular architecture, <500 lines per file, comprehensive type system |
| Real-time streaming | WebSocket bidirectional communication with 14+ message types |
| Error handling | Graceful fallbacks (SVG placeholders, browser TTS fallback, retry with backoff) |

**Technical depth highlights:**
- Dual ADK runners (conversational + JSON gateway with thinking disabled)
- Promise-based approval serialization for concurrent turn safety
- NatyaScript compiler with opcode validation
- 4-zone body segmentation for expression animation
- Character persistence with file-based URL optimization

---

## 3. Demo & Presentation (30%)

**How we score: MEDIUM-HIGH (depends on video quality)**

| Criterion | Action |
|-----------|--------|
| Clear problem statement | Script covers "Why Indian folklore + AI" in first 25s |
| Live demonstration | Full flow: request -> generate -> approve -> perform (90s) |
| Feature highlights | Expressions, camera, mood, TTS voices (30s) |
| Architecture explanation | Diagram + GCP services walkthrough (30s) |
| Time management | Script totals ~3:45, under 4:00 limit |
| Polish | Pre-warm models, practice demo story, record audio separately if needed |

**Tips to maximize this score:**
1. Use a story that generates quickly and has visual variety
2. Show the expression crossfade clearly — it's the most visually impressive feature
3. Mention the breadth of the Vitest suite — it signals engineering rigor without relying on a stale count
4. End with a concrete "what's next" (Hindi support, branching narratives)

---

## Summary

| Category | Weight | Self-Score | Notes |
|----------|--------|------------|-------|
| Innovation & Multimodal UX | 40% | 9/10 | Unique theatre metaphor, 14+ message types, custom DSL, cultural depth |
| Technical Implementation | 30% | 9/10 | Full ADK + GenAI SDK + Cloud TTS + Cloud Run, plus broad automated test coverage |
| Demo & Presentation | 30% | 7-8/10 | Strong script, depends on recording execution |
| **Weighted Total** | | **8.5-8.7/10** | |

---

## Mandatory Requirements Checklist

- [x] Uses Gemini model (`gemini-2.5-flash`)
- [x] Uses Google GenAI SDK or ADK (`@google/adk ^0.3.0`, `@google/genai ^1.0.0`)
- [x] Backend hosted on Google Cloud (Cloud Run)
- [x] Creative Storyteller category: generates interleaved multimodal content
- [x] Public code repository
- [x] Text description (DevPost)
- [x] Demo video (< 4 min)
- [x] Architecture diagram
- [x] GCP deployment proof (`submission/evidence/cloud-run-console.png`, `submission/evidence/service-description.yaml`, `submission/evidence/deployment-logs.txt`)

## Bonus Points Checklist

- [ ] Published blog post with #GeminiLiveAgentChallenge (current package includes draft content in `submission/blog-post.md`, not publication proof)
- [x] Automated deployment script (`deploy.sh`)
- [ ] GDG Community profile (Ravi must create separately)
