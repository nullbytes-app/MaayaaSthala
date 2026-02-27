const isRecord = (value) => value !== null && typeof value === "object";

const toOrigin = (options = {}) => {
  if (typeof options.origin === "string" && options.origin.trim().length > 0) {
    return options.origin.trim().replace(/\/$/, "");
  }

  if (typeof window !== "undefined" && window.location?.origin) {
    return String(window.location.origin).replace(/\/$/, "");
  }

  return null;
};

export const normalizePreviewUrl = (previewUrl, options = {}) => {
  if (typeof previewUrl !== "string" || previewUrl.trim().length === 0) {
    return null;
  }

  const trimmed = previewUrl.trim();
  if (/^(https?:|data:|blob:)/i.test(trimmed)) {
    return trimmed;
  }

  const origin = toOrigin(options);
  if (!origin) {
    return trimmed;
  }

  if (trimmed.startsWith("/")) {
    return `${origin}${trimmed}`;
  }

  const relative = trimmed.replace(/^\.\//, "");
  return `${origin}/${relative}`;
};

const getSelectedCandidate = (entry) => {
  if (!isRecord(entry)) {
    return null;
  }

  const selectedCandidateId =
    typeof entry.selectedCandidateId === "string" && entry.selectedCandidateId.trim().length > 0
      ? entry.selectedCandidateId
      : null;

  if (!selectedCandidateId) {
    return null;
  }

  const existing = Array.isArray(entry.existingCandidates) ? entry.existingCandidates : [];
  const generated = Array.isArray(entry.generatedCandidates) ? entry.generatedCandidates : [];
  const candidates = [...existing, ...generated];

  return candidates.find((candidate) => {
    if (!isRecord(candidate)) {
      return false;
    }

    const candidateId = candidate.candidateId ?? candidate.artifactId;
    return typeof candidateId === "string" && candidateId === selectedCandidateId;
  }) ?? null;
};

export const buildArtifactVisualMap = (castingState, options = {}) => {
  if (!isRecord(castingState) || !Array.isArray(castingState.order) || !isRecord(castingState.byCharId)) {
    return {};
  }

  const map = {};

  for (const charId of castingState.order) {
    if (typeof charId !== "string") {
      continue;
    }

    const entry = castingState.byCharId[charId];
    const selected = getSelectedCandidate(entry);
    if (!isRecord(selected) || typeof selected.artifactId !== "string" || selected.artifactId.trim().length === 0) {
      continue;
    }

    const artifactId = selected.artifactId.trim();
    const candidateId =
      typeof selected.candidateId === "string" && selected.candidateId.trim().length > 0
        ? selected.candidateId.trim()
        : artifactId;
    const source = typeof selected.source === "string" ? selected.source : "existing";

    map[artifactId] = {
      artifactId,
      candidateId,
      source,
      previewUrl: normalizePreviewUrl(selected.previewUrl, options)
    };
  }

  return map;
};
