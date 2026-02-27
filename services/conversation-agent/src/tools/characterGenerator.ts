import { routeCharacterGeneration, type RouterOptions } from "../providerRouter.js";
import { cacheApprovedAsset } from "./characterBrowser.js";
import { renderSvgPlaceholder } from "../svgPlaceholder.js";
import type { CharacterAsset, CharacterGenerationRequest, CharacterGenerationResult } from "../types.js";

type GeneratorOptions = {
  gcpProject?: string;
  gcpLocation?: string;
  stitchMcpAvailable?: boolean;
  /**
   * Optional Stitch MCP client — only available in the Claude Code dev environment.
   * When provided, puppet-part generation uses the actual Stitch MCP tools.
   * In production (Cloud Run), leave undefined to use the stub chain.
   */
  stitchMcpClient?: RouterOptions["stitchMcpClient"];
};

/**
 * Generate a new character asset via the provider router.
 *
 * Routes puppet-part requests to Stitch MCP/stub chain.
 * Routes illustration requests to Vertex AI/SVG chain.
 *
 * @param request - Character details including whether puppet parts are needed.
 * @param options - Provider configuration from environment.
 * @returns A CharacterAsset ready for session approval and caching.
 */
export const generateCharacter = async (
  request: CharacterGenerationRequest,
  options: GeneratorOptions = {}
): Promise<CharacterAsset> => {
  const result: CharacterGenerationResult = await routeCharacterGeneration(request, {
    stitchMcpAvailable: options.stitchMcpAvailable ?? false,
    stitchMcpClient: options.stitchMcpClient,
    gcpProject: options.gcpProject,
    gcpLocation: options.gcpLocation
  });

  const asset: CharacterAsset = {
    assetId: result.assetId,
    name: result.name,
    archetype: request.archetype,
    previewUrl: result.previewUrl,
    hasParts: result.hasParts,
    source:
      result.source === "stitch_mcp" ? "stitch"
      : result.source === "stitch_stub" ? "stub"
      : result.source === "vertex_ai" ? "vertex_ai"
      : "svg"
  };

  return asset;
};

/**
 * Approve a generated character asset and cache it for reuse in this session.
 *
 * @param asset - The CharacterAsset to approve and cache.
 */
export const approveAndCacheCharacter = (asset: CharacterAsset): void => {
  cacheApprovedAsset(asset);
};

/**
 * Build a CharacterGenerationRequest from story character data.
 * Determines whether puppet parts are needed based on the use case.
 *
 * @param char - Story character with name, archetype, description.
 * @param needsParts - True when the character will be animated as a puppet.
 * @returns A CharacterGenerationRequest for the provider router.
 */
export const buildGenerationRequest = (
  char: { charId: string; name: string; archetype: string; description: string },
  needsParts = true
): CharacterGenerationRequest => ({
  charId: char.charId,
  name: char.name,
  archetype: char.archetype,
  description: char.description,
  style: "traditional Indian shadow puppet theatre, warm earthy tones",
  needsParts
});
