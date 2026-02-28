/**
 * Audio narration tool using Google Cloud Text-to-Speech.
 *
 * Strategy:
 * - Primary: Google Cloud TTS (WaveNet/Neural2 — free 1M chars/month)
 * - Supports Indian English accent (en-IN) and Hindi (hi-IN)
 * - Returns a data URI or Cloud Storage URL for the audio
 */

/**
 * Available Neural2 voices for each language, used by the AI voice casting system.
 * Each voice has a gender and quality descriptor to help the AI assign appropriate voices.
 */
export const DEFAULT_VOICE_PALETTE = {
  "en-IN": [
    { id: "en-IN-Neural2-A", gender: "female", quality: "warm" },
    { id: "en-IN-Neural2-B", gender: "female", quality: "soft" },
    { id: "en-IN-Neural2-C", gender: "male", quality: "deep" },
    { id: "en-IN-Neural2-D", gender: "male", quality: "bright" },
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
  if (entry) {
    return { voiceName: entry.voice, speakingRate: entry.rate, pitch: entry.pitch };
  }
  // Reason: unknown speakers fall back to role-based defaults so the experience
  // degrades gracefully rather than erroring when casting is incomplete.
  if (speaker === "narrator") {
    return { voiceName: "en-IN-Neural2-A", speakingRate: 0.85, pitch: -1.0 };
  }
  return { voiceName: "en-IN-Neural2-D", speakingRate: 1.0, pitch: 0.0 };
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
    return {
      audioUrl: result.audioUrl,
      durationEstimateMs: result.durationMs ?? estimateDurationMs(text),
      text,
      beatNumber,
      source: "google_cloud_tts"
    };
  } catch {
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
  const client = new TextToSpeechClient();

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
    // Neural2 voices give the best quality; fallback to Wavenet if unavailable.
    // Narrator: en-IN-Neural2-A (deeper, slower) | Character: en-IN-Neural2-D (lighter, normal)
    voiceName = options.voiceName ??
      (isHindi ? "hi-IN-Neural2-A" : isCharacterVoice ? "en-IN-Neural2-D" : "en-IN-Neural2-A");
    speakingRate = isCharacterVoice ? 1.0 : 0.85; // Narrator slower for warmth
    pitch = isCharacterVoice ? 0.0 : -1.0; // Narrator deeper
  }

  // Reason: GCP TTS can hang indefinitely when credentials are invalid or the project
  // doesn't have TTS API enabled. A 10s timeout ensures the try/catch in narrateText
  // sees the failure and falls back to "unavailable" rather than blocking the beat loop.
  const synthesizeWithTimeout = (): Promise<ReturnType<typeof client.synthesizeSpeech>> =>
    new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("TTS timeout after 10s")), 10_000);
      client.synthesizeSpeech({
        input: { text },
        voice: { languageCode, name: voiceName },
        audioConfig: { audioEncoding: "MP3", speakingRate, pitch }
      }).then((result) => { clearTimeout(timer); resolve(result); })
        .catch((err) => { clearTimeout(timer); reject(err); });
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
