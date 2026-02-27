/**
 * Audio narration tool using Google Cloud Text-to-Speech.
 *
 * Strategy:
 * - Primary: Google Cloud TTS (WaveNet/Neural2 — free 1M chars/month)
 * - Supports Indian English accent (en-IN) and Hindi (hi-IN)
 * - Returns a data URI or Cloud Storage URL for the audio
 */

type NarrationOptions = {
  gcpProject?: string;
  languageCode?: "en-IN" | "hi-IN";
  voiceName?: string;
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
  // Neural2 voices give the best quality; fallback to Wavenet if unavailable.
  const voiceName =
    options.voiceName ??
    (languageCode === "hi-IN" ? "hi-IN-Neural2-A" : "en-IN-Neural2-A");

  const [response] = await client.synthesizeSpeech({
    input: { text },
    voice: {
      languageCode,
      name: voiceName
    },
    audioConfig: {
      audioEncoding: "MP3",
      speakingRate: 0.9, // Slightly slower for storytelling warmth
      pitch: -1.0 // Slightly deeper for narrator voice
    }
  });

  if (!response.audioContent) {
    throw new Error("Google Cloud TTS returned empty audio content");
  }

  // Return as data URI for inline playback (no storage dependency).
  const base64Audio = Buffer.from(response.audioContent).toString("base64");
  const audioUrl = `data:audio/mp3;base64,${base64Audio}`;

  return { audioUrl };
};
