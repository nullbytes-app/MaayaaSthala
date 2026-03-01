import { renderSvgPlaceholder } from "../svgPlaceholder.js";

type SceneIllustratorOptions = {
  gcpProject?: string;
  gcpLocation?: string;
  /** Gemini API key for Gemini image generation fallback. */
  apiKey?: string;
};

type IllustrationResult = {
  sceneId: string;
  imageUrl: string;
  caption: string;
  source: "vertex_ai" | "gemini" | "svg_placeholder";
};

/**
 * Generate a scene illustration using Vertex AI Imagen or Gemini.
 * Falls back to SVG placeholder if all AI providers fail.
 *
 * Reason: Vertex AI and Gemini are raced in PARALLEL so Gemini can deliver
 * a backdrop even when Vertex AI is misconfigured and hangs for several seconds.
 * Previously they ran sequentially — Vertex AI's 5s timeout consumed most of the
 * 8s SCENE_OPEN wait window, leaving Gemini no time to complete its generation.
 *
 * @param sceneId - Unique scene identifier (used for caching/fallback).
 * @param setting - Scene description from NatyaScript (e.g. "A magical forest at dusk").
 * @param tradition - Folklore tradition for style guidance.
 * @param options - GCP configuration for Vertex AI.
 * @returns Illustration URL and caption for the chat stream.
 */
export const illustrateScene = async (
  sceneId: string,
  setting: string,
  tradition: string,
  options: SceneIllustratorOptions = {}
): Promise<IllustrationResult> => {
  const providerPromises: Promise<IllustrationResult | null>[] = [];

  // Start Vertex AI and Gemini simultaneously — first success wins.
  if (options.gcpProject && options.gcpLocation) {
    providerPromises.push(tryVertexAiSceneImage(sceneId, setting, tradition, options));
  }
  if (options.apiKey) {
    providerPromises.push(tryGeminiSceneImage(sceneId, setting, tradition, options.apiKey));
  }

  if (providerPromises.length > 0) {
    // Promise.any resolves with first non-rejected result. We convert null returns to
    // rejections so Promise.any skips them and waits for a real image.
    const result = await Promise.any(
      providerPromises.map((p) => p.then((r) => r ?? Promise.reject(new Error("no result"))))
    ).catch(() => null);

    if (result) {
      return result;
    }
  }

  // Last resort: SVG placeholder with scene name.
  return {
    sceneId,
    imageUrl: renderSvgPlaceholder(sceneId, setting),
    caption: setting,
    source: "svg_placeholder"
  };
};

/**
 * Attempt Gemini (Nano Banana 2) image generation for scene backdrops.
 * Uses gemini-3.1-flash-image-preview with IMAGE response modality.
 * Falls between Vertex AI and SVG placeholder.
 */
const tryGeminiSceneImage = async (
  sceneId: string,
  setting: string,
  tradition: string,
  apiKey: string
): Promise<IllustrationResult | null> => {
  try {
    // @ts-ignore — GoogleGenAI is a named ESM export at runtime; TypeScript Bundler moduleResolution mismatch with @google/genai types
    const { GoogleGenAI } = await import("@google/genai");
    const genAI = new GoogleGenAI({ apiKey });

    const prompt =
      `Indian ${tradition} puppet theatre backdrop: ${setting}. ` +
      "Traditional Indian illustration style, warm earthy colors (ochre, saffron, deep red), " +
      "hand-painted textures, theatrical atmosphere, 16:9 wide format, suitable for stage backdrop.";

    const response = await genAI.models.generateContent({
      model: "gemini-3.1-flash-image-preview",
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      config: {
        responseModalities: ["IMAGE", "TEXT"]
      }
    });

    const candidates = response.candidates ?? [];
    for (const candidate of candidates) {
      for (const part of candidate.content?.parts ?? []) {
        if (part.inlineData?.mimeType?.startsWith("image/") && part.inlineData.data) {
          return {
            sceneId,
            imageUrl: `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`,
            caption: setting,
            source: "gemini"
          };
        }
      }
    }

    return null;
  } catch {
    return null;
  }
};

const tryVertexAiSceneImage = async (
  sceneId: string,
  setting: string,
  tradition: string,
  options: SceneIllustratorOptions
): Promise<IllustrationResult | null> => {
  try {
    const { PredictionServiceClient } = await import("@google-cloud/aiplatform");
    const client = new PredictionServiceClient({
      apiEndpoint: `${options.gcpLocation}-aiplatform.googleapis.com`
    });

    const endpoint = `projects/${options.gcpProject}/locations/${options.gcpLocation}/publishers/google/models/imagegeneration@006`;
    const styleGuide =
      "Traditional Indian illustration style, warm earthy colors (ochre, saffron, deep red), " +
      "hand-painted textures, suitable for puppet theatre backdrop, detailed and atmospheric.";
    const prompt = `Scene backdrop for Indian ${tradition} puppet theatre: ${setting}. ${styleGuide}`;

    // Reason: Vertex AI can hang for 30s+ when the project has no credentials or the API
    // is not enabled. A 5s timeout lets us fall through to the Gemini fallback within the
    // 8s backdrop window in compileAndRunPlay, so backdrops appear even without Vertex AI.
    const predictWithTimeout = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("Vertex AI timeout after 5s")), 5_000)
    );

    const [response] = await Promise.race([
      client.predict({
        endpoint,
        instances: [{ structValue: { fields: { prompt: { stringValue: prompt } } } }],
        parameters: {
          structValue: {
            fields: {
              sampleCount: { numberValue: 1 },
              aspectRatio: { stringValue: "16:9" }
            }
          }
        }
      }),
      predictWithTimeout
    ]) as [Awaited<ReturnType<typeof client.predict>>[0], unknown];

    const imageData =
      response.predictions?.[0]?.structValue?.fields?.bytesBase64Encoded?.stringValue;
    if (!imageData) {
      return null;
    }

    return {
      sceneId,
      imageUrl: `data:image/png;base64,${imageData}`,
      caption: setting,
      source: "vertex_ai"
    };
  } catch {
    return null;
  }
};
