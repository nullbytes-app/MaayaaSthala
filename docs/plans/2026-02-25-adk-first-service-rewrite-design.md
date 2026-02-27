# ADK-First Service Rewrite Design

Date: 2026-02-25
Status: Approved for planning
Owner: Story AI team

## Goal

Rewrite the current resolver intelligence path into an ADK-native agent orchestration service backed by Gemini, while preserving the existing viewer and API contracts so the current visual product remains stable during migration.

## Why this rewrite

Current runtime quality is solid for visual demo flow, but intelligence is still mostly heuristic and route-local (for example, story analysis and character reasoning in resolver routes). For challenge compliance and product quality, the intelligence path must be truly agentic, Gemini-backed, traceable, and cloud-native.

## Decision

Selected approach: Full ADK-first service rewrite with compatibility layer.

## Scope and non-goals

### In scope

- Introduce ADK-native orchestration as the primary intelligence runtime.
- Keep existing public endpoints and response shapes usable by current viewer.
- Replace heuristic analysis/resolution logic with Gemini agent turns.
- Add full traceability for model/tool decisions.
- Prepare cloud deployment path on Cloud Run.

### Out of scope (for this rewrite phase)

- Major redesign of viewer UI contracts.
- Immediate replacement of runtime/stage gateway internals unless required by agent flow.
- Large-scale database replatforming beyond session and trace persistence needs.

## Target architecture

### 1) Compatibility edge (existing resolver HTTP server)

- Keep `services/resolver/src/httpServer.ts` as the stable API edge.
- Maintain existing endpoints:
  - `POST /v1/casting/prepare`
  - `POST /v1/casting/generate`
  - `POST /v1/casting/approve`
  - `POST /v1/demo/run`
- Route handlers delegate to ADK orchestrator services behind feature flags.

### 2) ADK orchestrator service (new primary intelligence layer)

- Add a new service module (for example `services/agent-orchestrator/`).
- Encapsulate agent workflows and stateful turn execution.
- Agents and responsibilities:
  - StoryAnalyzerAgent: character and scene extraction from story draft.
  - CastingResolverAgent: candidate ranking and unresolved detection.
  - ArtifactGenerationAgent: tool-driven generation calls for missing cast.
  - StageDirectorAgent: run-time plan assembly aligned to approved cast.

### 3) Tool adapters

- Artifact registry/scoring tool: existing artifact metadata and matching logic.
- Stitch generation tool: reuse hardened adapter behavior (timeouts/retries/auth).
- Compiler/runtime bridge tool: handoff to Natya compiler and stage runtime path.

### 4) State and trace stores

- Keep cast approval freeze semantics (`approve` remains authoritative).
- Persist per-turn traces with request id, model id, tool calls, outputs, errors.
- Keep initial store simple and migration-friendly; allow later move to managed store.

### 5) Deployment topology

- Deploy ADK orchestrator on Cloud Run.
- Keep resolver edge co-located or separately deployed depending on rollout.
- Use secret-backed environment configuration for model keys and external adapters.

## End-to-end flow design

### A) Prepare casting (`POST /v1/casting/prepare`)

1. Resolver validates and normalizes payload.
2. Resolver calls ADK StoryAnalyzerAgent.
3. ADK returns structured story analysis (schema-validated).
4. Resolver calls ADK CastingResolverAgent.
5. Response returns characters, scenes, and ranked existing candidates.

### B) Generate candidate (`POST /v1/casting/generate`)

1. Resolver forwards target character context to ADK ArtifactGenerationAgent.
2. Agent invokes Stitch tool adapter.
3. Response returns generated candidates and preview assets.
4. Partial failures are isolated to requested character generation.

### C) Approve casting (`POST /v1/casting/approve`)

1. Resolver validates selection payload.
2. Approved cast map is persisted as session freeze point.
3. Future run requests prefer this frozen cast unless explicitly overridden by policy.

### D) Run demo (`POST /v1/demo/run`)

1. Resolver retrieves frozen cast and normalized story request.
2. Resolver calls ADK StageDirectorAgent for plan and decision layer.
3. Runtime bridge compiles script/plan and executes existing stage flow.
4. Response preserves current viewer-compatible artifacts (replay/playbill/cinema/overlay).

## Error handling and safety

- Schema-first validation at all agent and tool boundaries.
- Bounded retries for transient model and adapter failures.
- Deterministic fallback path for core routes when ADK path is unavailable.
- Explicit 4xx validation errors for bad cast selections and malformed requests.
- Timeout budgets per route and per tool call to prevent cascading failures.
- Structured logging with secret redaction.

## Testing strategy

- Keep current route tests and extend with ADK-path coverage.
- Add unit tests for each tool adapter and schema validator.
- Add golden fixture tests for stable story/cast outputs.
- Add end-to-end tests for prepare -> generate -> approve -> run through compatibility layer.
- Add shadow-run comparison mode (legacy vs ADK) during migration.

## Rollout strategy

- Feature flags:
  - `AGENTIC_ANALYZE_ENABLED`
  - `AGENTIC_CASTING_ENABLED`
  - `AGENTIC_RUN_ENABLED`
- Phase 1: ADK analyze behind flag, compare outputs.
- Phase 2: ADK casting/generation behind flags.
- Phase 3: ADK run orchestration behind flag.
- Phase 4: default-on ADK path, keep fallback until confidence threshold is met.

## Challenge alignment

- Gemini-backed ADK orchestration provides explicit agentic behavior.
- Cloud Run deployment satisfies Google Cloud hosting requirement.
- Trace outputs provide evidence for judging and reproducibility.
- Existing interleaved visual runtime remains intact while intelligence becomes agent-native.

## Risks and mitigations

- Risk: contract drift breaks viewer.
  - Mitigation: compatibility edge preserves response schema and route semantics.
- Risk: model output instability.
  - Mitigation: strict schema validation, retries, safe fallback.
- Risk: migration latency.
  - Mitigation: phased flags and shadow comparisons.
- Risk: observability gaps.
  - Mitigation: required trace logging and smoke validation in CI/deploy checks.

## Approval record

Approved by user in-session for:

- Approach: full ADK-first rewrite.
- Architecture section.
- Data flow and state transitions section.
- Error handling and safety section.
- Testing and rollout section.
