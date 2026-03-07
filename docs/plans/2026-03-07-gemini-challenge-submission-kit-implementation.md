# Gemini Challenge Submission Kit Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a complete, judge-ready Gemini Live Agent Challenge submission kit for `MaayaaSthala`, including a requirement audit, polished written materials, static architecture assets, hosted-app screenshots, and a separate Google Cloud proof script.

**Architecture:** Treat the submission package like a product surface of its own. Organize the work into six streams: package structure, compliance audit, narrative docs, architecture assets, hosted-app screenshots, and final verification. Reuse existing evidence where accurate, but normalize everything into a clean `submission/` structure with clear judge-facing paths.

**Tech Stack:** Markdown, existing repo docs, Chrome DevTools screenshots, Excalidraw source JSON, static exported diagram assets, Google Cloud evidence artifacts, lightweight shell/Python verification commands.

**Design Doc:** `docs/plans/2026-03-07-gemini-challenge-submission-kit-design.md`

---

### Task 1: Create the judge-facing submission package skeleton

**Files:**
- Create: `submission/README.md`
- Create: `submission/requirements-audit.md`
- Create: `submission/evidence/cloud-evidence-index.md`
- Create: `submission/screenshots/.gitkeep`
- Create: `submission/architecture/.gitkeep`

**Step 1: Write a failing package completeness check**

Run:

```bash
python3 - <<'PY'
from pathlib import Path
root = Path('/Users/ravi/Documents/nullBytes_Apps/Ai_Agents/Story_AI')
required = [
    root / 'submission/README.md',
    root / 'submission/requirements-audit.md',
    root / 'submission/evidence/cloud-evidence-index.md',
    root / 'submission/screenshots/.gitkeep',
    root / 'submission/architecture/.gitkeep',
]
missing = [str(p.relative_to(root)) for p in required if not p.exists()]
print('MISSING:', missing)
raise SystemExit(1 if missing else 0)
PY
```

Expected: FAIL because the new package files do not exist yet.

**Step 2: Create the package entrypoint and audit skeletons**

Create `submission/README.md` with these sections:

```md
# Submission Package

## Required Items
- Devpost description
- Public repo and README spin-up instructions
- Google Cloud proof
- Architecture diagram
- Demo script

## Package Map
- `requirements-audit.md`
- `devpost-description.md`
- `demo-script.md`
- `cloud-proof-script.md`
- `architecture/`
- `screenshots/`
- `evidence/`

## Final Check Before Upload
- All links valid
- No placeholders remain
- All mandatory artifacts exist
```

Create `submission/requirements-audit.md` with this table header and starter rows:

```md
# Gemini Live Agent Challenge Requirements Audit

| Requirement | Status | Evidence | Notes | Action |
|---|---|---|---|---|
| Uses a Gemini model | TBD | | | |
| Uses Google GenAI SDK or ADK | TBD | | | |
| Uses at least one Google Cloud service | TBD | | | |
| Creative Storyteller interleaved output | TBD | | | |
| Public repo + README spin-up | TBD | | | |
| Google Cloud deployment proof | TBD | | | |
| Architecture diagram | TBD | | | |
| Demo video support package | TBD | | | |
```

Create `submission/evidence/cloud-evidence-index.md` with these sections:

```md
# Cloud Evidence Index

## Live deployment

## Service metadata

## Logs

## Supporting screenshots
```

**Step 3: Re-run the completeness check**

Run the Step 1 command again.

Expected: PASS.

**Step 4: Commit**

```bash
git add submission/README.md submission/requirements-audit.md submission/evidence/cloud-evidence-index.md submission/screenshots/.gitkeep submission/architecture/.gitkeep
git commit -m "docs: scaffold judge-facing submission package"
```

---

### Task 2: Build the requirement-by-requirement audit from repo evidence

**Files:**
- Modify: `submission/requirements-audit.md`
- Modify: `submission/evidence/cloud-evidence-index.md`
- Reference: `README.md`
- Reference: `package.json`
- Reference: `docs/submission/devpost-evidence-2026-02-25.md`
- Reference: `docs/submission/evidence/cloud-deploy-summary-2026-02-25.json`
- Reference: `docs/submission/evidence/cloud-log-extract-2026-02-25.txt`
- Reference: `docs/submission/evidence/cloud-e2e-summary-2026-02-25.json`

**Step 1: Write a failing accuracy checklist**

Run:

