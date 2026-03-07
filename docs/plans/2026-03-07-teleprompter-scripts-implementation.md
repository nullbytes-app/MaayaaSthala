# Teleprompter Scripts Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add dedicated spoken teleprompter scripts for the main demo and Cloud Run proof recording while preserving the existing cue-sheet scripts in `submission/`.

**Architecture:** Keep the current cue-sheet documents as operational guides and add separate performer-friendly script files for spoken delivery. The new files should be aligned with the existing proof package, demo flow, and screenshots, but optimized for natural speech and easier recording.

**Tech Stack:** Markdown, existing `submission/` recording docs, current proof bundle and screenshots, lightweight shell verification.

**Design Doc:** `docs/plans/2026-03-07-teleprompter-scripts-design.md`

---

### Task 1: Create the spoken teleprompter companion files

**Files:**
- Create: `submission/demo-teleprompter.md`
- Create: `submission/cloud-proof-teleprompter.md`

**Step 1: Write a failing file-presence check**

Run:

```bash
python3 - <<'PY'
from pathlib import Path
root = Path('/Users/ravi/Documents/nullBytes_Apps/Ai_Agents/Story_AI')
required = [
    root / 'submission/demo-teleprompter.md',
    root / 'submission/cloud-proof-teleprompter.md',
]
missing = [str(p.relative_to(root)) for p in required if not p.exists()]
print('MISSING:', missing)
raise SystemExit(1 if missing else 0)
PY
```

Expected: FAIL because the teleprompter files do not exist yet.

**Step 2: Create `submission/demo-teleprompter.md`**

Build a spoken-first script with:

- a short title
- target duration note (`3:15-3:45`)
- short beat headings
- first-person founder voice
- one short paragraph per spoken beat

Cover these beats:

- hook: beyond the text box
- user value
- story and cast approvals
- interleaved-output proof moment
- Google stack proof
- closing line

Avoid operator cues like `Screen:` or `Action:` in the body.

**Step 3: Create `submission/cloud-proof-teleprompter.md`**

Build a spoken-first script with:

- a short title
- target duration note (`30-45 seconds`)
- very short beat headings or short numbered flow
- direct factual language

Cover these beats:

- Cloud Run service identity
- region
- revisions readiness
- logs
- custom-domain viewer

Keep the wording easy to read aloud while clicking through the console.

**Step 4: Re-run the file-presence check**

Run the Step 1 command again.

Expected: PASS.

**Step 5: Commit**

```bash
git add submission/demo-teleprompter.md submission/cloud-proof-teleprompter.md
git commit -m "docs: add recording teleprompter scripts"
```

---

### Task 2: Align the teleprompters with the existing cue sheets and proof package

**Files:**
- Modify: `submission/demo-teleprompter.md`
- Modify: `submission/cloud-proof-teleprompter.md`
- Reference: `submission/demo-script.md`
- Reference: `submission/cloud-proof-script.md`
- Reference: `submission/README.md`

**Step 1: Write a failing alignment check**

Run:

```bash
python3 - <<'PY'
from pathlib import Path
root = Path('/Users/ravi/Documents/nullBytes_Apps/Ai_Agents/Story_AI')
demo = (root / 'submission/demo-teleprompter.md').read_text(errors='ignore') if (root / 'submission/demo-teleprompter.md').exists() else ''
cloud = (root / 'submission/cloud-proof-teleprompter.md').read_text(errors='ignore') if (root / 'submission/cloud-proof-teleprompter.md').exists() else ''
checks = {
    'demo_hook': 'text box' in demo.lower(),
    'demo_stack': 'Google ADK' in demo and 'Google GenAI SDK' in demo and 'Cloud Run' in demo,
    'cloud_service': 'maayaasthala' in cloud,
    'cloud_region': 'asia-south1' in cloud,
    'cloud_viewer': 'maayaasthala.nullbytes.app/viewer' in cloud,
}
failed = [name for name, ok in checks.items() if not ok]
print('FAILED:', failed)
raise SystemExit(1 if failed else 0)
PY
```

Expected: FAIL until the scripts are fully aligned.

**Step 2: Align the demo teleprompter to the actual package**

