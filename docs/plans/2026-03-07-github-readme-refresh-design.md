# GitHub README Refresh Design

**Date:** 2026-03-07
**Status:** Approved
**Goal:** Refresh `README.md` so it works as both a strong GitHub project front page and a clean entry point for Gemini Live Agent Challenge judges, without duplicating the full submission package.

## Problem Statement

The current `README.md` already contains useful material, but it still reads more like a technical project summary than a strong GitHub front door. It needs to do a better job of immediately communicating:

- what MaayaaSthala is
- how it breaks the text-box paradigm
- where the live project and strongest submission proof live
- why the stack and architecture are credible

At the same time, it should not become a second Devpost page or duplicate the entire `submission/` package.

## Design Principles

### 1. README as the front door

`README.md` should help two audiences quickly:

- **GitHub visitors** who want to understand the project and run it
- **Challenge judges** who want to find the strongest evidence fast

The detailed compliance package remains in `submission/README.md` and supporting files under `submission/`.

### 2. Balanced, not submission-heavy

The README should keep a practical engineering shape:

- strong top-level framing
- concise challenge context
- quick start and architecture still easy to find
- evidence links surfaced without overwhelming the page

It should not turn into a full submission document.

### 3. Evidence-aware language

Claims in `README.md` should stay aligned with the repo and the curated submission package.

- point to proof instead of repeating every proof detail
- avoid stale exact counts unless freshly verified
- keep challenge-facing language consistent with `submission/README.md` and `submission/requirements-audit.md`

## Approved README Shape

### Top section

Keep the project title and challenge/category callout, but tighten the opening framing.

The top should include:

- a sharper one-paragraph explanation of MaayaaSthala
- a compact explanation that this is not a text chatbot with media attachments
- a judge-friendly pointer to `submission/README.md`

### New or strengthened sections

#### 1. Why this is different

Add a short section near the top that explains the live multimodal flow in plain language:

- story request
- story approval
- cast confirmation
- staged performance with text, visuals, narration, and stage direction working together

This section should explain the beyond-the-text-box value clearly, without sounding like generic AI marketing.

#### 2. Live project / submission / proof

Add a compact link block that highlights the most useful destinations:

- live viewer URL
- submission package
- architecture diagram
- cloud proof bundle
- demo script

This should remain short and high-signal.

#### 3. How it works

Keep the current structure, but sharpen the language so each agent role feels distinct and the outcome of each stage is clearer.

The section should explain:

- what Sutradhar does
- what Chitrakar does
- what Rangmanch does
- how the user stays in the loop through approvals before the performance starts

#### 4. Technical credibility

Surface the core technical stack more directly so visitors and judges can see it quickly:

- Gemini 2.5 Flash
- Google ADK
- Google GenAI SDK
- Cloud Run
- Google Cloud Text-to-Speech
- WebSocket streaming

This can be done either as a dedicated short section or by tightening the existing feature / stack presentation.

#### 5. Quick Start / Deployment / Tests

Keep these practical and concise.

- Quick Start should remain easy to scan
- deployment guidance should still point to `submission/gcp-deployment-checklist.md`
- test guidance should stay practical and avoid submission-brochure tone

## Tone and Style

The approved tone is:

- confident
- specific
- human
- technically grounded

Avoid:

- overhyped AI phrasing
- duplicated proof language from the submission package
- overly long judge-only copy in the main project README

## Boundaries With Submission Docs

- `README.md` = repo front door
- `submission/README.md` = full judge package
- `submission/requirements-audit.md` = compliance matrix
- `submission/cloud-proof-script.md` = recording aid

The README should link into these documents, not absorb them.

## Acceptance Criteria

The refresh is successful when:

- a GitHub visitor can understand the project within the first screenful
- a judge can quickly find the strongest evidence and live links
- the README still works as a developer-facing entry point
- the README feels cleaner and more distinctive than the current version
- the wording stays aligned with the curated submission package