```bash
python3 - <<'PY'
from pathlib import Path
audit = Path('/Users/ravi/Documents/nullBytes_Apps/Ai_Agents/Story_AI/submission/requirements-audit.md').read_text()
checks = [
    'Creative Storyteller',
    '@google/adk',
    '@google/genai',
    'Cloud Run',
    'gemini-2.5-flash',
    'met',
    'partially met',
]
missing = [item for item in checks if item not in audit]
print('MISSING:', missing)
raise SystemExit(1 if missing else 0)
PY
```

Expected: FAIL because the audit is still a placeholder.

**Step 2: Fill the audit with evidence-backed findings**

Populate `submission/requirements-audit.md` with:

- a short intro explaining the audit uses `met`, `partially met`, and `missing`
- a mandatory requirements table
- a "What to Submit" table
- a judging criteria table
- a final risk summary section

Include concrete evidence paths such as:

- `package.json`
- `README.md`
- `services/conversation-agent/src/agent.ts`
- `services/conversation-agent/src/providerRouter.ts`
- `services/conversation-agent/src/tools/playCompiler.ts`
- `docs/submission/evidence/cloud-deploy-summary-2026-02-25.json`

Mark known risks honestly, including:

- stale or inconsistent test-count claims
- older Cloud Run service naming in historical evidence
- need for final screenshot and recording bundle

**Step 3: Fill the cloud evidence index**

Document which files prove:

- Cloud Run deployment
- Gemini / Vertex-backed runtime usage
- live end-to-end flow
- viewer screenshot

**Step 4: Re-run the accuracy checklist**

Run the Step 1 command again.

Expected: PASS.

**Step 5: Commit**

```bash
git add submission/requirements-audit.md submission/evidence/cloud-evidence-index.md
git commit -m "docs: add submission compliance audit and cloud evidence index"
```

---

### Task 3: Rewrite the narrative docs in a consistent founder voice

**Files:**
- Modify: `submission/devpost-description.md`
- Modify: `submission/demo-script.md`
- Create: `submission/cloud-proof-script.md`
- Create: `submission/blog-post.md`
- Modify: `README.md`

**Step 1: Write a failing narrative consistency check**

Run:

```bash
python3 - <<'PY'
from pathlib import Path
root = Path('/Users/ravi/Documents/nullBytes_Apps/Ai_Agents/Story_AI')
targets = [
    root / 'README.md',
    root / 'submission/devpost-description.md',
    root / 'submission/demo-script.md',
]
text = '\n'.join(path.read_text() for path in targets)
problems = []
if 'PLACEHOLDER' in text:
    problems.append('placeholder text still present')
if '240+ tests' in text:
    problems.append('stale test-count claim still present')
if 'we built' in text.lower() and 'I built' not in text:
    problems.append('voice likely inconsistent for solo-builder copy')
print('PROBLEMS:', problems)
raise SystemExit(1 if problems else 0)
PY
```

Expected: FAIL because the current docs still contain placeholders and/or stale marketing claims.

**Step 2: Rewrite `submission/devpost-description.md`**

Refactor the file so it:

- uses a consistent solo-builder voice
- stays specific about ADK, GenAI SDK, Cloud Run, TTS, WebSocket streaming, approval gates, and NatyaScript
- reduces repeated brag lines
- explicitly mentions the challenge expectation of going beyond the text box

Keep these major sections:

- Inspiration
- What it does
- How I built it
- Challenges I ran into
- What I learned
- What’s next
- Built with

**Step 3: Rewrite `README.md` for judges without losing developer utility**

Make these changes:

- replace the demo placeholder comment with a compact `Submission Links` section
- add a short note near the top pointing judges to `submission/README.md`
- replace the HTML architecture reference with the new static architecture asset path
- normalize any stale counts or inconsistent claims

**Step 4: Rewrite `submission/demo-script.md`**

Retain the under-4-minute structure, but explicitly align the script to:

- beyond-the-text-box hook in the first 20-30 seconds
- one clean proof moment for interleaved output
- one clean proof moment for Google ADK / GenAI SDK / Cloud Run
- one clear statement of user value

Also replace the old architecture screenshot cue with the new static diagram path.

**Step 5: Create `submission/cloud-proof-script.md`**

Write a short, separate recording script with these sections:

- recording goal
- exact screens to show in order
- short spoken lines or silent-screen prompts
- what must be visible on screen (service name, URL, region, healthy deployment, logs or code evidence)
- total target length: 30-60 seconds

**Step 6: Finalize the bonus-content draft as `submission/blog-post.md`**

Use the current `submission/blog-draft.md` as the source. Keep the strong personal story, but add the explicit hackathon language required for bonus points and normalize any repeated claims.

