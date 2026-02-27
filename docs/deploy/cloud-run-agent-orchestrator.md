# Deploy Resolver (Agentic Runtime) to Cloud Run

This guide deploys the `resolver` service, which hosts the HTTP API and agent-orchestrator workflows.

## Prerequisites

- `gcloud` CLI authenticated to your project
- Billing enabled for Cloud Run and Artifact Registry
- APIs enabled: `run.googleapis.com`, `cloudbuild.googleapis.com`, `artifactregistry.googleapis.com`

```bash
gcloud services enable run.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com
```

## Set deploy variables

```bash
export PROJECT_ID="your-gcp-project-id"
export REGION="asia-south1"
export SERVICE_NAME="story-ai-resolver"
```

```bash
gcloud config set project "$PROJECT_ID"
```

## Deploy resolver service

Deploy from source, run the resolver startup command, and set agentic flags + model gateway env vars:

```bash
gcloud run deploy "$SERVICE_NAME" \
  --source . \
  --region "$REGION" \
  --allow-unauthenticated \
  --set-env-vars AGENTIC_ANALYZE_ENABLED=true,AGENTIC_CASTING_ENABLED=true,AGENTIC_RUN_ENABLED=true,AGENTIC_MODEL=gemini-2.5-flash,GOOGLE_CLOUD_PROJECT="$PROJECT_ID",GOOGLE_CLOUD_LOCATION="$REGION",GOOGLE_GENAI_USE_VERTEXAI=true,MODEL_GATEWAY_MAX_JSON_ATTEMPTS=3,MODEL_GATEWAY_RETRY_BACKOFF_MS=200
```

Important: for source deployments, keep the container command/args unset so Cloud Run uses the buildpack process launcher. If you previously set a custom command and the service fails to start, reset to defaults:

```bash
gcloud run services update "$SERVICE_NAME" \
  --region "$REGION" \
  --command="" \
  --args=""
```

If you are not using Vertex AI, set a Gemini API key instead:

```bash
gcloud run services update "$SERVICE_NAME" \
  --region "$REGION" \
  --set-env-vars GEMINI_API_KEY="your-api-key"
```

## Key environment variables

- `AGENTIC_ANALYZE_ENABLED`: enables agentic analyze path
- `AGENTIC_CASTING_ENABLED`: enables agentic casting path
- `AGENTIC_RUN_ENABLED`: enables agentic run orchestration path
- `AGENTIC_MODEL`: model identifier for ADK gateway (`gemini-2.5-flash` default)
- `GEMINI_API_KEY`, `GOOGLE_GENAI_API_KEY`, or `GOOGLE_API_KEY`: enables Gemini API auth mode
- `GOOGLE_GENAI_USE_VERTEXAI=true` + `GOOGLE_CLOUD_PROJECT` + `GOOGLE_CLOUD_LOCATION`: enables Vertex AI auth mode
- `MODEL_GATEWAY_MAX_JSON_ATTEMPTS`: retry count for transient model/JSON-format failures (default: `3`)
- `MODEL_GATEWAY_RETRY_BACKOFF_MS`: retry backoff base delay in milliseconds (default: `200`)

## Verify deployment

```bash
gcloud run services describe "$SERVICE_NAME" --region "$REGION" --format='value(status.url)'
```

```bash
gcloud run services logs read "$SERVICE_NAME" --region "$REGION" --limit 100
```

Successful startup logs include:

- `[resolver] listening on http://0.0.0.0:8080 ...`
- `[resolver-trace] {"requestId":"...","stage":"resolver.http.request.start",...}`
