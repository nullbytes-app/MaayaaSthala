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
      left_arm: `/generated/${assetId}_left_arm.png`,
      right_arm: `/generated/${assetId}_right_arm.png`,
      left_leg: `/generated/${assetId}_left_leg.png`,
      right_leg: `/generated/${assetId}_right_leg.png`
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
      `Indian puppet theatre character: ${request.name}, ${request.archetype} archetype. ` +
      `${request.description}. Traditional Indian illustration style, warm earthy colors, ` +
      `detailed costume, suitable for shadow puppet theatre. Clean background.`;

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

  // Illustration chain: Vertex AI → Stitch generate_screen_from_text → SVG placeholder.
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

  // Stitch screen-from-text as middle fallback (dev environment only).
  if (options.stitchMcpAvailable) {
    const stitchScreenResult = await tryStitchScreenFromText(request);
    if (stitchScreenResult) {
      return stitchScreenResult;
    }
  }

  return generateSvgFallback(request);
};
