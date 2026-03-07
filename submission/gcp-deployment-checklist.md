# GCP Deployment Checklist

Follow these steps to deploy MaayaaSthala and capture deployment proof for the submission.

## Prerequisites

- [ ] `gcloud` CLI installed and authenticated (`gcloud auth login`)
- [ ] GCP project with billing enabled
- [ ] Gemini API access (either API key or Vertex AI)

## Step 1: Deploy

```bash
chmod +x submission/deploy.sh
./submission/deploy.sh YOUR_PROJECT_ID asia-south1
```

The script will:
1. Enable required GCP APIs (Cloud Run, Cloud Build, Artifact Registry, AI Platform, Cloud TTS)
2. Deploy from source with all environment variables
3. Print the deployment URL
4. Run a health check

## Step 2: Verify Deployment

First verify the deployment generically by opening the viewer URL printed by `./submission/deploy.sh` in your browser.

For the current final package proof bundle, the two judge-facing live endpoints are:

```
https://maayaasthala-942680040818.asia-south1.run.app/viewer
https://maayaasthala.nullbytes.app/viewer
```

Test the conversational flow:
1. Type "Tell me a Panchatantra story about a clever monkey"
2. Wait for story generation
3. Approve the story concept
4. Review and approve each character
5. Type "let's perform" to start the play
6. Verify: text, images, audio, and stage animation all work

## Step 3: Capture Deployment Proof

### 3a. Cloud Run Console Screenshot

1. Open [Google Cloud Console](https://console.cloud.google.com/run)
2. Navigate to Cloud Run > Services > `maayaasthala`
3. Screenshot showing:
   - Service name and status (green checkmark)
   - Region
   - URL
   - Revision details

### 3b. Service Description

```bash
mkdir -p submission/tmp
gcloud run services describe maayaasthala \
  --region asia-south1 \
  --format yaml > submission/tmp/gcloud-service-description.raw.yaml
```

Then curate and redact the raw output into the final package artifact:

```bash
# create submission/evidence/service-description.yaml from the raw file,
# keeping only submission-relevant fields and redacting sensitive values
```

### 3c. Live App Screenshot

1. Open the deployed `/viewer` URL
2. Complete a full story flow
3. Screenshot the chat panel showing the conversation
4. Screenshot the canvas stage during performance

### 3d. Logs

```bash
mkdir -p submission/tmp
gcloud run services logs read maayaasthala \
  --region asia-south1 \
  --limit 50 > submission/tmp/gcloud-deployment-logs.raw.txt
```

Then curate the final package log excerpt:

```bash
# create submission/evidence/deployment-logs.txt from the raw log file,
# keeping only healthy runtime lines and removing noisy or sensitive entries
```

Look for these success indicators in logs:
- `[resolver] listening on http://0.0.0.0:8080 ...`
- `[conversation-agent] enabled`
- WebSocket connection events

## Step 4: Organize Evidence

Save raw capture files in `submission/tmp/`, curate final Cloud Run evidence into `submission/evidence/`, and keep app-flow screenshots in `submission/screenshots/`:

```
submission/tmp/
  gcloud-service-description.raw.yaml
  gcloud-deployment-logs.raw.txt

submission/evidence/
  cloud-run-console.png       # Cloud Run dashboard screenshot
  cloud-run-revisions.png     # Revisions view screenshot
  cloud-run-logs.png          # Logs view screenshot
  service-description.yaml    # Curated/redacted service description for judges
  deployment-logs.txt         # Curated/redacted healthy runtime log excerpt

submission/screenshots/
  viewer-request.png          # Hosted app before a request is sent
  story-approval.png          # Story concept and approval UI
  character-approval.png      # Character confirmation UI
  live-performance.png        # Performance in progress
  live-performance-closeup.png # Stage closeup used in the final package
```

## Troubleshooting

**Service fails to start:**
```bash
gcloud run services logs read maayaasthala --region asia-south1 --limit 100
```

**WebSocket not connecting:**
- Ensure `--session-affinity` is set (deploy.sh does this)
- Check that `CONVERSATION_AGENT_ENABLED=true` is in env vars

**No AI generation (characters/stories):**
- Verify Gemini API access: either `GOOGLE_GENAI_USE_VERTEXAI=true` with proper IAM, or set a `GEMINI_API_KEY`
- Check AI Platform API is enabled: `gcloud services list --enabled | grep aiplatform`

**No audio narration:**
- Verify Cloud TTS API is enabled: `gcloud services list --enabled | grep texttospeech`
- Check `GOOGLE_CLOUD_TTS_ENABLED=true` is set
