#!/usr/bin/env bash
# MaayaaSthala — One-click Cloud Run deployment
# Usage: ./submission/deploy.sh [PROJECT_ID] [REGION]
#
# Prerequisites:
#   - gcloud CLI authenticated (gcloud auth login)
#   - Billing enabled on the GCP project
#   - Gemini API key OR Vertex AI configured

set -euo pipefail

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------
PROJECT_ID="${1:-${GOOGLE_CLOUD_PROJECT:-}}"
REGION="${2:-${GOOGLE_CLOUD_LOCATION:-asia-south1}}"
SERVICE_NAME="maayaasthala"

if [[ -z "$PROJECT_ID" ]]; then
  echo "Usage: $0 <PROJECT_ID> [REGION]"
  echo "  or set GOOGLE_CLOUD_PROJECT env var"
  exit 1
fi

echo "==> Deploying MaayaaSthala to Cloud Run"
echo "    Project:  $PROJECT_ID"
echo "    Region:   $REGION"
echo "    Service:  $SERVICE_NAME"
echo ""

# ---------------------------------------------------------------------------
# Step 1: Set project
# ---------------------------------------------------------------------------
echo "==> Setting GCP project..."
gcloud config set project "$PROJECT_ID"

# ---------------------------------------------------------------------------
# Step 2: Enable required APIs
# ---------------------------------------------------------------------------
echo "==> Enabling required GCP APIs..."
gcloud services enable \
  run.googleapis.com \
  cloudbuild.googleapis.com \
  artifactregistry.googleapis.com \
  aiplatform.googleapis.com \
  texttospeech.googleapis.com

# ---------------------------------------------------------------------------
# Step 3: Deploy to Cloud Run
# ---------------------------------------------------------------------------
echo "==> Deploying to Cloud Run (source deploy)..."
gcloud run deploy "$SERVICE_NAME" \
  --source . \
  --region "$REGION" \
  --allow-unauthenticated \
  --session-affinity \
  --timeout=300 \
  --memory=1Gi \
  --cpu=1 \
  --min-instances=0 \
  --max-instances=3 \
  --set-env-vars "\
CONVERSATION_AGENT_ENABLED=true,\
GOOGLE_CLOUD_TTS_ENABLED=true,\
AGENTIC_ANALYZE_ENABLED=true,\
AGENTIC_CASTING_ENABLED=true,\
AGENTIC_RUN_ENABLED=true,\
AGENTIC_MODEL=gemini-2.5-flash,\
GOOGLE_CLOUD_PROJECT=$PROJECT_ID,\
GOOGLE_CLOUD_LOCATION=$REGION,\
GOOGLE_GENAI_USE_VERTEXAI=true,\
MODEL_GATEWAY_MAX_JSON_ATTEMPTS=3,\
MODEL_GATEWAY_RETRY_BACKOFF_MS=200"

# ---------------------------------------------------------------------------
# Step 4: Get deployment URL
# ---------------------------------------------------------------------------
echo ""
echo "==> Retrieving deployment URL..."
SERVICE_URL=$(gcloud run services describe "$SERVICE_NAME" \
  --region "$REGION" \
  --format='value(status.url)')

echo ""
echo "==> Deployment complete!"
echo ""
echo "    Service URL:  $SERVICE_URL"
echo "    Viewer:       $SERVICE_URL/viewer"
echo "    Health:       $SERVICE_URL/health"
echo ""

# ---------------------------------------------------------------------------
# Step 5: Health check
# ---------------------------------------------------------------------------
echo "==> Running health check..."
HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$SERVICE_URL/health" || echo "000")

if [[ "$HTTP_STATUS" == "200" ]]; then
  echo "    Health check passed (HTTP 200)"
else
  echo "    Health check returned HTTP $HTTP_STATUS"
  echo "    The service may still be starting up. Check logs with:"
  echo "    gcloud run services logs read $SERVICE_NAME --region $REGION --limit 50"
fi

echo ""
echo "==> Done! Open $SERVICE_URL/viewer in your browser."
echo ""
echo "==> To use Gemini API key instead of Vertex AI:"
echo "    gcloud run services update $SERVICE_NAME --region $REGION \\"
echo "      --update-env-vars GEMINI_API_KEY=your-key-here"
