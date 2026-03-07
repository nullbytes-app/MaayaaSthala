# MaayaaSthala Architecture Notes

MaayaaSthala is a browser-based puppet theatre that sends a live story request into a hosted WebSocket session, routes that session through a Cloud Run orchestration layer, and turns Gemini-generated story structure, image generation, and Google Cloud TTS narration into an interleaved performance.

`Sutradhar` handles story and screenplay generation with `Gemini 2.5 Flash`, `Chitrakar` handles character and scene imagery with Gemini image generation, and `Rangmanch` converts the approved story into timed stage actions, narration, and streamed stage updates that the browser renders as a live show.

## Request-to-performance flow

1. The user sends a story request from the browser and keeps the session open over WebSocket for approvals and live playback.
2. The hosted resolver and session layer on Cloud Run maintain the conversation state, approval gates, and streaming boundary.
3. The theatre orchestrator dispatches work to `Sutradhar`, `Chitrakar`, and `Rangmanch` depending on whether the app needs story structure, images, or stage execution.
4. Google services provide the core generation primitives: `Gemini 2.5 Flash` for story and screenplay structure, Gemini image generation for characters and scenes, and `Google Cloud TTS` for narration audio.
5. The app streams interleaved outputs back to the browser as text, images, audio, and stage commands so the user experiences a directed performance instead of a single model dump.

## Why this fits the judging criteria

This architecture supports the judging criteria because it clearly shows a real Gemini-powered multi-agent workflow, a credible Google Cloud deployment path on Cloud Run, and a multimodal user experience where outputs are interleaved in real time instead of returned as one static response.
