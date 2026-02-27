# Devpost Evidence Bundle (2026-02-25)

This bundle captures reproducible command/output evidence for the Gemini Live Agent Challenge submission.

## 1) Cloud deployment proof

Command run:

```bash
gcloud run services describe story-ai-resolver --region asia-south1 --format="json(status.url,status.latestReadyRevisionName,status.traffic,spec.template.spec.containers[0].env)"
```

Observed key result:

- `status.url`: `https://story-ai-resolver-xchyzh6yua-el.a.run.app`
- `status.latestReadyRevisionName`: `story-ai-resolver-00009-stx`
- traffic: 100% to latest revision
- runtime env includes:
  - `AGENTIC_ANALYZE_ENABLED=true`
  - `AGENTIC_CASTING_ENABLED=true`
  - `AGENTIC_RUN_ENABLED=true`
  - `AGENTIC_MODEL=gemini-2.5-flash`
  - `GOOGLE_GENAI_USE_VERTEXAI=true`

Machine-readable snapshot: `docs/submission/evidence/cloud-deploy-summary-2026-02-25.json`

## 2) Billing and required API enablement

Commands run:

```bash
gcloud beta billing projects describe sacred-amp-386406 --format="json(projectId,billingAccountName,billingEnabled)"
gcloud services list --enabled --project sacred-amp-386406 --filter="config.name:(run.googleapis.com OR cloudbuild.googleapis.com OR artifactregistry.googleapis.com OR aiplatform.googleapis.com)" --format="value(config.name)"
```

Observed key result:

- billing linked and enabled (`billingEnabled: true`)
- APIs enabled:
  - `run.googleapis.com`
  - `cloudbuild.googleapis.com`
  - `artifactregistry.googleapis.com`
  - `aiplatform.googleapis.com`

## 3) Gemini + ADK runtime evidence

Commands run:

```bash
gcloud logging read "resource.type=cloud_run_revision AND resource.labels.service_name=story-ai-resolver AND textPayload:\"Sending out request, model: gemini-2.5-flash, backend: VERTEX_AI\"" --limit=5 --format="value(timestamp,textPayload)"

gcloud logging read "resource.type=cloud_run_revision AND resource.labels.service_name=story-ai-resolver AND textPayload:\"devpost_bundle_1772021193623\"" --limit=50 --format="value(timestamp,textPayload)"
```

Observed key result:

- Logs show ADK model dispatch lines with `gemini-2.5-flash` and `backend: VERTEX_AI`.
- Logs include ADK event payload entries containing the test story id (`devpost_bundle_1772021193623`) for the verified run.

Log extract file: `docs/submission/evidence/cloud-log-extract-2026-02-25.txt`

## 4) End-to-end agentic flow proof (prepare -> generate -> approve -> run)

Flow executed against live Cloud Run URL with story id `devpost_bundle_1772021193623`.

Observed status codes:

- `POST /v1/casting/prepare`: `200`
- `POST /v1/casting/generate`: `200`
- `POST /v1/casting/approve`: `200`
- `POST /v1/demo/run`: `200`

Observed output highlights:

- generated candidate artifact: `elder_gen_v1`
- approved selections include a generated cast choice:
  - `{"charId":"elder","artifactId":"elder_gen_v1","source":"generated"}`
- run acknowledgement:
  - `{"accepted":6,"dropped":0}`
- replay includes generated cast artifact:
  - `castInReplay`: `hero_raju_v2`, `elder_gen_v1`, `shadow_double_v1`

Machine-readable flow output: `docs/submission/evidence/cloud-e2e-summary-2026-02-25.json`

## 5) Test and typecheck evidence

Command run:

```bash
pnpm test -- --run && pnpm tsc --noEmit
```

Observed key result:

- `Test Files 34 passed (34)`
- `Tests 191 passed | 1 skipped (192)`
- `pnpm tsc --noEmit` completed without diagnostics

## 6) Screenshot evidence

Cloud-deployed viewer screenshot:

- `docs/submission/evidence/cloud-viewer-2026-02-25.png`

---

## Artifact index

- `docs/submission/devpost-evidence-2026-02-25.md`
- `docs/submission/evidence/cloud-deploy-summary-2026-02-25.json`
- `docs/submission/evidence/cloud-e2e-summary-2026-02-25.json`
- `docs/submission/evidence/cloud-log-extract-2026-02-25.txt`
- `docs/submission/evidence/cloud-viewer-2026-02-25.png`
