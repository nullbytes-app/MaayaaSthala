# GitHub README Refresh Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Refresh `README.md` so it serves as a stronger GitHub front page for the project while still pointing judges to the curated `submission/` package.

**Architecture:** Keep `README.md` as the repo front door and preserve its developer usability. Strengthen only the sections that affect first impression, challenge clarity, technical credibility, and evidence discovery, while leaving the deeper compliance/audit material in `submission/`.

**Tech Stack:** Markdown, existing repo docs, curated submission package under `submission/`, lightweight shell verification.

**Design Doc:** `docs/plans/2026-03-07-github-readme-refresh-design.md`

---

### Task 1: Tighten the README top section and project framing

**Files:**
- Modify: `README.md`

**Step 1: Write a failing wording-presence check**

Run:

```bash
python3 - <<'PY'
from pathlib import Path
text = Path('/Users/ravi/Documents/nullBytes_Apps/Ai_Agents/Story_AI/README.md').read_text()
checks = [
    'Why this is different',
    'Live Project / Submission / Proof',
]
missing = [item for item in checks if item not in text]
print('MISSING:', missing)
raise SystemExit(1 if missing else 0)
PY
```

Expected: FAIL because the new GitHub-facing sections do not exist yet.

**Step 2: Rewrite the opening section**

Update the top of `README.md` so it:

- keeps the project title and Gemini Live Agent Challenge context
- sharpens the first paragraph to explain what MaayaaSthala is in clearer, more distinctive terms
- keeps the pointer to `submission/README.md`
- avoids sounding like a submission-only landing page

Use a shorter, more direct opening than the current version.

**Step 3: Add a `Why this is different` section near the top**

Add a short section explaining that the experience is not a normal chatbot with media attachments.

It should explain the flow in plain language:

- story request
- story approval
- cast confirmation
- staged multimodal performance

**Step 4: Re-run the wording-presence check**

Run the Step 1 command again.

Expected: PASS.

**Step 5: Commit**

```bash
git add README.md
git commit -m "docs: sharpen github readme framing"
```

---

### Task 2: Add a compact link hub for live project, submission, and proof

**Files:**
- Modify: `README.md`

**Step 1: Write a failing link-block check**

Run:

```bash
python3 - <<'PY'
from pathlib import Path
text = Path('/Users/ravi/Documents/nullBytes_Apps/Ai_Agents/Story_AI/README.md').read_text()
checks = [
    'Live Project / Submission / Proof',
    'https://maayaasthala.nullbytes.app/viewer',
    'submission/README.md',
    'submission/evidence/cloud-run-console.png',
]
missing = [item for item in checks if item not in text]
print('MISSING:', missing)
raise SystemExit(1 if missing else 0)
PY
```

Expected: FAIL until the new section is added.

**Step 2: Add the compact proof-and-links section**

Create a short `Live Project / Submission / Proof` section near the top of `README.md` that links to:

- the live viewer URL
- `submission/README.md`
- `submission/devpost-description.md`
- `submission/demo-script.md`
- `submission/cloud-proof-script.md`
- `submission/architecture/architecture-diagram.png`
- `submission/evidence/cloud-run-console.png`

Keep it concise; this is a GitHub front page, not a full package dump.

**Step 3: Re-run the link-block check**

Run the Step 1 command again.

Expected: PASS.

**Step 4: Commit**

```bash
git add README.md
git commit -m "docs: add github readme proof links"
```

---

### Task 3: Sharpen the product and technical sections without bloating the page

**Files:**
- Modify: `README.md`

**Step 1: Write a failing technical-signal check**

Run:

```bash
python3 - <<'PY'
from pathlib import Path
text = Path('/Users/ravi/Documents/nullBytes_Apps/Ai_Agents/Story_AI/README.md').read_text()
checks = [
    'Google ADK',
    'Google GenAI SDK',
    'WebSocket streaming',
]
missing = [item for item in checks if item not in text]
print('MISSING:', missing)
raise SystemExit(1 if missing else 0)
PY
```

Expected: FAIL if those signals are not surfaced clearly enough yet.

**Step 2: Refine the `How It Works`, `Features`, and stack sections**

Make the README clearer by:

- tightening agent-role descriptions so Sutradhar, Chitrakar, and Rangmanch each have a distinct role
- reducing redundant phrasing between `How It Works` and `Features`
- surfacing the technical stack more directly so the page quickly communicates:
  - Gemini 2.5 Flash
  - Google ADK
  - Google GenAI SDK
  - Cloud Run
  - Google Cloud Text-to-Speech
  - WebSocket streaming

This can be done with one new short section or by rewriting the existing bullets, but avoid inflating the README.

**Step 3: Re-run the technical-signal check**

Run the Step 1 command again.

Expected: PASS.

**Step 4: Commit**

```bash
git add README.md
git commit -m "docs: strengthen github readme technical framing"
```

---

### Task 4: Run final README verification

**Files:**
- Verify: `README.md`

**Step 1: Run the final README verification**

Run:

```bash
python3 - <<'PY'
from pathlib import Path
text = Path('/Users/ravi/Documents/nullBytes_Apps/Ai_Agents/Story_AI/README.md').read_text()
problems = []
required = [
    'submission/README.md',
    'Why this is different',
    'Live Project / Submission / Proof',
    'https://maayaasthala.nullbytes.app/viewer',
    'Google ADK',
    'Google GenAI SDK',
    'Cloud Run',
    'Google Cloud TTS',
]
missing = [item for item in required if item not in text]
if 'PLACEHOLDER' in text:
    problems.append('placeholder text remains')
if '240+ tests' in text:
    problems.append('stale exact-style test claim remains')
print('MISSING:', missing)
print('PROBLEMS:', problems)
raise SystemExit(1 if missing or problems else 0)
PY
```

Expected: PASS.

**Step 2: Manual review**

Verify manually that:

- the page reads like a GitHub front door, not a Devpost clone
- judges can find the strongest proof quickly
- developers can still find Quick Start, deployment, and tests without friction
- the wording stays aligned with the `submission/` package

**Step 3: Commit**

```bash
git add README.md
git commit -m "docs: refresh github readme for challenge entry"
```
