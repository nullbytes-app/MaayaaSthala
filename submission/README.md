# Submission Package

## Required Items
- Devpost description
- Public repo and README spin-up instructions
- Google Cloud proof
- Architecture diagram
- Demo script

## Core Package Map
- `requirements-audit.md`
- `judging-criteria-checklist.md`
- `devpost-description.md`
- `demo-script.md`
- `cloud-proof-script.md`
- `gcp-deployment-checklist.md`
- `blog-post.md`
- `architecture/`
- `screenshots/`
- `evidence/`

This is a selective map of the primary judge-facing package contents. The detailed cloud-proof and screenshot bundles are listed in the sections below.

## Cloud Proof Bundle
- `submission/evidence/cloud-run-console.png` - Cloud Console screenshot of the service page for `maayaasthala` in `asia-south1`
- `submission/evidence/cloud-run-revisions.png` - Cloud Console screenshot of the revisions view for `maayaasthala`
- `submission/evidence/cloud-run-logs.png` - Cloud Console screenshot of the logs view for `maayaasthala`
- `submission/evidence/service-description.yaml` - curated and redacted current `gcloud run services describe` extract for `maayaasthala` in `asia-south1`
- `submission/evidence/deployment-logs.txt` - current filtered `gcloud run services logs read` extract for `maayaasthala`, focused on healthy runtime behavior
- `submission/evidence/cloud-evidence-index.md` - provenance map showing which artifacts are current submission evidence versus historical support under `docs/submission/evidence/`

## Screenshots
- `screenshots/viewer-request.png` - Shows the app UI in its clean initial state with the Kahani chat panel and stage visible before a request is sent.
- `screenshots/story-approval.png` - Shows a generated story concept in the app UI, including the `Shall I bring this to life?` prompt and the visible casting choice buttons.
- `screenshots/character-approval.png` - Shows the same app flow after `Use library characters` is selected, with the casting buttons disabled and the `Characters set!` confirmation visible under the story concept.
- `screenshots/live-performance.png` - Shows a live performance in progress with the stage scene and active story chat visible together in the app UI.
- `screenshots/live-performance-closeup.png` - Shows a cropped closeup of the live stage, focused on the palace scene and a single on-stage figure in front of the throne.

## Final Check Before Upload
- All links valid
- No unintended placeholders remain; deliberate redactions are documented.
- All mandatory artifacts exist
