# Gemini Challenge Submission Kit — Design Document

**Date:** 2026-03-07
**Status:** Approved
**Goal:** Turn the current `submission` materials into a judge-ready package for the Gemini Live Agent Challenge that is complete, credible, readable, and aligned to the Creative Storyteller rubric.

## Problem Statement

The application itself appears strong for the Creative Storyteller category, but the current submission package has gaps that could reduce both pass/fail compliance confidence and presentation score:

- Mandatory requirements and judging criteria are not mapped to concrete evidence in one place
- The current architecture artifact is HTML-based and not presentation-grade for judges
- Existing docs mix strong technical substance with repeated claims, inconsistent voice, and a few stale placeholders
- Cloud proof exists in multiple places, but it is not yet organized as a clean submission-ready evidence bundle
- The hosted app at `https://maayaasthala.nullbytes.app/viewer` has not yet been harvested into a curated screenshot pack for the submission

## Desired Outcome

Produce a complete submission kit that makes three things easy for judges to verify:

1. The project satisfies all mandatory challenge requirements
2. The project scores well against the 40/30/30 judging rubric
3. The builder understands the product deeply and presents it with a human, specific, founder-level voice

## Submission Strategy

### 1. Compliance-First, Score-Optimized Package

The package should first eliminate Stage One risk, then strengthen Stage Two scoring.

#### Stage One protection

Every required submission asset should exist in a clear, final form:

- text description
- public code repository support via `README.md`
- reproducible spin-up instructions
- proof of Google Cloud deployment
- architecture diagram
- demo script and supporting demo assets

#### Stage Two optimization

The package should explicitly support the judging criteria:

- **Innovation & Multimodal UX (40%)** — prove the experience breaks the text-box paradigm and feels live, interleaved, and context-aware
- **Technical Implementation & Agent Architecture (30%)** — prove real Google ADK / GenAI SDK usage, Google Cloud deployment, graceful error handling, and low-hallucination structure
- **Demo & Presentation (30%)** — provide a clear story, clear diagram, cloud proof, real screenshots, and a strong under-4-minute demo narrative

### 2. Proof Over Claims

Submission materials should avoid unsupported hype. Every major claim should map back to one of the following:

- source code citation
- deployment artifact
- live app screenshot
- cloud evidence file
- demo or cloud-proof script section

### 3. Human, Solo-Builder Voice

The written materials should feel like they came from the actual builder:

- first-person voice where appropriate
- specific engineering trade-offs and lessons learned
- restrained, confident language instead of generic AI-marketing phrasing
- consistency across `README`, Devpost description, scripts, and checklists

## Deliverables

### A. Submission Audit

Create a judge-facing audit that tracks challenge requirements and repo evidence.

The audit should record:

- requirement or judging criterion
- status: `met`, `partially met`, or `missing`
- supporting evidence
- risk or ambiguity
- action required before submission

### B. Rewritten Core Submission Docs

Refresh the current written materials into a consistent package:

- final Devpost description
- top-level `README.md` improvements for judges
- submission index / checklist
- optional bonus-content draft refinement

### C. Static Architecture Package

Replace the HTML architecture diagram with a static, upload-friendly package:

- editable source file suitable for future tweaks
- exported diagram image for Devpost and video use
- short architecture notes companion

The diagram should tell one clean story:

`User -> Hosted Web App -> Cloud Run backend + WebSocket orchestration -> Story agents -> Gemini / image generation / TTS -> interleaved outputs back to the stage`

### D. Screenshot Pack From Hosted App

Capture real, current screenshots from `https://maayaasthala.nullbytes.app/viewer` showing:

- initial request state
- story concept / approval flow
- character approval flow
- live multimodal performance
- strong stage/canvas moment for marketing or Devpost carousel use

### E. Cloud Proof Package

Create a dedicated proof set for the "running on Google Cloud" requirement:

- cloud proof recording script
- supporting screenshot / log / service description references
- evidence organization that matches the recorded script

### F. Demo Package

Refine the main demo script so it leads with judge priorities:

- beyond the text box
- seamless interleaving of text, images, audio, and live stage direction
- real Google SDK / ADK usage
- Google Cloud deployment
- graceful error handling and reliability

## Planned File Structure

The final structure should be easier to scan and harder to mis-submit.

```text
submission/
  README.md
  requirements-audit.md
  devpost-description.md
  demo-script.md
  cloud-proof-script.md
  blog-post.md
  architecture/
    architecture-diagram.excalidraw
    architecture-diagram.png
    architecture-notes.md
  screenshots/
    viewer-request.png
    story-approval.png
    character-approval.png
    live-performance.png
    live-performance-closeup.png
  evidence/
    cloud-run-console.png
    service-description.yaml
    deployment-logs.txt
    cloud-evidence-index.md
```

Notes:

- Static assets should be the judge-facing default
- Raw or internal-only prep docs should not be confused with final submission artifacts
- Existing historical evidence under `docs/submission/` can be reused where still accurate, but should be normalized into a final package under `submission/`

## Validation Workflow

### Pass 1: Baseline Compliance

Confirm all hard requirements are represented clearly:

- category fit: Creative Storyteller
- Gemini model usage
- Google GenAI SDK or ADK usage
- at least one Google Cloud service
- public repository readiness
- spin-up instructions
- Google Cloud proof
- architecture diagram
- demo materials in English

### Pass 2: Scoring Strength

Evaluate how convincingly the package demonstrates:

- seamless interleaving of media
- live/context-aware experience
- thoughtful system design
- graceful error handling
- reduced hallucination risk through structure, validation, and approval gates
- strong presentation clarity

### Pass 3: Consistency Sweep

Normalize high-risk details across all docs:

- test counts
- service names and deployment URLs
- names of Google services used
- exact terminology for the three story agents
- repo and product naming (`MaayaaSthala` vs older names)

## Visual and Narrative Direction

### Visual principles

- prefer real screenshots over mocked scenes
- keep the architecture diagram clean and zoom-readable
- prioritize high-signal images over a large screenshot dump
- design each artifact to answer a judge question quickly

### Voice principles

- first-person, founder-style voice
- specific and reflective rather than promotional
- proud but not inflated
- consistent across all submission materials

## Execution Sequence

1. Inspect the hosted app and capture screenshots
2. Build the full requirements and judging audit
3. Replace weak assets, especially the HTML diagram
4. Rewrite submission docs into a consistent voice
5. Assemble the final submission structure
6. Run a final consistency and completeness review

## Acceptance Criteria

The design is successful when:

- every mandatory submission item is present in a final, readable form
- the architecture diagram is static, clear, and upload-ready
- the hosted app is represented with real screenshots
- the package includes a separate cloud-proof script
- the main demo script is clearly aligned to the judging rubric
- major claims are evidence-backed and internally consistent
- the materials feel like they were written by the builder, not auto-generated
