import { renderSvgPlaceholder } from "./svgPlaceholder.js";
import type { CharacterGenerationRequest, CharacterGenerationResult, ExpressionMap } from "./types.js";

/**
 * Provider router for character generation.
 *
 * Puppet-part assets (need parts manifest for animation):
 *   Stitch MCP → Stitch HTTP stub → SVG placeholder
 *
 * Illustration/portrait assets (full images, no parts needed):
 *   Vertex AI Imagen → Stitch generate_screen_from_text → SVG placeholder
 */

export type RouterOptions = {
  /**
   * If true, Stitch MCP tools are available (Claude Code dev environment only).
   * In production (Cloud Run), this is always false — stub chain is used instead.
   */
  stitchMcpAvailable?: boolean;
  /**
   * Optional Stitch MCP client callable for dev-environment puppet generation.
   * When not provided and stitchMcpAvailable is true, falls back to stub.
   */
  stitchMcpClient?: (request: CharacterGenerationRequest) => Promise<CharacterGenerationResult>;
  /** GCP project for Vertex AI image generation. */
  gcpProject?: string;
  gcpLocation?: string;
  /** Gemini API key for Gemini image generation fallback. */
  apiKey?: string;
};

/**
 * Attempt Stitch HTTP stub as a fallback for puppet-part assets.
 * Uses the existing stitchClient pattern (returns mock data).
 */
const tryStitchStub = async (
  request: CharacterGenerationRequest
): Promise<CharacterGenerationResult> => {
  // Reason: Stitch HTTP stub returns deterministic mock parts based on character name.
  // This mirrors the pattern in services/resolver/src/integrations/stitchClient.ts.
  const assetId = `stub_${request.charId}_${Date.now()}`;

  return {
    assetId,
    name: request.name,
    previewUrl: `/generated/${assetId}.png`,
    hasParts: true,
    parts: {
      head: `/generated/${assetId}_head.png`,
      torso: `/generated/${assetId}_torso.png`,
      leftArm: `/generated/${assetId}_left_arm.png`,
      rightArm: `/generated/${assetId}_right_arm.png`,
      leftLeg: `/generated/${assetId}_left_leg.png`,
      rightLeg: `/generated/${assetId}_right_leg.png`
    },
    source: "stitch_stub"
  };
};

/**
 * Generate an SVG placeholder for any character (last-resort fallback).
 * Mirrors the pattern in services/resolver/src/httpServer.ts lines 182-216.
 */
const generateSvgFallback = (request: CharacterGenerationRequest): CharacterGenerationResult => {
  const assetId = `svg_${request.charId}`;

  return {
    assetId,
    name: request.name,
    previewUrl: `/generated/${assetId}.png`,
    hasParts: false,
    source: "svg_placeholder"
  };
};

/**
 * Attempt Stitch generate_screen_from_text for illustration fallback.
 * Returns a full image (no parts), using Stitch MCP screen generation.
 * This is dev-only; in production Stitch MCP is not available.
 */
const tryStitchScreenFromText = async (
  request: CharacterGenerationRequest
): Promise<CharacterGenerationResult | null> => {
  // Reason: Stitch MCP generate_screen_from_text is only usable in Claude Code runtime.
  // This stub returns null to signal unavailability in all other environments.
  return null;
};

/**
 * Attempt Gemini (Nano Banana 2) image generation for character portraits.
 * Uses gemini-3.1-flash-image-preview with IMAGE response modality.
 * Falls between Vertex AI and SVG placeholder.
 */
