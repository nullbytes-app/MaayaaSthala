# Cloud Evidence Index

The final submission bundle now lives under `submission/evidence/`. Historical artifacts remain under `docs/submission/evidence/` for provenance, but judges should start with the final-path files below.

## Current submission evidence

| Proof Target | Status | Final submission file | Provenance and notes |
|---|---|---|---|
| Cloud Run service proof image | met | `submission/evidence/cloud-run-console.png` | Google Cloud Console screenshot of the Cloud Run service page for `maayaasthala`, showing the current service in `asia-south1`. |
| Cloud Run revisions screenshot | met | `submission/evidence/cloud-run-revisions.png` | Google Cloud Console screenshot of the revisions view for `maayaasthala`, showing deployed revision state and traffic view. |
| Cloud Run logs screenshot | met | `submission/evidence/cloud-run-logs.png` | Google Cloud Console screenshot of the logs view for `maayaasthala`, showing recent service logs in console context. |
| Cloud Run service description | met | `submission/evidence/service-description.yaml` | Current curated YAML extract from `gcloud run services describe maayaasthala --platform managed --region asia-south1 --format=yaml`, trimmed to submission-relevant fields and redacted for privacy. |
| Cloud Run deployment logs | met | `submission/evidence/deployment-logs.txt` | Current filtered log extract from `gcloud run services logs read maayaasthala --platform managed --region asia-south1 --limit 60`, keeping healthy viewer/runtime lines and annotating the excluded root-path `404` probe. |

## Historical supporting evidence

| Historical artifact | Why it still matters |
|---|---|
| `docs/submission/evidence/cloud-deploy-summary-2026-02-25.json` | Earlier machine-readable Cloud Run deployment snapshot for the predecessor service name `story-ai-resolver`. Useful for continuity, but not the primary submission path. |
| `docs/submission/evidence/cloud-log-extract-2026-02-25.txt` | Earlier log extract showing Gemini / Vertex-backed runtime activity for the February deployment. |
| `docs/submission/evidence/cloud-e2e-summary-2026-02-25.json` | Earlier live prepare/generate/approve/run flow evidence against the then-current Cloud Run deployment. |
| `docs/submission/evidence/cloud-viewer-2026-02-25.png` | Earlier hosted-viewer screenshot proof from the February deployment. |
| `docs/submission/devpost-evidence-2026-02-25.md` | Narrative index for the historical February evidence bundle. |

## Naming and truthfulness notes

- `story-ai-resolver` is historical evidence from the February deployment bundle.
- `maayaasthala` is the current Cloud Run service verified on 2026-03-07 for the final submission bundle.
- `https://maayaasthala-942680040818.asia-south1.run.app` is the canonical regional Cloud Run URL to show in the proof script and evidence bundle.
- The bundle does not rely on `status.url`, and the curated YAML redacts it for consistency and privacy.
- `https://maayaasthala.nullbytes.app/viewer` is the public custom-domain viewer entrypoint layered on top of the same deployed service.
- The bundle now includes Cloud Console screenshots for the service page, revisions, and logs views.