**Step 7: Re-run the narrative consistency check**

Run the Step 1 command again.

Expected: PASS.

**Step 8: Commit**

```bash
git add README.md submission/devpost-description.md submission/demo-script.md submission/cloud-proof-script.md submission/blog-post.md
git commit -m "docs: rewrite submission narrative and recording scripts"
```

---

### Task 4: Replace the HTML architecture artifact with a static package

**Files:**
- Create: `submission/architecture/architecture-diagram.excalidraw`
- Create: `submission/architecture/architecture-diagram.png`
- Create: `submission/architecture/architecture-notes.md`
- Delete: `submission/architecture-diagram.html`
- Modify: `submission/architecture-diagram.md`
- Modify: `README.md`
- Modify: `submission/demo-script.md`

**Step 1: Write a failing architecture packaging check**

Run:

```bash
python3 - <<'PY'
from pathlib import Path
root = Path('/Users/ravi/Documents/nullBytes_Apps/Ai_Agents/Story_AI')
must_exist = [
    root / 'submission/architecture/architecture-diagram.excalidraw',
    root / 'submission/architecture/architecture-diagram.png',
    root / 'submission/architecture/architecture-notes.md',
]
missing = [str(p.relative_to(root)) for p in must_exist if not p.exists()]
legacy_html = (root / 'submission/architecture-diagram.html').exists()
print('MISSING:', missing)
print('LEGACY_HTML_STILL_PRESENT:', legacy_html)
raise SystemExit(1 if missing or legacy_html else 0)
PY
```

Expected: FAIL.

**Step 2: Create the Excalidraw source**

Build `submission/architecture/architecture-diagram.excalidraw` as a static system diagram with four horizontal zones:

- User / Browser
- Hosted app and WebSocket boundary
- Cloud Run + orchestrator + three agents
- Google services and interleaved outputs

Include labels for:

- `Sutradhar`, `Chitrakar`, `Rangmanch`
- `Gemini 2.5 Flash`
- `Gemini image generation`
- `Google Cloud TTS`
- interleaved outputs: text, images, audio, stage commands

**Step 3: Export the static image**

Export a clean landscape PNG to `submission/architecture/architecture-diagram.png`.

If export must be manual, make sure the plan executor records that step explicitly and verifies the final file exists.

**Step 4: Write architecture notes and update references**

Create `submission/architecture/architecture-notes.md` with:

- a one-paragraph summary
- a short numbered request-to-performance flow
- a short note on why this architecture fits the judging criteria

Update `README.md`, `submission/demo-script.md`, and `submission/architecture-diagram.md` to point to the new package instead of the HTML file.

Delete `submission/architecture-diagram.html` once all references are updated.

**Step 5: Re-run the architecture packaging check**

Run the Step 1 command again.

Expected: PASS.

**Step 6: Commit**

```bash
git add submission/architecture submission/architecture-diagram.md README.md submission/demo-script.md
git rm submission/architecture-diagram.html
git commit -m "docs: replace html architecture diagram with static submission package"
```

---

### Task 5: Capture and organize hosted-app screenshots

**Files:**
- Create: `submission/screenshots/viewer-request.png`
- Create: `submission/screenshots/story-approval.png`
- Create: `submission/screenshots/character-approval.png`
- Create: `submission/screenshots/live-performance.png`
- Create: `submission/screenshots/live-performance-closeup.png`
- Modify: `submission/README.md`

**Step 1: Write a failing screenshot inventory check**

Run:

```bash
python3 - <<'PY'
from pathlib import Path
root = Path('/Users/ravi/Documents/nullBytes_Apps/Ai_Agents/Story_AI')
required = [
    'viewer-request.png',
    'story-approval.png',
    'character-approval.png',
    'live-performance.png',
    'live-performance-closeup.png',
]
missing = [name for name in required if not (root / 'submission/screenshots' / name).exists()]
print('MISSING:', missing)
raise SystemExit(1 if missing else 0)
PY
```

Expected: FAIL.

**Step 2: Capture screenshots from the hosted app**

Use Chrome DevTools against `https://maayaasthala.nullbytes.app/viewer` and save screenshots with the exact names above.

Capture guidelines:

- `viewer-request.png` — clean initial request state with chat and stage visible
- `story-approval.png` — story concept or approval moment
- `character-approval.png` — cast approval card / character selection moment
- `live-performance.png` — wide performance frame with stage, narration, and chat activity visible
- `live-performance-closeup.png` — strongest visual moment that showcases the multimodal stage output

**Step 3: Update `submission/README.md`**

