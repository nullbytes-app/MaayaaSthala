/**
 * Audio narration tool using Google Cloud Text-to-Speech.
 *
 * Strategy:
 * - Primary: Google Cloud TTS (Chirp HD — more natural than Neural2, same free tier)
 * - Supports Indian English accent (en-IN) and Hindi (hi-IN)
 * - Returns a data URI or Cloud Storage URL for the audio
 */

/**
 * Available Chirp HD voices for each language, used by the AI voice casting system.
 * Chirp HD voices are a generational leap over Neural2 — more natural prosody,
 * better intonation, less robotic. Same API and pricing tier.
 */
export const DEFAULT_VOICE_PALETTE = {
  "en-IN": [
    { id: "en-IN-Chirp3-HD-Aoede", gender: "female", quality: "warm" },
    { id: "en-IN-Chirp3-HD-Kore", gender: "female", quality: "soft" },
    { id: "en-IN-Chirp3-HD-Enceladus", gender: "male", quality: "deep" },
    { id: "en-IN-Chirp3-HD-Charon", gender: "male", quality: "bright" },
    { id: "en-IN-Chirp3-HD-Achernar", gender: "female", quality: "gentle" },
    { id: "en-IN-Chirp3-HD-Puck", gender: "male", quality: "playful" },
  ],
  "hi-IN": [
    { id: "hi-IN-Neural2-A", gender: "female", quality: "warm" },
    { id: "hi-IN-Neural2-B", gender: "female", quality: "soft" },
    { id: "hi-IN-Neural2-C", gender: "male", quality: "deep" },
    { id: "hi-IN-Neural2-D", gender: "male", quality: "bright" },
  ],
} as const;

/** A single character's voice assignment in an AI-generated casting map. */
export interface VoiceCastEntry {
  voice: string;
  rate: number;
  pitch: number;
}

/** AI-generated voice casting map: character name (or "narrator") → voice config. */
export type VoiceCasting = Record<string, VoiceCastEntry>;

/**
 * Resolve TTS voice configuration for a speaker from an AI-generated casting map.
 *
 * The casting map is produced by the conversation agent at story start.
 * Falls back to sensible defaults if the speaker is not in the casting map.
 *
 * @param speaker - Character name or "narrator".
 * @param casting - AI-generated voice casting map.
 * @returns Voice name, speaking rate, and pitch for Google Cloud TTS.
 */
export function resolveVoiceConfig(
  speaker: string,
  casting: VoiceCasting
): { voiceName: string; speakingRate: number; pitch: number } {
  const entry = casting[speaker];
  console.log(`[audioNarrator] resolveVoiceConfig speaker="${speaker}" found=${!!entry} voice=${entry?.voice ?? "FALLBACK"}`);
  if (entry) {
    return { voiceName: entry.voice, speakingRate: entry.rate, pitch: entry.pitch };
  }
  // Reason: unknown speakers fall back to role-based defaults so the experience
  // degrades gracefully rather than erroring when casting is incomplete.
  if (speaker === "narrator") {
    return { voiceName: "en-IN-Chirp3-HD-Enceladus", speakingRate: 0.85, pitch: -1.0 };
  }
  return { voiceName: "en-IN-Chirp3-HD-Charon", speakingRate: 1.0, pitch: 0.0 };
}

/**
 * Build SSML markup for Google Cloud TTS with natural pacing.
 *
 * Chirp HD / Chirp3-HD voices only support: <phoneme>, <p>, <s>, <sub>, <say-as>.
 * They do NOT support <prosody>, <break>, <emphasis>, or pitch/volume control.
 * Neural2/Wavenet voices support the full SSML spec including <prosody> and <break>.
 *
 * @param text - Plain text to convert to SSML.
 * @param emotionHint - Optional emotion key (used for Neural2 prosody only).
 * @param voiceName - Voice name to determine which SSML tags are supported.
 * @returns Valid SSML string ready for Google Cloud TTS `input.ssml` field.
 */