const tryGeminiCharacterImage = async (
  request: CharacterGenerationRequest,
  apiKey: string
): Promise<CharacterGenerationResult | null> => {
  try {
    // @ts-ignore — GoogleGenAI is a named ESM export at runtime; TypeScript Bundler moduleResolution mismatch with @google/genai types
    const { GoogleGenAI } = await import("@google/genai");
    const genAI = new GoogleGenAI({ apiKey });

    // Reason: Gemini image models tend to produce character reference sheets with
    // 3-4 poses/angles. Structuring the prompt as a clear single-subject portrait
    // request and adding system-level negatives is the most reliable mitigation.
    const prompt =
      `Draw a single portrait of the character "${request.name}" for a children's storybook illustration. ` +
      `${request.description}. ` +
      `Style: 2D cartoon, bright vibrant colors, clean bold outlines, simple shapes, expressive face. ` +
      `Pose: front-facing, standing naturally, arms relaxed at sides. ` +
      `Composition: single character centered, fills 80% of image height, plain solid white background. ` +
      `This is a single portrait — NOT a character sheet, NOT a turnaround, NOT multiple angles. ` +
      `Show exactly ONE character in exactly ONE pose. No side view, no back view, no 3/4 view. ` +
      `No text, no labels, no shadows, no ground, no scenery.`;

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
          const assetId = `gemini_${request.charId}_${Date.now()}`;
          return {
            assetId,
            name: request.name,
            previewUrl: `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`,
            hasParts: false,
            source: "gemini" as const
          };
        }
      }
    }

    return null;
  } catch {
    return null;
  }
};

/**
 * Attempt Vertex AI image generation for illustrations.
 * Returns a full image URL — no parts manifest.
 */
const tryVertexAiImage = async (
  request: CharacterGenerationRequest,
  gcpProject: string,
  gcpLocation: string
): Promise<CharacterGenerationResult | null> => {
  try {
    // Dynamic import so this module loads even without @google-cloud/aiplatform installed.
    const { PredictionServiceClient } = await import("@google-cloud/aiplatform");
    const client = new PredictionServiceClient({
      apiEndpoint: `${gcpLocation}-aiplatform.googleapis.com`
    });

    const endpoint = `projects/${gcpProject}/locations/${gcpLocation}/publishers/google/models/imagegeneration@006`;
    const prompt =
      `Draw a single portrait of the character "${request.name}" for a children's storybook illustration. ` +
      `${request.description}. ` +
      `Style: 2D cartoon, bright vibrant colors, clean bold outlines, simple shapes, expressive face. ` +
      `Pose: front-facing, standing naturally, arms relaxed at sides. ` +
      `Composition: single character centered, fills 80% of image height, plain solid white background. ` +
      `This is a single portrait — NOT a character sheet, NOT a turnaround, NOT multiple angles. ` +
      `Show exactly ONE character in exactly ONE pose. No side view, no back view, no 3/4 view. ` +
      `No text, no labels, no shadows, no ground, no scenery.`;

    const [response] = await client.predict({
      endpoint,
      instances: [{ structValue: { fields: { prompt: { stringValue: prompt } } } }],
      parameters: {
        structValue: {
          fields: {
            sampleCount: { numberValue: 1 },
            aspectRatio: { stringValue: "1:1" }
          }
        }
      }
    });

    const prediction = response.predictions?.[0];
    const imageData = prediction?.structValue?.fields?.bytesBase64Encoded?.stringValue;
    if (!imageData) {
      return null;
    }

    const assetId = `vertex_${request.charId}_${Date.now()}`;
    return {
      assetId,
      name: request.name,
      previewUrl: `data:image/png;base64,${imageData}`,
      hasParts: false,
      source: "vertex_ai"
    };
  } catch {
    return null;
  }
};

/**
 * Generate a single expression variant image via Gemini.
 * Passes the neutral portrait as a reference image so Gemini can match the exact
 * character appearance and only change the facial expression / body language.
 * Returns null on failure — neutral image is always the fallback.
 */