Add a `Screenshots` section listing each image and what it proves.

**Step 4: Re-run the screenshot inventory check**

Run the Step 1 command again.

Expected: PASS.

**Step 5: Commit**

```bash
git add submission/screenshots submission/README.md
git commit -m "docs: add hosted app screenshots for submission package"
```

---

### Task 6: Normalize the cloud proof bundle into final submission paths

**Files:**
- Create: `submission/evidence/cloud-run-console.png`
- Create: `submission/evidence/service-description.yaml`
- Create: `submission/evidence/deployment-logs.txt`
- Modify: `submission/evidence/cloud-evidence-index.md`
- Modify: `submission/cloud-proof-script.md`
- Modify: `submission/README.md`

**Step 1: Write a failing cloud-proof bundle check**

Run:

```bash
python3 - <<'PY'
from pathlib import Path
root = Path('/Users/ravi/Documents/nullBytes_Apps/Ai_Agents/Story_AI')
required = [
    root / 'submission/evidence/cloud-run-console.png',
    root / 'submission/evidence/service-description.yaml',
    root / 'submission/evidence/deployment-logs.txt',
]
missing = [str(p.relative_to(root)) for p in required if not p.exists()]
print('MISSING:', missing)
raise SystemExit(1 if missing else 0)
PY
```

Expected: FAIL.

**Step 2: Gather or normalize the cloud-proof artifacts**

Use the existing `docs/submission/evidence/` files as source material where still accurate. Add final-path copies or refreshed captures so the submission bundle has a single obvious location for:

- Cloud Run console proof screenshot
- service description YAML
- deployment logs

Make sure `submission/evidence/cloud-evidence-index.md` explains what is historical evidence versus what is current submission evidence.

**Step 3: Update the cloud-proof script and package README**

Ensure `submission/cloud-proof-script.md` and `submission/README.md` both point to the exact evidence files in `submission/evidence/`.

**Step 4: Re-run the cloud-proof bundle check**

Run the Step 1 command again.

Expected: PASS.

**Step 5: Commit**

```bash
git add submission/evidence submission/cloud-proof-script.md submission/README.md
git commit -m "docs: finalize cloud proof bundle for submission"
```

---

### Task 7: Run the final submission-package verification sweep

**Files:**
- Modify: `submission/README.md`
- Modify: `submission/requirements-audit.md`
- Modify: `README.md`

**Step 1: Run the final package verification**

Run:

```bash
python3 - <<'PY'
from pathlib import Path
root = Path('/Users/ravi/Documents/nullBytes_Apps/Ai_Agents/Story_AI')
must_exist = [
    'submission/README.md',
    'submission/requirements-audit.md',
    'submission/devpost-description.md',
    'submission/demo-script.md',
    'submission/cloud-proof-script.md',
    'submission/blog-post.md',
    'submission/architecture/architecture-diagram.excalidraw',
    'submission/architecture/architecture-diagram.png',
    'submission/architecture/architecture-notes.md',
    'submission/screenshots/viewer-request.png',
    'submission/screenshots/story-approval.png',
    'submission/screenshots/character-approval.png',
    'submission/screenshots/live-performance.png',
    'submission/screenshots/live-performance-closeup.png',
    'submission/evidence/cloud-run-console.png',
    'submission/evidence/service-description.yaml',
    'submission/evidence/deployment-logs.txt',
]
missing = [path for path in must_exist if not (root / path).exists()]
text = '\n'.join((root / p).read_text(errors='ignore') for p in [
    'README.md',
    'submission/README.md',
    'submission/requirements-audit.md',
    'submission/devpost-description.md',
    'submission/demo-script.md',
    'submission/cloud-proof-script.md',
])
problems = []
if 'PLACEHOLDER' in text:
    problems.append('placeholder text remains')
if 'submission/architecture-diagram.html' in text:
    problems.append('legacy architecture html reference remains')
if '240+ tests' in text:
    problems.append('stale test-count claim remains')
print('MISSING:', missing)
print('PROBLEMS:', problems)
raise SystemExit(1 if missing or problems else 0)
PY
```

Expected: PASS.

**Step 2: Manual review checklist**

Verify manually:

- the package clearly answers every mandatory requirement
- the diagram is readable at a glance
- the demo script opens with the beyond-the-text-box hook
- the cloud-proof script is separate and short
- the screenshots come from the hosted app and feel current
- the voice is consistent and human across the docs

**Step 3: Commit**

```bash
git add README.md submission
git commit -m "docs: finalize gemini challenge submission kit"
```