export function buildSSML(text: string, emotionHint?: string, voiceName?: string): string {
  const isChirp = voiceName?.includes("Chirp") ?? false;

  if (isChirp) {
    // Reason: Chirp HD voices produce natural prosody automatically — they handle
    // pacing, emphasis, and intonation from the text itself. We use <p> and <s>
    // for paragraph/sentence boundaries which Chirp HD respects for natural pauses.
    // Split on sentence-ending punctuation to give the voice natural breathing room.
    const sentences = text
      .replace(/\.\.\./g, "…")   // preserve ellipsis as a single character
      .split(/(?<=[.!?])\s+/)    // split on sentence boundaries
      .filter(s => s.trim());

    if (sentences.length <= 1) {
      return `<speak><p>${text}</p></speak>`;
    }
    const ssmlSentences = sentences.map(s => `<s>${s}</s>`).join("");
    return `<speak><p>${ssmlSentences}</p></speak>`;
  }

  // Neural2/Wavenet — full SSML support with prosody and break tags.
  let inner = text.replace(/\.\.\./g, '<break time="400ms"/>');

  switch (emotionHint) {
    case "whisper":
      inner = `<prosody volume="soft" rate="slow">${inner}</prosody>`;
      break;
    case "shout":
      inner = `<prosody volume="loud" rate="fast" pitch="+2st">${inner}</prosody>`;
      break;
    case "excited":
      inner = `<prosody rate="fast" pitch="+1st">${inner}</prosody>`;
      break;
    case "sad":
      inner = `<prosody rate="slow" pitch="-1st">${inner}</prosody>`;
      break;
    case "dramatic":
      inner = `<prosody rate="slow">${inner}</prosody>`;
      break;
    default:
      break;
  }

  return `<speak>${inner}</speak>`;
}

type NarrationOptions = {
  gcpProject?: string;
  languageCode?: "en-IN" | "hi-IN";
  voiceName?: string;
  /** Voice type: "narrator" uses a deeper storyteller voice, "character" uses a lighter dialogue voice. */
  voiceType?: "narrator" | "character";
  /** Character name for per-character voice lookup in voiceCasting map. */
  speaker?: string;
  /** AI-generated voice casting map assigning voices to characters. */
  voiceCasting?: VoiceCasting;
  /** Optional emotion hint for SSML prosody (whisper|shout|excited|sad|dramatic|neutral). */
  emotionHint?: string;
};

type NarrationResult = {
  audioUrl: string;
  durationEstimateMs: number;
  text: string;
  beatNumber?: number;
  source: "google_cloud_tts" | "unavailable";
};

/** Approximate speaking rate for duration estimation (words per minute). */
const WORDS_PER_MINUTE = 140;

/**
 * Estimate audio duration from text length.
 *
 * @param text - Narration text.
 * @returns Estimated duration in milliseconds.
 */
const estimateDurationMs = (text: string): number => {
  const wordCount = text.trim().split(/\s+/).length;
  return Math.ceil((wordCount / WORDS_PER_MINUTE) * 60 * 1000);
};

/**
 * Generate narration audio for a text segment using Google Cloud TTS.
 *
 * Falls back gracefully when TTS is unavailable (missing GCP config).
 *
 * @param text - The narration text to convert to speech.
 * @param beatNumber - Optional NatyaScript beat number for sync.
 * @param options - TTS configuration (language, voice, GCP project).
 * @returns Audio URL and estimated duration for the multimodal stream.
 */
export const narrateText = async (
  text: string,
  beatNumber?: number,
  options: NarrationOptions = {}
): Promise<NarrationResult> => {
  if (!options.gcpProject) {
    return {
      audioUrl: "",
      durationEstimateMs: estimateDurationMs(text),
      text,
      beatNumber,
      source: "unavailable"
    };
  }

  try {
    const result = await callGoogleCloudTts(text, options);
    console.log(`[audioNarrator] TTS success speaker="${options.speaker}" audioUrl=${result.audioUrl ? result.audioUrl.slice(0, 40) + "..." : "EMPTY"}`);
    return {
      audioUrl: result.audioUrl,
      durationEstimateMs: result.durationMs ?? estimateDurationMs(text),
      text,
      beatNumber,
      source: "google_cloud_tts"
    };
  } catch (err) {
    console.log(`[audioNarrator] TTS FAILED speaker="${options.speaker}" err=${err instanceof Error ? err.message : String(err)}`);
    return {
      audioUrl: "",
      durationEstimateMs: estimateDurationMs(text),
      text,
      beatNumber,
      source: "unavailable"
    };
  }
};

