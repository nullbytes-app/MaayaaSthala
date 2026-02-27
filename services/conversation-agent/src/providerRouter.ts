import { renderSvgPlaceholder } from "./svgPlaceholder.js";
import type { CharacterGenerationRequest, CharacterGenerationResult } from "./types.js";

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
 * Attempt Gemini image generation for character portraits.
 * Uses gemini-2.0-flash-exp with IMAGE response modality.
 * Falls between Vertex AI and SVG placeholder.
 */
const tryGeminiCharacterImage = async (
  request: CharacterGenerationRequest,
  apiKey: string
): Promise<CharacterGenerationResult | null> => {
  try {
    const { GoogleGenAI } = await import("@google/genai");
    const genAI = new GoogleGenAI({ apiKey });

    const prompt =
      `2D cartoon character for animated show: ${request.name}, ${request.archetype}. ` +
      `${request.description}. Modern cartoon style, bright vibrant colors, clean bold outlines, ` +
      `simple shapes, expressive face, full body front view, standing T-pose with arms out and legs slightly apart, ` +
      `isolated on solid white background #FFFFFF, no shadows, no scenery, no ground, PNG sprite style.`;

    const response = await genAI.models.generateContent({
      model: "gemini-2.0-flash-exp-image-generation",
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
            source: "vertex_ai" // Reuse vertex_ai source label for compatibility
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
      `2D cartoon character for animated show: ${request.name}, ${request.archetype} archetype. ` +
      `${request.description}. Modern cartoon style, bright vibrant colors, clean bold outlines, ` +
      `simple shapes, expressive face, full body front view, standing T-pose with arms out and legs slightly apart, ` +
      `isolated on solid white background #FFFFFF, no shadows, no scenery, no ground, PNG sprite style.`;

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
 * Generate 6 body-part images for a character in parallel using Gemini.
 * Each part is prompted with cartoon style on a solid white background for client-side color-keying.
 * Returns a parts object only if all 6 images succeed; otherwise returns null.
 */
const tryGeminiPartGeneration = async (
  request: CharacterGenerationRequest,
  apiKey: string
): Promise<{ head: string; torso: string; leftArm: string; rightArm: string; leftLeg: string; rightLeg: string } | null> => {
  try {
    const { GoogleGenAI } = await import("@google/genai");
    const genAI = new GoogleGenAI({ apiKey });
    const baseDesc = `${request.name}, ${request.archetype}, ${request.description}. Modern 2D cartoon style, bright colors, clean bold outlines, simple shapes, game sprite asset`;

    const partPrompts: Record<string, string> = {
      head: `${baseDesc}, head and neck only, front view, no body below neck, isolated on solid white background #FFFFFF, no shadows`,
      torso: `${baseDesc}, torso from neck to hips only, front view, no head, no arms, no legs, isolated on solid white background #FFFFFF, no shadows`,
      rightArm: `${baseDesc}, right arm only from shoulder to hand, front view, slightly bent, no body, isolated on solid white background #FFFFFF, no shadows`,
      leftArm: `${baseDesc}, left arm only from shoulder to hand, front view, slightly bent, no body, isolated on solid white background #FFFFFF, no shadows`,
      rightLeg: `${baseDesc}, right leg only from hip to foot, front view, no body, isolated on solid white background #FFFFFF, no shadows`,
      leftLeg: `${baseDesc}, left leg only from hip to foot, front view, no body, isolated on solid white background #FFFFFF, no shadows`
    };

    // Generate a single part with up to 2 retries if it fails.
    const generatePartWithRetry = async (partName: string, prompt: string): Promise<{ partName: string; dataUrl: string } | null> => {
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          const response = await genAI.models.generateContent({
            model: "gemini-2.0-flash-exp-image-generation",
            contents: [{ role: "user", parts: [{ text: prompt }] }],
            config: { responseModalities: ["IMAGE", "TEXT"] }
          });
          for (const candidate of response.candidates ?? []) {
            for (const part of candidate.content?.parts ?? []) {
              if (part.inlineData?.mimeType?.startsWith("image/") && part.inlineData.data) {
                return { partName, dataUrl: `data:${part.inlineData.mimeType};base64,${part.inlineData.data}` };
              }
            }
          }
        } catch {
          // Retry on error.
        }
      }
      return null;
    };

    // Fire all 6 image generation calls in parallel for speed.
    const results = await Promise.all(
      Object.entries(partPrompts).map(([partName, prompt]) => generatePartWithRetry(partName, prompt))
    );

    // All 6 parts must succeed for articulated animation to work.
    const partMap: Record<string, string> = {};
    for (const result of results) {
      if (!result) return null;
      partMap[result.partName] = result.dataUrl;
    }

    if (!partMap.head || !partMap.torso || !partMap.rightArm || !partMap.leftArm || !partMap.rightLeg || !partMap.leftLeg) {
      return null;
    }

    return {
      head: partMap.head,
      torso: partMap.torso,
      leftArm: partMap.leftArm,
      rightArm: partMap.rightArm,
      leftLeg: partMap.leftLeg,
      rightLeg: partMap.rightLeg
    };
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
      // Reason: Vertex AI provides the portrait; Gemini generates parts independently.
      // Parts enable articulated limb animation regardless of which provider drew the portrait.
      if (options.apiKey) {
        const parts = await tryGeminiPartGeneration(request, options.apiKey);
        if (parts) {
          vertexResult.parts = parts;
        }
      }
      return vertexResult;
    }
  }

  // Gemini fallback — available with just an API key.
  // Also attempt part generation in parallel to enrich the result for articulated animation.
  if (options.apiKey) {
    const geminiResult = await tryGeminiCharacterImage(request, options.apiKey);
    if (geminiResult) {
      // Reason: Fire part generation concurrently after the portrait succeeds.
      // Parts enable articulated limb animation (Phase 2); portrait is shown immediately.
      const parts = await tryGeminiPartGeneration(request, options.apiKey);
      if (parts) {
        geminiResult.parts = parts;
      }
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
