# Teleprompter Voice Polish Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Polish the demo and cloud-proof teleprompter scripts so they sound more natural in a calm-founder speaking style while preserving the same proof structure and evidence limits.

**Architecture:** Keep the current teleprompter structure and proof beats intact. Refine only sentence rhythm, transitions, and spoken phrasing in the two teleprompter files so they become easier to read aloud and less document-like, without changing the package’s underlying claims.

**Tech Stack:** Markdown, current teleprompter scripts, cue-sheet scripts, submission evidence bundle, lightweight shell verification.

**Design Doc:** `docs/plans/2026-03-07-teleprompter-voice-polish-design.md`

---

### Task 1: Polish the demo teleprompter for calm-founder delivery

**Files:**
- Modify: `submission/demo-teleprompter.md`

**Step 1: Write a failing voice-signal check**

Run:

```bash
python3 - <<'PY'
from pathlib import Path
text = Path('/Users/ravi/Documents/nullBytes_Apps/Ai_Agents/Story_AI/submission/demo-teleprompter.md').read_text(errors='ignore')
checks = [
    'What I wanted',
    'The important part',
]
missing = [item for item in checks if item not in text]
print('MISSING:', missing)
raise SystemExit(1 if missing else 0)
PY
```

Expected: FAIL if the current script still lacks calmer founder-style connective phrasing.

**Step 2: Refine the spoken delivery in `submission/demo-teleprompter.md`**

Keep the existing structure and beats, but polish the script so it sounds more like a calm founder speaking naturally.

Focus on:

- shortening long sentences
- reducing list-like technical phrasing
- smoothing transitions between sections
- adding calmer founder phrases where helpful
- keeping the same core proof moments and evidence boundaries

Do not turn it into a new script; this is a voice pass, not a structural rewrite.

**Step 3: Re-run the voice-signal check**

Run the Step 1 command again.

Expected: PASS.

**Step 4: Commit**

```bash
git add submission/demo-teleprompter.md
git commit -m "docs: polish demo teleprompter voice"
```

---

### Task 2: Polish the cloud-proof teleprompter for calm factual delivery

**Files:**
- Modify: `submission/cloud-proof-teleprompter.md`

**Step 1: Write a failing stiffness check**

Run:

```bash
python3 - <<'PY'
from pathlib import Path
text = Path('/Users/ravi/Documents/nullBytes_Apps/Ai_Agents/Story_AI/submission/cloud-proof-teleprompter.md').read_text(errors='ignore')
checks = [
    'The important part',
    'What I am showing here',
]
missing = [item for item in checks if item not in text]
print('MISSING:', missing)
raise SystemExit(1 if missing else 0)
PY
```

Expected: FAIL if the script still reads too much like procedural narration.

**Step 2: Refine `submission/cloud-proof-teleprompter.md`**

Keep the same proof sequence and evidence discipline, but make the spoken narration calmer and more natural.

Focus on:

- factual clarity without sounding like a checklist
- smoother transitions between service page, revisions, logs, and viewer
- lighter, more natural spoken phrasing
- brief first-person or builder-led connective phrasing where helpful
- keeping the exact URLs present in the document without forcing them into awkward speech

Do not add any new proof claims.

**Step 3: Re-run the stiffness check**

Run the Step 1 command again.

Expected: PASS.

**Step 4: Commit**

```bash
git add submission/cloud-proof-teleprompter.md
git commit -m "docs: polish cloud proof teleprompter voice"
```

---

### Task 3: Run final voice-polish verification

**Files:**
- Verify: `submission/demo-teleprompter.md`
- Verify: `submission/cloud-proof-teleprompter.md`

**Step 1: Run the final teleprompter verification**

Run:

```bash
python3 - <<'PY'
from pathlib import Path
root = Path('/Users/ravi/Documents/nullBytes_Apps/Ai_Agents/Story_AI')
demo = (root / 'submission/demo-teleprompter.md').read_text(errors='ignore')
cloud = (root / 'submission/cloud-proof-teleprompter.md').read_text(errors='ignore')
problems = []
if 'Screen:' in demo or 'Action:' in demo:
    problems.append('demo teleprompter regressed into cue-sheet language')
required = [
    'Google ADK',
    'Google GenAI SDK',
    'Cloud Run',
    'maayaasthala',
    'asia-south1',
]
missing = [item for item in required if item not in (demo + '\n' + cloud)]
print('MISSING:', missing)
print('PROBLEMS:', problems)
print('DEMO_WORDS:', len(demo.split()))
print('CLOUD_WORDS:', len(cloud.split()))
raise SystemExit(1 if missing or problems else 0)
PY
```

Expected: PASS.

**Step 2: Manual read-through**

Verify manually that:

- both scripts feel calmer and more natural than before
- the demo teleprompter still sounds like a founder, not an announcer
- the cloud teleprompter stays factual and evidence-disciplined
- no stronger claims were introduced during the polish pass

**Step 3: Commit**

```bash
git add submission/demo-teleprompter.md submission/cloud-proof-teleprompter.md
git commit -m "docs: polish teleprompter scripts for recording"
```
