export type StitchCharacterInput = {
  charId: string;
  name: string;
  archetype: string;
};

export type StitchGenerateInput = {
  storyId: string;
  style: string;
  character: StitchCharacterInput;
};

export type GeneratedCastingCandidate = {
  candidateId: string;
  artifactId: string;
  previewUrl: string;
  source: "generated";
  partsManifest: {
    parts: string[];
  };
};

export interface StitchClient {
  generateCharacterParts(input: StitchGenerateInput): Promise<GeneratedCastingCandidate[]>;
}

type HttpStitchClientConfig = {
  generateUrl: string;
  timeoutMs: number;
  maxRetries: number;
  retryBaseMs: number;
  retryJitterMs: number;
  authBearerToken?: string;
};

class StitchRequestError extends Error {
  constructor(message: string, readonly retryable: boolean) {
    super(message);
    this.name = "StitchRequestError";
  }
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object";

const normalizeCandidate = (value: unknown): GeneratedCastingCandidate => {
  if (!isRecord(value)) {
    throw new Error("Invalid stitch candidate: expected object");
  }

  const candidateId = value.candidateId;
  const artifactId = value.artifactId;
  const previewUrl = value.previewUrl;
  const partsManifest = value.partsManifest;

  if (typeof candidateId !== "string" || candidateId.trim().length === 0) {
    throw new Error("Invalid stitch candidate: candidateId must be non-empty string");
  }

  if (typeof artifactId !== "string" || artifactId.trim().length === 0) {
    throw new Error("Invalid stitch candidate: artifactId must be non-empty string");
  }

  if (typeof previewUrl !== "string" || previewUrl.trim().length === 0) {
    throw new Error("Invalid stitch candidate: previewUrl must be non-empty string");
  }

  if (!isRecord(partsManifest) || !Array.isArray(partsManifest.parts)) {
    throw new Error("Invalid stitch candidate: partsManifest.parts must be an array");
  }

  const parts = partsManifest.parts.map((part) => {
    if (typeof part !== "string" || part.trim().length === 0) {
      throw new Error("Invalid stitch candidate: parts must be non-empty strings");
    }

    return part;
  });

  return {
    candidateId: candidateId.trim(),
    artifactId: artifactId.trim(),
    previewUrl: previewUrl.trim(),
    source: "generated",
    partsManifest: {
      parts
    }
  };
};

const normalizeGeneratedCandidates = (payload: unknown): GeneratedCastingCandidate[] => {
  if (Array.isArray(payload)) {
    return payload.map((entry) => normalizeCandidate(entry));
  }

  if (!isRecord(payload) || !Array.isArray(payload.generatedCandidates)) {
    throw new Error("Invalid stitch response payload");
  }

  return payload.generatedCandidates.map((entry) => normalizeCandidate(entry));
};

const isAbortError = (error: unknown): boolean =>
  error instanceof Error && (error.name === "AbortError" || error.message.toLowerCase().includes("aborted"));

const parseIntegerConfig = (value: string | undefined, fallback: number, minimum: number): number => {
  if (typeof value !== "string" || value.trim().length === 0) {
    return fallback;
  }

  const parsed = Number.parseInt(value.trim(), 10);

  if (!Number.isFinite(parsed) || parsed < minimum) {
    return fallback;
  }

  return parsed;
};

const wait = async (milliseconds: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });

const computeRetryDelayMs = (attemptNumber: number, baseMs: number, jitterMs: number): number => {
  const exponential = baseMs * 2 ** (attemptNumber - 1);
  const jitter = jitterMs > 0 ? Math.floor(Math.random() * (jitterMs + 1)) : 0;
  return exponential + jitter;
};

const logStitchTelemetry = (message: string): void => {
  process.stdout.write(`[resolver][stitch] ${message}\n`);
};

const sanitizeToken = (value: string): string =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 48);

const defaultParts = [
  "head",
  "torso",
  "left_arm",
  "right_arm",
  "left_hand",
  "right_hand",
  "left_leg",
  "right_leg"
];

