# Cloud Proof Recording Script

## Recording goal

Capture a short proof that MaayaaSthala is deployed on Google Cloud Run, healthy in `asia-south1`, and serving the live viewer at `https://maayaasthala.nullbytes.app/viewer`.

Prep reference files in this package:

- `submission/evidence/cloud-run-console.png` - Cloud Console screenshot of the service page for `maayaasthala`
- `submission/evidence/cloud-run-revisions.png` - Cloud Console screenshot of the revisions view for `maayaasthala`
- `submission/evidence/cloud-run-logs.png` - Cloud Console screenshot of the logs view for `maayaasthala`
- `submission/evidence/service-description.yaml` - curated current Cloud Run service description
- `submission/evidence/deployment-logs.txt` - current Cloud Run log extract for the same service
- `submission/evidence/cloud-evidence-index.md` - explains which artifacts are current versus historical

## URL normalization

- Use `https://maayaasthala-942680040818.asia-south1.run.app` as the canonical direct Cloud Run URL in the recording.
- Use `https://maayaasthala.nullbytes.app/viewer` as the public custom-domain viewer URL.
- Cloud Run may also report a generated platform alias for the same service; it is not the preferred URL to narrate in the submission bundle.

## Exact screens to show in order

1. Google Cloud Console -> Cloud Run -> service details page for `maayaasthala`
2. Revisions tab for `maayaasthala`
3. Logs tab for `maayaasthala`
4. The live browser page at `https://maayaasthala.nullbytes.app/viewer`

## Short spoken lines or silent-screen prompts

- **Cloud Run service page:** "This is the deployed Cloud Run service for MaayaaSthala."
- **Service metadata visible:** "You can see the service name `maayaasthala`, the region `asia-south1`, and the Cloud Run URL `https://maayaasthala-942680040818.asia-south1.run.app` here."
- **Revisions view:** "This revision view shows the deployed service is ready and serving traffic."
- **Logs view:** "These logs are from the same `maayaasthala` service in Cloud Run."
- **Live viewer in browser:** "And this is the live viewer being served from `https://maayaasthala.nullbytes.app/viewer`."

## What must be visible on screen

- Cloud Run service name: `maayaasthala`
- Region: `asia-south1`
- Cloud Run URL: `https://maayaasthala-942680040818.asia-south1.run.app`
- A ready revision in the Revisions tab showing the deployed service is live
- Cloud Run logs from the same service
- The browser address bar showing `https://maayaasthala.nullbytes.app/viewer`

## Execution-safe capture notes

- Start on the Cloud Run service details page so the service name and region are visible immediately.
- Keep the Cloud Run URL visible on the service details page before switching tabs.
- In Logs, show at least one recent entry while the service name remains visible in the page chrome.
- End on the live viewer so the custom domain proof and the deployed-service proof appear in the same clip.
- Use the saved Console screenshots in `submission/evidence/` as the reference for the service details, revisions, and logs views while recording the final proof clip.

## Target length

30 to 60 seconds total
