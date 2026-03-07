# MaayaaSthala — Architecture Package

This package contains the judge-facing architecture assets for MaayaaSthala: a static diagram, an editable Excalidraw source, and short companion notes.

## Package contents

- Static diagram for judges and docs: `submission/architecture/architecture-diagram.png`
- Editable source: `submission/architecture/architecture-diagram.excalidraw`
- Companion explanation: `submission/architecture/architecture-notes.md`

## What the package shows

- `User / Browser` - prompt entry, approval flow, and the rendered puppet stage
- `Hosted app and WebSocket boundary` - resolver, session state, and the live streaming channel
- `Cloud Run orchestration layer` - Cloud Run deployment, theatre orchestrator, and the three agents `Sutradhar`, `Chitrakar`, and `Rangmanch`
- `Google services and interleaved outputs` - `Gemini 2.5 Flash`, Gemini image generation, `Google Cloud TTS`, and the streamed outputs: text, images, audio, and stage commands

Use the PNG in the README, demo, or submission materials, and keep the Excalidraw source as the editable master for future updates.