Ensure `submission/demo-teleprompter.md` matches the current proof package and app flow:

- does not overclaim beyond the current screenshots and evidence
- uses the current demo trigger phrasing already established in the package
- reflects the same Google stack proof points already used in `submission/demo-script.md`
- stays shorter and more natural than the cue sheet

**Step 3: Align the cloud-proof teleprompter to the actual proof bundle**

Ensure `submission/cloud-proof-teleprompter.md` names:

- Cloud Run service `maayaasthala`
- region `asia-south1`
- direct Cloud Run URL
- public viewer URL

The script should track the same sequence as `submission/cloud-proof-script.md`, but in more natural spoken form.

**Step 4: Re-run the alignment check**

Run the Step 1 command again.

Expected: PASS.

**Step 5: Commit**

```bash
git add submission/demo-teleprompter.md submission/cloud-proof-teleprompter.md
git commit -m "docs: align teleprompter scripts with proof package"
```

---

### Task 3: Add package-map references for the new teleprompters

**Files:**
- Modify: `submission/README.md`

**Step 1: Write a failing package-map check**

Run:

```bash
python3 - <<'PY'
from pathlib import Path
text = Path('/Users/ravi/Documents/nullBytes_Apps/Ai_Agents/Story_AI/submission/README.md').read_text()
required = ['demo-teleprompter.md', 'cloud-proof-teleprompter.md']
missing = [item for item in required if item not in text]
print('MISSING:', missing)
raise SystemExit(1 if missing else 0)
PY
```

Expected: FAIL because the package map does not reference the teleprompter companions yet.

**Step 2: Update the submission package map**

Add the two new teleprompter files to the `submission/README.md` map in a way that clarifies the difference between:

- cue-sheet scripts (`demo-script.md`, `cloud-proof-script.md`)
- spoken teleprompter scripts (`demo-teleprompter.md`, `cloud-proof-teleprompter.md`)

Keep the package map concise.

**Step 3: Re-run the package-map check**

Run the Step 1 command again.

Expected: PASS.

**Step 4: Commit**

```bash
git add submission/README.md
git commit -m "docs: add teleprompter scripts to submission package map"
```

---

### Task 4: Run final teleprompter verification

**Files:**
- Verify: `submission/demo-teleprompter.md`
- Verify: `submission/cloud-proof-teleprompter.md`
- Verify: `submission/README.md`

**Step 1: Run the final teleprompter verification**

Run:

```bash
python3 - <<'PY'
from pathlib import Path
root = Path('/Users/ravi/Documents/nullBytes_Apps/Ai_Agents/Story_AI')
files = [
    'submission/demo-teleprompter.md',
    'submission/cloud-proof-teleprompter.md',
    'submission/README.md',
]
missing_files = [path for path in files if not (root / path).exists()]
text = '\n'.join((root / p).read_text(errors='ignore') for p in files if (root / p).exists())
problems = []
required = [
    'demo-teleprompter.md',
    'cloud-proof-teleprompter.md',
    'Google ADK',
    'Google GenAI SDK',
    'Cloud Run',
    'maayaasthala',
    'asia-south1',
]
missing = [item for item in required if item not in text]
if 'Screen:' in (root / 'submission/demo-teleprompter.md').read_text(errors='ignore'):
    problems.append('demo teleprompter still contains cue-sheet screen directions')
if 'Action:' in (root / 'submission/demo-teleprompter.md').read_text(errors='ignore'):
    problems.append('demo teleprompter still contains action cues')
print('MISSING_FILES:', missing_files)
print('MISSING_TEXT:', missing)
print('PROBLEMS:', problems)
raise SystemExit(1 if missing_files or missing or problems else 0)
PY
```

Expected: PASS.

**Step 2: Manual read-through**

Verify manually that:

- the demo teleprompter sounds natural when spoken aloud
- the cloud-proof teleprompter is brief and factual
- both teleprompters sound more conversational than the cue sheets
- the new files do not overclaim beyond the current package evidence

**Step 3: Commit**

```bash
git add submission/demo-teleprompter.md submission/cloud-proof-teleprompter.md submission/README.md
git commit -m "docs: finalize teleprompter recording scripts"
```