class StubStitchClient implements StitchClient {
  async generateCharacterParts(input: StitchGenerateInput): Promise<GeneratedCastingCandidate[]> {
    const token = sanitizeToken(input.character.name || input.character.charId || "character");
    const artifactId = `${token}_gen_v1`;

    return [
      {
        candidateId: `${input.storyId}_${input.character.charId}_cand_1`,
        artifactId,
        previewUrl: `/generated/${artifactId}.png`,
        source: "generated",
        partsManifest: {
          parts: [...defaultParts]
        }
      }
    ];
  }
}

class HttpStitchClient implements StitchClient {
  constructor(private readonly config: HttpStitchClientConfig) {}

  async generateCharacterParts(input: StitchGenerateInput): Promise<GeneratedCastingCandidate[]> {
    const maxAttempts = this.config.maxRetries + 1;
    let lastError: unknown;

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      try {
        return await this.generateCharacterPartsOnce(input);
      } catch (error) {
        lastError = error;

        const canRetry =
          error instanceof StitchRequestError &&
          error.retryable &&
          attempt < maxAttempts;

        if (!canRetry) {
          throw error;
        }

        const delayMs = computeRetryDelayMs(
          attempt,
          this.config.retryBaseMs,
          this.config.retryJitterMs
        );

        const reason = error.message;
        logStitchTelemetry(
          `retry attempt=${attempt + 1}/${maxAttempts} waitMs=${delayMs} reason="${reason}"`
        );

        await wait(delayMs);
      }
    }

    throw lastError instanceof Error
      ? lastError
      : new Error("Stitch generate request failed after retries");
  }

  private async generateCharacterPartsOnce(
    input: StitchGenerateInput
  ): Promise<GeneratedCastingCandidate[]> {
    const controller = new AbortController();
    const timeoutHandle = setTimeout(() => controller.abort(), this.config.timeoutMs);

    try {
      const headers: Record<string, string> = {
        "content-type": "application/json"
      };

      if (this.config.authBearerToken && this.config.authBearerToken.length > 0) {
        headers.authorization = `Bearer ${this.config.authBearerToken}`;
      }

      const response = await fetch(this.config.generateUrl, {
        method: "POST",
        headers,
        body: JSON.stringify(input),
        signal: controller.signal
      });

      if (!response.ok) {
        const retryable = response.status >= 500 || response.status === 429 || response.status === 408;
        throw new StitchRequestError(
          `Stitch generate request failed with status ${response.status}`,
          retryable
        );
      }

      const payload = await response.json();
      return normalizeGeneratedCandidates(payload);
    } catch (error) {
      if (isAbortError(error)) {
        logStitchTelemetry(`timeout afterMs=${this.config.timeoutMs}`);
        throw new StitchRequestError(
          `Stitch generate request timed out after ${this.config.timeoutMs}ms`,
          true
        );
      }

      if (error instanceof StitchRequestError) {
        throw error;
      }

      if (error instanceof Error) {
        throw new StitchRequestError(`Stitch generate request failed: ${error.message}`, true);
      }

      throw new StitchRequestError("Stitch generate request failed", true);
    } finally {
      clearTimeout(timeoutHandle);
    }
  }

}

const createHttpStitchClientConfig = (generateUrl: string): HttpStitchClientConfig => {
  const timeoutMs = parseIntegerConfig(process.env.STITCH_TIMEOUT_MS, 5000, 1);
  const maxRetries = parseIntegerConfig(process.env.STITCH_MAX_RETRIES, 1, 0);
  const retryBaseMs = parseIntegerConfig(process.env.STITCH_RETRY_BASE_MS, 200, 1);
  const retryJitterMs = parseIntegerConfig(process.env.STITCH_RETRY_JITTER_MS, 100, 0);
  const authBearerToken = process.env.STITCH_AUTH_BEARER_TOKEN?.trim();

  return {
    generateUrl,
    timeoutMs,
    maxRetries,
    retryBaseMs,
    retryJitterMs,
    authBearerToken
  };
};

export const createStitchClient = (): StitchClient => {
  const generateUrl = process.env.STITCH_GENERATE_URL?.trim();

  if (generateUrl && generateUrl.length > 0) {
    return new HttpStitchClient(createHttpStitchClientConfig(generateUrl));
  }

  return new StubStitchClient();
};
