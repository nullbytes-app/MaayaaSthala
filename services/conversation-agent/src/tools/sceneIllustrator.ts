import { renderSvgPlaceholder } from "../svgPlaceholder.js";

type SceneIllustratorOptions = {
  gcpProject?: string;
  gcpLocation?: string;
};

type IllustrationResult = {
  sceneId: string;
  imageUrl: string;
  caption: string;
  source: "vertex_ai" | "svg_placeholder";
};

/**
 * Generate a scene illustration using Vertex AI Imagen.
 * Falls back to SVG placeholder if Vertex AI is unavailable.
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
  if (options.gcpProject && options.gcpLocation) {
    const vertexResult = await tryVertexAiSceneImage(sceneId, setting, tradition, options);
    if (vertexResult) {
      return vertexResult;
    }
  }

  // Fallback: SVG placeholder with scene name.
  return {
    sceneId,
    imageUrl: renderSvgPlaceholder(sceneId, setting),
    caption: setting,
    source: "svg_placeholder"
  };
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

    const [response] = await client.predict({
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
    });

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
