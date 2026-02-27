const toCandidateId = (candidate) => candidate.candidateId ?? candidate.artifactId;

const normalizeCandidate = (candidate, fallbackSource) => ({
  candidateId: toCandidateId(candidate),
  artifactId: candidate.artifactId,
  source: candidate.source ?? fallbackSource,
  previewUrl: candidate.previewUrl ?? null,
  confidence: candidate.confidence
});

const hasCandidate = (entry, candidateId) =>
  [...entry.existingCandidates, ...entry.generatedCandidates].some(
    (candidate) => candidate.candidateId === candidateId
  );

const resolveSelectedCandidateId = (entry, preferredCandidateId) => {
  if (preferredCandidateId && hasCandidate(entry, preferredCandidateId)) {
    return preferredCandidateId;
  }

  return entry.existingCandidates[0]?.candidateId ?? entry.generatedCandidates[0]?.candidateId ?? null;
};

export const initialCastingState = {
  storyId: null,
  byCharId: {},
  order: [],
  approved: false,
  approvedAt: null
};

export const reduceCastingState = (state, action) => {
  if (action.type === "loadPrepareSuccess") {
    const byCharId = {};
    const order = [];

    for (const character of action.characters ?? []) {
      const existingCandidates = (character.existingCandidates ?? []).map((candidate) =>
        normalizeCandidate(candidate, "existing")
      );

      byCharId[character.charId] = {
        characterProfile: {
          charId: character.charId,
          name: character.name,
          archetype: character.archetype
        },
        existingCandidates,
        generatedCandidates: [],
        selectedCandidateId: existingCandidates[0]?.candidateId ?? null
      };

      order.push(character.charId);
    }

    return {
      storyId: action.storyId,
      byCharId,
      order,
      approved: false,
      approvedAt: null
    };
  }

  if (action.type === "mergeGeneratedCandidates") {
    const entry = state.byCharId[action.charId];
    if (!entry) {
      return state;
    }

    const incomingGeneratedCandidates = (action.generatedCandidates ?? []).map((candidate) =>
      normalizeCandidate(candidate, "generated")
    );
    const generatedCandidatesById = new Map(
      entry.generatedCandidates.map((candidate) => [candidate.candidateId, candidate])
    );
    for (const candidate of incomingGeneratedCandidates) {
      generatedCandidatesById.set(candidate.candidateId, candidate);
    }

    const generatedCandidates = Array.from(generatedCandidatesById.values());
    const updatedEntry = {
      ...entry,
      generatedCandidates
    };
    const nextSelectedCandidateId = resolveSelectedCandidateId(
      updatedEntry,
      entry.selectedCandidateId
    );

    return {
      ...state,
      byCharId: {
        ...state.byCharId,
        [action.charId]: {
          ...updatedEntry,
          generatedCandidates,
          selectedCandidateId: nextSelectedCandidateId
        }
      }
    };
  }

  if (action.type === "selectCandidate") {
    const entry = state.byCharId[action.charId];
    if (!entry || !hasCandidate(entry, action.candidateId)) {
      return state;
    }

    return {
      ...state,
      byCharId: {
        ...state.byCharId,
        [action.charId]: {
          ...entry,
          selectedCandidateId: action.candidateId
        }
      }
    };
  }

  if (action.type === "approveSuccess") {
    return {
      ...state,
      approved: true,
      approvedAt: action.approvedAt ?? new Date().toISOString()
    };
  }

  return state;
};

export const getSelectedCastSelections = (state) =>
  state.order
    .map((charId) => {
      const entry = state.byCharId[charId];
      if (!entry || !entry.selectedCandidateId) {
        return null;
      }

      const candidate = [...entry.existingCandidates, ...entry.generatedCandidates].find(
        (item) => item.candidateId === entry.selectedCandidateId
      );
      if (!candidate) {
        return null;
      }

      return {
        charId,
        artifactId: candidate.artifactId,
        source: candidate.source
      };
    })
    .filter(Boolean);

export const buildApprovePayload = (state) => ({
  storyId: state.storyId,
  castSelections: getSelectedCastSelections(state)
});

const postJson = async (baseUrl, path, payload) => {
  const response = await fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    throw new Error(`Request failed (${response.status}) for ${path}`);
  }

  return response.json();
};

export const requestCastingPrepare = (baseUrl, payload) =>
  postJson(baseUrl, "/v1/casting/prepare", payload);

export const requestGenerateCandidates = (baseUrl, payload) =>
  postJson(baseUrl, "/v1/casting/generate", payload);

export const requestApproveCasting = (baseUrl, payload) =>
  postJson(baseUrl, "/v1/casting/approve", payload);
