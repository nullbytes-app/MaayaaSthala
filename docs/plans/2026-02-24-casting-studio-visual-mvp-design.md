# Casting Studio Visual MVP Design

**Date:** 2026-02-24
**Status:** Approved in Party Mode discussion

## Objective

Deliver a visual MVP that users can watch and understand end-to-end, instead of reading raw code and logs. The MVP must include a pre-show casting step where users choose per-character assets from existing options or generate new options via Stitch MCP.

## Product Outcome

Users can run a story flow that feels like a real product demo:

1. Analyze story and extract characters.
2. Open a Casting Studio where each character has:
   - existing asset choices from registry
   - optional Stitch-generated choices
3. User approves final cast for this run.
4. Playback starts with a visible stage canvas, timeline, and state overlays.

## Approved Scope

- MVP mode: Hybrid player.
  - Replay mode is default (deterministic and reliable).
  - Live stream mode exists as a toggle (WS-based), secondary to replay stability.
- First cast quality target: 3 characters.
  - `hero_raju_v2`
  - `elder_mentor_v1`
  - `shadow_double_v1`
- Asset source behavior:
  - Show existing candidates first.
  - Allow generating new candidates per character with Stitch MCP.
  - User explicitly selects a final asset per character before show start.
- During playback, selected assets are frozen in a `sessionArtifactMap`.

## UX Flow

## 1) Story Intake

User provides story text and script.

System runs:
- `/v1/stories/analyze`
- `/v1/character-resolver/resolve`

## 2) Casting Studio (Pre-Show)

For each extracted character:
- Show character profile (name, archetype, story cues).
- Show existing compatible assets from registry.
- Offer "Generate New" action (Stitch MCP).
- Show generated candidates with previews.
- Require user to pick one final candidate.

Global actions:
- `Use existing defaults` (fast path)
- `Generate selected characters`
- `Approve cast and start show`

## 3) Playback Experience

Main layout:
- Stage canvas (left)
- Timeline + opcode feed + mythic/audience cards (right)
- Top controls: load demo, play/pause, speed, mode (Replay/Live)

Visual behaviors:
- `SCENE_OPEN/CLOSE`: stage transitions
- `NARRATE`: subtitle/state updates
- `GESTURE`: part transform animation
- `SPEAK`: speech/caption lane
- `BARGE_IN`: interrupt badge + influence indicators

## Architecture

```text
Story Input
  -> Resolver APIs (analyze + resolve)
  -> Casting Studio adapter
      -> existing candidates (registry)
      -> generated candidates (Stitch MCP)
      -> final user approval
  -> sessionArtifactMap freeze
  -> command execution
      -> replay adapter (default)
      -> live WS adapter (optional)
  -> shared renderer + telemetry panels
```

Key design rule: generation happens before show playback; playback never mutates cast mid-run.

## Data Model Additions

- `CharacterProfile`
  - `charId`, `name`, `archetype`, `storySignals`
- `AssetCandidate`
  - `candidateId`, `source(existing|generated)`, `artifactId`, `previewUrl`, `partsManifest`
- `CharacterCastingState`
  - `characterProfile`, `existingCandidates[]`, `generatedCandidates[]`, `selectedCandidateId`
- `SessionArtifactMap`
  - `storyId`, `castSelections[{charId, artifactId, source}]`, `approvedAt`

## Technical Constraints and Decisions

- Replay-first reliability is required because current standalone runtime has a stage-gateway runtime import issue (`loadSync` failure path in non-test execution).
- Stitch integration is included in MVP as pre-show generation, not in-show generation.
- If generation fails/timeout occurs, user can proceed with existing candidates.
- Generated parts must pass part-manifest validation before becoming selectable.

## Non-Goals (MVP)

- Full autonomous artifact generation pipeline with long-running orchestration.
- Production-grade asset moderation/workflow approvals.
- Mid-show recasting.
- Final artistic renderer parity with production puppet theater quality.

## Success Criteria

- User can complete casting and start a visual playback in about five minutes.
- For every character, user can choose existing or generated assets.
- Playback is stable and understandable, with visible state progression.
- Demo can run without requiring live generation success.

## Risks and Mitigations

- Stitch latency/failure:
  - Mitigation: async generation, timeout, fallback to existing assets.
- Invalid generated part structures:
  - Mitigation: schema + manifest validation before display/select.
- Runtime fragility:
  - Mitigation: replay default path; live mode optional.
- Scope creep in visual fidelity:
  - Mitigation: lock first pass to three characters and defined command behaviors.

## Next Step

Create a task-by-task implementation plan with exact files, tests, and checkpoints for this approved design.
