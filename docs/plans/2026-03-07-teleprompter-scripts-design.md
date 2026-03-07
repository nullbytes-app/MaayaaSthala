# Teleprompter Scripts Design

**Date:** 2026-03-07
**Status:** Approved
**Goal:** Add recording-friendly teleprompter scripts for the main demo and the Cloud Run proof clip, while preserving the existing operator cue sheets already prepared in `submission/`.

## Problem Statement

The current recording scripts are strong operational guides, but they are still written as production cue sheets. They mix what to show with what to say. That makes them useful for planning, but less comfortable for real-time spoken delivery during recording.

For recording, the project needs companion scripts that are optimized for speaking:

- easier to read aloud
- shorter and more natural in rhythm
- less visually noisy during recording
- aligned to the final evidence package and screenshots

## Chosen Approach

Create **separate teleprompter companions** instead of rewriting the existing scripts.

### Keep existing cue-sheet files

- `submission/demo-script.md`
- `submission/cloud-proof-script.md`

These remain the operator / production versions that explain what to show.

### Add new spoken-script files

- `submission/demo-teleprompter.md`
- `submission/cloud-proof-teleprompter.md`

These become the “what to say” versions for actual recording.

## Why This Approach Wins

This split keeps both use cases strong:

- the existing cue-sheet scripts remain clear for planning and screen actions
- the new teleprompter files stay clean and performer-friendly
- no one has to read action notes while also trying to sound natural on camera

It also reduces risk, because the proof and demo flow already work; this design adds a recording layer rather than rewriting the package again.

## Deliverables

### 1. Demo teleprompter

`submission/demo-teleprompter.md`

This should be a spoken-first script for the main demo video.

Target characteristics:

- first-person founder voice
- paced for roughly 3:15 to 3:45 delivery
- one paragraph per beat
- short, natural spoken sentences
- no operator instructions in the main body

Core beats to cover:

- beyond-the-text-box hook
- what the user experiences
- story and cast approval gates
- interleaved live output as the key proof moment
- Google stack proof: Gemini, ADK, GenAI SDK, Cloud Run
- closing line

### 2. Cloud proof teleprompter

`submission/cloud-proof-teleprompter.md`

This should be a shorter spoken-first script for the Cloud Run proof clip.

Target characteristics:

- direct and factual
- paced for roughly 30 to 45 seconds
- clean line-by-line delivery while clicking through the console
- aligned to the existing Cloud Run screenshots and proof files

Core beats to cover:

- service identity
- region
- revision readiness
- logs from the same service
- custom-domain viewer proof

## Tone and Delivery Rules

The teleprompter files should sound like the builder speaking, not like a generated announcer.

### Voice

- first person
- specific
- confident
- grounded

Examples of preferred phrasing:

- “I built this because...”
- “What I wanted was...”
- “The point here is...”

Avoid:

- corporate pitch tone
- stacked superlatives
- stiff demo-brochure language

### Spoken rhythm

- shorter sentences
- natural pause points
- fewer nested clauses
- easy breath spacing

The teleprompter should feel comfortable to read live without frequent re-takes caused by overly long lines.

### Evidence discipline

No spoken line should claim more than the current package proves.

The scripts must stay aligned with:

- `submission/demo-script.md`
- `submission/cloud-proof-script.md`
- `submission/README.md`
- `submission/evidence/`
- `submission/screenshots/`

## Formatting Guidance

The teleprompter files should be easier to scan than the cue sheets.

Recommended formatting:

- short title
- short note on target duration
- one heading per major beat
- one short paragraph per spoken section
- optional emphasized one-line close if useful

Avoid:

- dense bullet stacks in the spoken body
- file paths in spoken lines
- excessive parenthetical notes
- mixed “Screen / Voiceover / Action” formatting in the teleprompter files

## Boundary Between Cue Sheets and Teleprompters

- cue sheets explain screen actions and timing
- teleprompters explain spoken narration

If a line is primarily a screen instruction, it belongs in the cue sheet, not the teleprompter.

If a line is intended to be spoken aloud, it belongs in the teleprompter.

## Acceptance Criteria

The teleprompter design is successful when:

- the existing cue-sheet files remain intact and useful
- two new teleprompter files exist as spoken companions
- the demo teleprompter is tighter and easier to perform than the current demo cue sheet
- the cloud-proof teleprompter is short, factual, and smooth to read aloud
- the scripts sound human and founder-led rather than AI-generic
- spoken claims remain aligned with the current submission evidence