const generateSingleExpression = async (
  name: string,
  archetype: string,
  description: string,
  expressionKey: string,
  apiKey: string,
  neutralUrl: string  // base64 data URL of the neutral portrait for visual reference
): Promise<string | null> => {
  const expressionDescriptions: Record<string, string> = {
    happy: "broadly smiling, eyes bright and crinkled with joy, relaxed open posture, slight bounce in stance",
    angry: "furrowed brows pulled together, tight lips or bared teeth, tense rigid posture, leaning forward",
    sad: "downcast eyes looking down-left, slight frown, drooping shoulders, deflated quiet posture"
  };

  const expressionDesc = expressionDescriptions[expressionKey] ?? expressionKey;

  try {
    // @ts-ignore — GoogleGenAI is a named ESM export at runtime; TypeScript Bundler moduleResolution mismatch
    const { GoogleGenAI } = await import("@google/genai");
    const genAI = new GoogleGenAI({ apiKey });

    const prompt =
      `This is the REFERENCE portrait of ${name}, ${archetype}. ${description}. ` +
      `Generate the EXACT SAME character with IDENTICAL design, colors, clothing, proportions, and art style. ` +
      `ONLY change: facial expression and slight body language to show: ${expressionDesc}. ` +
      `Keep everything else pixel-perfect consistent with the reference image. ` +
      `Full body front view, character fills 80% of image height, solid white background #FFFFFF, no shadows, no scenery, PNG sprite style.`;

    // Include the neutral portrait as a visual reference if it's a valid base64 data URL.
    // Reason: multimodal input lets Gemini see the actual character design and produce
    // consistent expression variants instead of regenerating a different character from scratch.
    const base64Match = neutralUrl.match(/^data:(image\/\w+);base64,(.+)$/);
    const parts: Array<Record<string, unknown>> = [];
    if (base64Match) {
      parts.push({ inlineData: { mimeType: base64Match[1], data: base64Match[2] } });
    }
    parts.push({ text: prompt });

    const response = await genAI.models.generateContent({
      model: "gemini-3.1-flash-image-preview",
      contents: [{ role: "user", parts }],
      config: { responseModalities: ["IMAGE", "TEXT"] }
    });

    for (const candidate of response.candidates ?? []) {
      for (const part of candidate.content?.parts ?? []) {
        if (part.inlineData?.mimeType?.startsWith("image/") && part.inlineData.data) {
          return `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`;
        }
      }
    }
    return null;
  } catch {
    return null;
  }
};

/**
 * Generate expression variants for a character portrait (neutral always included).
 * Only generates the variants specified by requiredKeys (defaults to all: happy, angry, sad).
 * Variants fire in parallel and arrive via the onExpression callback as they complete.
 *
 * @param name - Character name for the prompt.
 * @param archetype - Character archetype (hero, villain, etc.).
 * @param description - Character visual description.
 * @param neutralUrl - The already-generated neutral portrait URL (also used as reference image).
 * @param apiKey - Gemini API key.
 * @param onExpression - Called for each completed non-neutral expression (key + imageUrl).
 * @param timeoutMs - Timeout per variant in ms (default 15000).
 * @param requiredKeys - Only generate these expression variants (omit to generate all three).
 */
export const generateExpressionVariants = async (
  name: string,
  archetype: string,
  description: string,
  neutralUrl: string,
  apiKey: string,
  onExpression: (key: keyof ExpressionMap, imageUrl: string) => void,
  timeoutMs = 15000,
  requiredKeys?: Array<keyof ExpressionMap>
): Promise<ExpressionMap> => {
  const expressions: ExpressionMap = { neutral: neutralUrl };

  const withTimeout = <T>(promise: Promise<T | null>): Promise<T | null> =>
    Promise.race([
      promise,
      new Promise<null>((resolve) => setTimeout(() => resolve(null), timeoutMs))
    ]);

  // Use only the required keys if provided, otherwise generate all three variants.
  const variantKeys: Array<keyof ExpressionMap> = requiredKeys ?? ["happy", "angry", "sad"];
  const variantPromises = variantKeys.map(async (key) => {
    const url = await withTimeout(
      generateSingleExpression(name, archetype, description, key, apiKey, neutralUrl)
    );
    if (url) {
      expressions[key] = url;
      onExpression(key, url);
    }
  });

  await Promise.all(variantPromises);
  return expressions;
};