type TtsCallResult = {
  audioUrl: string;
  durationMs?: number;
};

const callGoogleCloudTts = async (
  text: string,
  options: NarrationOptions
): Promise<TtsCallResult> => {
  // Dynamic import: @google-cloud/text-to-speech may not be installed in dev.
  const { TextToSpeechClient } = await import("@google-cloud/text-to-speech");
  // Reason: gcloud ADC credentials may authenticate as a different project than
  // GOOGLE_CLOUD_PROJECT from .env. Override GOOGLE_CLOUD_PROJECT env at runtime
  // so the client library routes TTS API calls to the correct project where the
  // API is enabled, rather than the gcloud CLI default project.
  if (options.gcpProject) {
    process.env.GOOGLE_CLOUD_PROJECT = options.gcpProject;
    process.env.GCLOUD_PROJECT = options.gcpProject;
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const client = new (TextToSpeechClient as any)({ projectId: options.gcpProject });

  const languageCode = options.languageCode ?? "en-IN";

  // Use per-character voice casting if provided, otherwise fall back to voiceType heuristic.
  let voiceName: string;
  let speakingRate: number;
  let pitch: number;

  if (options.speaker && options.voiceCasting) {
    // Reason: per-character casting takes precedence over generic voiceType so that
    // each character has a distinct, AI-assigned voice rather than a shared default.
    const resolved = resolveVoiceConfig(options.speaker, options.voiceCasting);
    voiceName = resolved.voiceName;
    speakingRate = resolved.speakingRate;
    pitch = resolved.pitch;
  } else {
    // Legacy fallback: use voiceType heuristic (backwards compatible).
    const isHindi = languageCode === "hi-IN";
    const isCharacterVoice = options.voiceType === "character";
    // Chirp HD voices for natural quality; Hindi falls back to Neural2.
    voiceName = options.voiceName ??
      (isHindi ? "hi-IN-Neural2-A" : isCharacterVoice ? "en-IN-Chirp3-HD-Charon" : "en-IN-Chirp3-HD-Enceladus");
    speakingRate = isCharacterVoice ? 1.0 : 0.85; // Narrator slower for warmth
    pitch = isCharacterVoice ? 0.0 : -1.0; // Narrator deeper
  }

  // Reason: Chirp HD and Chirp3-HD voices do NOT support the pitch parameter —
  // they produce natural prosody automatically. Sending pitch causes INVALID_ARGUMENT.
  // Only include pitch for Neural2/Wavenet/Standard voices.
  const isChirpVoice = voiceName.includes("Chirp");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const audioConfig: any = { audioEncoding: "MP3", speakingRate };
  if (!isChirpVoice) {
    audioConfig.pitch = pitch;
  }

  // Reason: GCP TTS can hang indefinitely when credentials are invalid or the project
  // doesn't have TTS API enabled. A 10s timeout ensures the try/catch in narrateText
  // sees the failure and falls back to "unavailable" rather than blocking the beat loop.
  const synthesizeWithTimeout = (): Promise<ReturnType<typeof client.synthesizeSpeech>> =>
    new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("TTS timeout after 10s")), 10_000);
      client.synthesizeSpeech({
        input: { ssml: buildSSML(text, options.emotionHint, voiceName) },
        voice: { languageCode, name: voiceName },
        audioConfig
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      }).then((result: any) => { clearTimeout(timer); resolve(result); })
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .catch((err: any) => { clearTimeout(timer); reject(err); });
    });

  const [response] = await synthesizeWithTimeout();

  if (!response.audioContent) {
    throw new Error("Google Cloud TTS returned empty audio content");
  }

  // Return as data URI for inline playback (no storage dependency).
  const base64Audio = Buffer.from(response.audioContent).toString("base64");
  const audioUrl = `data:audio/mp3;base64,${base64Audio}`;

  return { audioUrl };
};
