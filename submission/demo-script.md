# MaayaaSthala — Demo Video Script (< 4 minutes)

## Equipment
- Screen recording software (OBS or QuickTime)
- Browser with the deployed MaayaaSthala app open
- Microphone for voiceover
- Resolution: 1920x1080

---

## Timeline

### 0:00 - 0:25 | Hook: beyond the text box

**Screen:** Viewer open with chat on the left and the empty puppet stage on the right

**Voiceover:**
> "Most AI storytelling demos stop at a text box. I wanted to build something that behaves more like a director. MaayaaSthala takes a story request, casts the characters, asks for approval, and performs the result as a live puppet show."

**Action:** Hover over the chat and stage so both are visible from the start.

---

### 0:25 - 0:55 | Story request + user value

**Screen:** Cursor in chat input

**Voiceover:**
> "The value for the user is simple: instead of reading a generated story, they can shape it and watch it become a performance with voices, visuals, and stage direction."

**Action:** Type: `Tell me a Panchatantra story about a clever crow and a greedy snake`

**Voiceover while waiting:**
> "Sutradhar, the storyteller agent, is generating the concept and a NatyaScript screenplay with Gemini 2.5 Flash."

**Action:** Let the generated story concept, characters, and approval prompt appear.

---

### 0:55 - 1:30 | Approval gate + casting

**Screen:** Story approval and character cards

**Voiceover:**
> "I kept approval gates in the experience on purpose. The app does not disappear for a minute and come back with a finished result. It pauses so the user can approve the story direction and then approve the cast."

**Action:** Approve the story, then approve the character cards as they appear.

**Voiceover:**
> "Chitrakar checks the character library first and generates new assets only when needed. Each puppet gets matching expression variants so the performance can shift emotion without losing visual identity."

---

### 1:30 - 2:20 | Clean proof: interleaved output

**Screen:** Start the performance and keep both chat and stage visible

**Action:** Type: `let's perform`

**Voiceover:**
> "This is the proof moment I care most about: the system is not returning one block of output. It is streaming interleaved events over WebSocket. You can see the chat updating while the stage receives portraits, dialogue, scene changes, props, and audio-driven narration."

**Action:** Let one strong sequence play where the audience can see:
- a character appear on stage
- dialogue or narration text update in chat
- a backdrop or prop arrive
- an expression change happen during the same beat

**Voiceover:**
> "That interleaving is what makes the experience feel directed instead of dumped from a model."

---

### 2:20 - 2:55 | Feature highlight pass

**Screen:** Continue performance, then quick cuts if needed

**Voiceover:**
> "Under the hood, Rangmanch compiles NatyaScript into executable stage actions. The viewer renders those actions on an HTML5 canvas, while Google Cloud Text-to-Speech provides character and narration audio."

**Action:** Show one expression change, one backdrop transition, and one prop arrival.

**Voiceover:**
> "The point is not just that the assets are AI-generated. The point is that they arrive in the right order to support the performance."

---

### 2:55 - 3:25 | Clean proof: ADK, GenAI SDK, Cloud Run

**Screen:** Static architecture diagram from the architecture package at `submission/architecture/architecture-diagram.png`

**Voiceover:**
> "The stack is intentionally Google end to end. I built the multi-agent flow with Google ADK, used the Google GenAI SDK for generation workflows, and deployed the app on Cloud Run so the same hosted service can handle the live WebSocket session."

**Action:** Point briefly to the three-agent flow, WebSocket path, and Cloud Run box in the diagram.

**Quick proof cut:** Switch for 3-5 seconds to `package.json` and highlight `@google/adk`, `@google/genai`, and `@google-cloud/text-to-speech`, or briefly show `services/conversation-agent/src/agent.ts` with `Gemini`, `InMemoryRunner`, and `LlmAgent` visible.

**Voiceover:**
> "The diagram shows the live system flow: browser to WebSocket, Cloud Run orchestration, and the three-agent path into Google services. Then I cut to the repo for the code-level proof that this is actually built with Google ADK and the Google GenAI SDK, not just described on a slide."

---

### 3:25 - 3:50 | Why it matters

**Screen:** Return to the app with the performance still visible or just completed

**Voiceover:**
> "MaayaaSthala is my answer to the challenge prompt: use Gemini to create an experience that goes beyond the text box. For the user, that means a story they can guide and watch, not just read."

**Action:** Hold on the completed stage state for a beat.

---

### 3:50 - 4:00 | Close

**Screen:** Final app frame or title card

**Voiceover:**
> "I'm Ravi, and this is MaayaaSthala: an AI puppet theatre for the Gemini Live Agent Challenge."

---

## Recording Tips

1. Use one story prompt you have already tested end to end.
2. Keep chat and stage visible together during the interleaved-output proof moment.
3. If generation waits are slow, trim dead time in editing but keep the visible approval gates.
4. Record the architecture package image from `submission/architecture/architecture-diagram.png`, and use `submission/architecture/architecture-notes.md` if you need a quick narration refresher.
5. Target 3:40 to 3:50 so there is buffer under the 4-minute limit.