/**
 * Generate a prop image via Gemini for use as a stage prop sprite.
 * Returns a base64 data URL or null if generation fails.
 * Falls back gracefully — Canvas 2D drawing is always the fallback.
 *
 * @param propType - Descriptive snake_case prop name (e.g. "throne", "sword", "well").
 * @param apiKey - Gemini API key.
 * @param timeoutMs - Timeout in ms (default 12000).
 */
export const generatePropImage = async (
  propType: string,
  apiKey: string,
  timeoutMs = 12000
): Promise<string | null> => {
  try {
    // @ts-ignore — GoogleGenAI is a named ESM export at runtime; TypeScript Bundler moduleResolution mismatch with @google/genai types
    const { GoogleGenAI } = await import("@google/genai");
    const genAI = new GoogleGenAI({ apiKey });

    const prompt =
      `Draw a single prop object: "${propType}" for a children's Indian puppet theatre stage. ` +
      `Style: 2D cartoon, warm earthy colors, clean bold outlines, simple flat shapes. ` +
      `Composition: single object centered, fills 70% of image, plain solid white background #FFFFFF. ` +
      `No text, no labels, no shadows, no scenery, no characters. Object only.`;

    const withTimeout = <T>(p: Promise<T>): Promise<T | null> =>
      Promise.race([p, new Promise<null>((res) => setTimeout(() => res(null), timeoutMs))]);

    const response = await withTimeout(
      genAI.models.generateContent({
        model: "gemini-3.1-flash-image-preview",
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        config: { responseModalities: ["IMAGE", "TEXT"] }
      })
    );

    if (!response) return null;

    for (const candidate of response.candidates ?? []) {
      for (const part of candidate.content?.parts ?? []) {
        if (part.inlineData?.mimeType?.startsWith("image/") && part.inlineData.data) {
          return `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`;
        }
      }
    }
    return null;
  } catch {
    return null;
  }
};

/**
 * Route a character generation request to the appropriate provider.
 *
 * @param request - Character details and whether puppet parts are needed.
 * @param options - Router configuration (MCP availability, GCP project).
 * @returns A character generation result from the best available provider.
 */
export const routeCharacterGeneration = async (
  request: CharacterGenerationRequest,
  options: RouterOptions = {}
): Promise<CharacterGenerationResult> => {
  if (request.needsParts) {
    // Puppet-part chain: Stitch MCP client (dev only) → Stitch stub → SVG placeholder.
    // Stitch MCP tools only exist in the Claude Code runtime (mcp__stitch__* tools).
    // In production (Cloud Run), stitchMcpAvailable=false, so stub is used directly.
    if (options.stitchMcpAvailable && options.stitchMcpClient) {
      try {
        return await options.stitchMcpClient(request);
      } catch {
        // Fall through to stub.
      }
    }

    try {
      return await tryStitchStub(request);
    } catch {
      return generateSvgFallback(request);
    }
  }

  // Illustration chain: Vertex AI → Gemini → Stitch generate_screen_from_text → SVG placeholder.
  if (options.gcpProject && options.gcpLocation) {
    const vertexResult = await tryVertexAiImage(
      request,
      options.gcpProject,
      options.gcpLocation
    );

    if (vertexResult) {
      return vertexResult;
    }
  }

  // Gemini fallback — available with just an API key.
  // Also attempt part generation in parallel to enrich the result for articulated animation.
  if (options.apiKey) {
    const geminiResult = await tryGeminiCharacterImage(request, options.apiKey);
    if (geminiResult) {
      return geminiResult;
    }
  }

  // Stitch screen-from-text as middle fallback (dev environment only).
  if (options.stitchMcpAvailable) {
    const stitchScreenResult = await tryStitchScreenFromText(request);
    if (stitchScreenResult) {
      return stitchScreenResult;
    }
  }

  return generateSvgFallback(request);
};
