import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { analyzeStory } from "./routes/analyzeStory";
import { prepareCasting } from "./routes/prepareCasting";
import { generateCastingCandidates } from "./routes/generateCastingCandidates";
import { approveCasting } from "./routes/approveCasting";
import { generateArtifact } from "./routes/generateArtifact";
import { resolveCharacters } from "./routes/resolveCharacters";
import { runDemo } from "./routes/runDemo";
import { createTraceEvent, type TraceEvent } from "../../agent-orchestrator/src/telemetry/traceLogger";
import { createModelGatewayFromEnv } from "../../agent-orchestrator/src/adk/modelGateway";
import { createAgentFromEnv } from "../../../services/conversation-agent/src/agent";
import { attachChatWebSocketServer } from "../../../services/conversation-agent/src/server";

type ServerOptions = {
  port?: number;
  maxBodyBytes?: number;
  onTraceEvent?: (event: TraceEvent) => void;
};

export type ResolverHttpServerHandle = {
  port: number;
  close: () => Promise<void>;
};

class HttpError extends Error {
  constructor(
    readonly statusCode: number,
    message: string,
    readonly headers: Record<string, string> = {}
  ) {
    super(message);
  }
}

const JSON_CONTENT_TYPE = "application/json";

type RouteDefinition = {
  method: "POST" | "GET";
  path: string;
};

type RouteContext = {
  requestId: string;
};

const ROUTES: RouteDefinition[] = [
  {
    method: "POST",
    path: "/v1/stories/analyze"
  },
  {
    method: "POST",
    path: "/v1/character-resolver/resolve"
  },
  {
    method: "POST",
    path: "/v1/artifacts/generate"
  },
  {
    method: "POST",
    path: "/v1/demo/run"
  },
  {
    method: "POST",
    path: "/v1/casting/prepare"
  },
  {
    method: "POST",
    path: "/v1/casting/generate"
  },
  {
    method: "POST",
    path: "/v1/casting/approve"
  },
  {
    method: "GET",
    path: "/viewer"
  },
  {
    method: "GET",
    path: "/viewer/styles.css"
  },
  {
    method: "GET",
    path: "/viewer/main.js"
  },
  {
    method: "GET",
    path: "/viewer/castingStudio.js"
  },
  {
    method: "GET",
    path: "/viewer/replayAdapter.js"
  },
  {
    method: "GET",
    path: "/viewer/stageRenderer.js"
  },
  {
    method: "GET",
    path: "/viewer/liveAdapter.js"
  },
  {
    method: "GET",
    path: "/viewer/storyDraft.js"
  },
  {
    method: "GET",
    path: "/viewer/puppetVisuals.js"
  },
  {
    method: "GET",
    path: "/viewer/artifactVisuals.js"
  },
  {
    method: "GET",
    path: "/viewer/chatClient.js"
  },
  {
    method: "GET",
    path: "/viewer/chatPanel.js"
  },
  {
    method: "GET",
    path: "/viewer/voiceInput.js"
  },
  {
    method: "GET",
    path: "/viewer/sceneTransition.js"
  },
  {
    method: "GET",
    path: "/viewer/expressionEngine.js"
  },
  {
    method: "GET",
    path: "/viewer/cinematicEffects.js"
  },
  {
    method: "GET",
    path: "/viewer/moodEngine.js"
  },
  {
    method: "GET",
    path: "/viewer/speechBubble.js"
  },
  {
    method: "GET",
    path: "/viewer/audioSync.js"
  },
  {
    method: "GET",
    path: "/viewer/propSprites.js"
  },
  {
    method: "GET",
    path: "/viewer/favicon.svg"
  }
];

const VIEWER_ASSETS: Record<string, { filePath: string; contentType: string }> = {
  "/viewer": {
    filePath: fileURLToPath(new URL("../../../apps/story-viewer/web/index.html", import.meta.url)),
    contentType: "text/html; charset=utf-8"
  },
  "/viewer/styles.css": {
    filePath: fileURLToPath(new URL("../../../apps/story-viewer/web/styles.css", import.meta.url)),
    contentType: "text/css; charset=utf-8"
  },
  "/viewer/main.js": {
    filePath: fileURLToPath(new URL("../../../apps/story-viewer/web/main.js", import.meta.url)),
    contentType: "text/javascript; charset=utf-8"
  },
  "/viewer/castingStudio.js": {
    filePath: fileURLToPath(new URL("../../../apps/story-viewer/web/castingStudio.js", import.meta.url)),
    contentType: "text/javascript; charset=utf-8"
  },
  "/viewer/replayAdapter.js": {
    filePath: fileURLToPath(new URL("../../../apps/story-viewer/web/replayAdapter.js", import.meta.url)),
    contentType: "text/javascript; charset=utf-8"
  },
  "/viewer/stageRenderer.js": {
    filePath: fileURLToPath(new URL("../../../apps/story-viewer/web/stageRenderer.js", import.meta.url)),
    contentType: "text/javascript; charset=utf-8"
  },
  "/viewer/liveAdapter.js": {
    filePath: fileURLToPath(new URL("../../../apps/story-viewer/web/liveAdapter.js", import.meta.url)),
    contentType: "text/javascript; charset=utf-8"
  },
  "/viewer/storyDraft.js": {
    filePath: fileURLToPath(new URL("../../../apps/story-viewer/web/storyDraft.js", import.meta.url)),
    contentType: "text/javascript; charset=utf-8"
  },
  "/viewer/puppetVisuals.js": {
    filePath: fileURLToPath(new URL("../../../apps/story-viewer/web/puppetVisuals.js", import.meta.url)),
    contentType: "text/javascript; charset=utf-8"
  },
  "/viewer/artifactVisuals.js": {
    filePath: fileURLToPath(new URL("../../../apps/story-viewer/web/artifactVisuals.js", import.meta.url)),
    contentType: "text/javascript; charset=utf-8"
  },
  "/viewer/chatClient.js": {
    filePath: fileURLToPath(new URL("../../../apps/story-viewer/web/chatClient.js", import.meta.url)),
    contentType: "text/javascript; charset=utf-8"
  },
  "/viewer/chatPanel.js": {
    filePath: fileURLToPath(new URL("../../../apps/story-viewer/web/chatPanel.js", import.meta.url)),
    contentType: "text/javascript; charset=utf-8"
  },
  "/viewer/voiceInput.js": {
    filePath: fileURLToPath(new URL("../../../apps/story-viewer/web/voiceInput.js", import.meta.url)),
    contentType: "text/javascript; charset=utf-8"
  },
  "/viewer/sceneTransition.js": {
    filePath: fileURLToPath(new URL("../../../apps/story-viewer/web/sceneTransition.js", import.meta.url)),
    contentType: "text/javascript; charset=utf-8"
  },
  "/viewer/expressionEngine.js": {
    filePath: fileURLToPath(new URL("../../../apps/story-viewer/web/expressionEngine.js", import.meta.url)),
    contentType: "text/javascript; charset=utf-8"
  },
  "/viewer/cinematicEffects.js": {
    filePath: fileURLToPath(new URL("../../../apps/story-viewer/web/cinematicEffects.js", import.meta.url)),
    contentType: "text/javascript; charset=utf-8"
  },
  "/viewer/moodEngine.js": {
    filePath: fileURLToPath(new URL("../../../apps/story-viewer/web/moodEngine.js", import.meta.url)),
    contentType: "text/javascript; charset=utf-8"
  },
  "/viewer/speechBubble.js": {
    filePath: fileURLToPath(new URL("../../../apps/story-viewer/web/speechBubble.js", import.meta.url)),
    contentType: "text/javascript; charset=utf-8"
  },
  "/viewer/audioSync.js": {
    filePath: fileURLToPath(new URL("../../../apps/story-viewer/web/audioSync.js", import.meta.url)),
    contentType: "text/javascript; charset=utf-8"
  },
  "/viewer/propSprites.js": {
    filePath: fileURLToPath(new URL("../../../apps/story-viewer/web/propSprites.js", import.meta.url)),
    contentType: "text/javascript; charset=utf-8"
  },
  "/viewer/favicon.svg": {
    filePath: fileURLToPath(new URL("../../../apps/story-viewer/web/favicon.svg", import.meta.url)),
    contentType: "image/svg+xml"
  }
};

const GENERATED_PREVIEW_PATH = /^\/generated\/([a-z0-9._-]+)\.png$/i;

const escapeSvgText = (value: string): string =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");

const hashString = (value: string): number => {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash += (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24);
  }

  return Math.abs(hash >>> 0);
};

const renderGeneratedPreviewSvg = (artifactId: string): string => {
  const hash = hashString(artifactId);
  const hue = hash % 360;
  const hueLight = (hue + 320) % 360;
  const title = escapeSvgText(artifactId);

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512" role="img" aria-label="${title}">
  <defs>
    <linearGradient id="puppet" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="hsl(${hueLight} 68% 66%)"/>
      <stop offset="100%" stop-color="hsl(${hue} 58% 48%)"/>
    </linearGradient>
  </defs>
  <g transform="translate(256 292)">
    <ellipse cx="0" cy="-112" rx="32" ry="40" fill="url(#puppet)" stroke="rgba(45,20,12,0.85)" stroke-width="4"/>
    <path d="M -44 -74 Q -60 -22 -50 54 L -38 126 L 38 126 L 50 54 Q 60 -22 44 -74 Z" fill="url(#puppet)" stroke="rgba(45,20,12,0.85)" stroke-width="4"/>
    <circle cx="-18" cy="6" r="4" fill="rgba(63,30,18,0.45)"/>
    <circle cx="0" cy="16" r="4" fill="rgba(63,30,18,0.45)"/>
    <circle cx="18" cy="6" r="4" fill="rgba(63,30,18,0.45)"/>
    <line x1="0" y1="12" x2="0" y2="186" stroke="rgba(36,20,12,0.9)" stroke-width="3"/>
    <line x1="-24" y1="2" x2="-70" y2="94" stroke="rgba(36,20,12,0.85)" stroke-width="3"/>
    <line x1="24" y1="2" x2="70" y2="94" stroke="rgba(36,20,12,0.85)" stroke-width="3"/>
  </g>
  <text x="256" y="486" font-size="24" text-anchor="middle" fill="rgba(255,233,183,0.92)" font-family="Trebuchet MS, Segoe UI, sans-serif">${title}</text>
</svg>`;
};

const DEFAULT_MAX_BODY_BYTES = 1024 * 1024;

const REQUEST_ID_HEADER = "x-request-id";

const normalizeRequestIdHeader = (headerValue: string | string[] | undefined): string | undefined => {
  if (typeof headerValue === "string") {
    const normalized = headerValue.trim();
    return normalized.length > 0 ? normalized : undefined;
  }

  if (Array.isArray(headerValue)) {
    const firstValue = headerValue.find((value) => value.trim().length > 0);
    return firstValue?.trim();
  }

  return undefined;
};

const getRequestId = (request: IncomingMessage): string =>
  normalizeRequestIdHeader(request.headers[REQUEST_ID_HEADER]) ?? randomUUID();

const resolvePathname = (rawUrl: string | undefined): string => {
  try {
    return new URL(rawUrl ?? "/", "http://localhost").pathname;
  } catch {
    return "/";
  }
};

const getRouteForPathAndMethod = (
  path: string,
  method: string
): RouteDefinition | undefined => ROUTES.find((route) => route.path === path && route.method === method);

const getAllowedMethodsForPath = (path: string): string[] =>
  ROUTES.filter((route) => route.path === path).map((route) => route.method);

const isJsonContentType = (contentTypeHeader: string | undefined): boolean => {
  if (!contentTypeHeader) {
    return false;
  }

  const [mediaType] = contentTypeHeader.split(";");
  return mediaType.trim().toLowerCase() === JSON_CONTENT_TYPE;
};

const readJsonBody = async (request: IncomingMessage, maxBodyBytes: number): Promise<unknown> => {
  if (!isJsonContentType(request.headers["content-type"])) {
    throw new HttpError(415, "Unsupported media type, expected application/json");
  }

  const chunks: Buffer[] = [];
  let totalBytes = 0;

  for await (const chunk of request) {
    const data = typeof chunk === "string" ? Buffer.from(chunk) : chunk;
    totalBytes += data.length;
    if (totalBytes > maxBodyBytes) {
      throw new HttpError(413, `Request body exceeds ${maxBodyBytes} bytes`);
    }

    chunks.push(data);
  }

  const rawBody = Buffer.concat(chunks).toString("utf8");
  if (!rawBody) {
    return {};
  }

  try {
    return JSON.parse(rawBody);
  } catch {
    throw new HttpError(400, "Invalid JSON body");
  }
};

const sendJson = (
  response: ServerResponse,
  statusCode: number,
  payload: unknown,
  headers: Record<string, string> = {}
): void => {
  response.statusCode = statusCode;
  response.setHeader("content-type", "application/json");
  for (const [key, value] of Object.entries(headers)) {
    response.setHeader(key, value);
  }
  response.end(JSON.stringify(payload));
};

const closeServer = async (server: Server): Promise<void> =>
  new Promise<void>((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });

export const createResolverHttpServer = async (
  options: ServerOptions = {}
): Promise<ResolverHttpServerHandle> => {
  const maxBodyBytes = options.maxBodyBytes ?? DEFAULT_MAX_BODY_BYTES;
  const env = process.env as Record<string, string | undefined>;
  const gateway = createModelGatewayFromEnv(env);

  // Attach the conversational agent WebSocket if enabled.
  const conversationEnabled = env.CONVERSATION_AGENT_ENABLED?.trim().toLowerCase() === "true";

  const server = createServer(async (request, response) => {
    const requestId = getRequestId(request);
    const routeContext: RouteContext = {
      requestId
    };
    response.setHeader(REQUEST_ID_HEADER, requestId);

      const method = request.method ?? "GET";
      const path = resolvePathname(request.url);
      const emitTraceEvent = (stage: string, payload: Record<string, unknown>): void => {
        if (!options.onTraceEvent) {
          return;
        }

      const event = createTraceEvent(routeContext.requestId, stage, payload);
      try {
        options.onTraceEvent(event);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        try {
          process.stderr.write(`[resolver-http] onTraceEvent hook failed: ${message}\n`);
        } catch {
          // Ignore stderr write failures.
        }
      }
    };

      emitTraceEvent("resolver.http.request.start", {
        method,
        path
      });

      try {
        if (method === "GET") {
          const generatedPreviewMatch = path.match(GENERATED_PREVIEW_PATH);
        if (generatedPreviewMatch) {
          const artifactId = generatedPreviewMatch[1] ?? "generated_artifact";
          response.statusCode = 200;
          response.setHeader("content-type", "image/svg+xml; charset=utf-8");
          response.setHeader("cache-control", "no-store");
          response.end(renderGeneratedPreviewSvg(artifactId));
          emitTraceEvent("resolver.http.request.finish", {
            method,
            path,
            statusCode: 200
          });
          return;
        }
      }

      const route = getRouteForPathAndMethod(path, method);
      if (!route) {
        const allowedMethods = getAllowedMethodsForPath(path);
        if (allowedMethods.length > 0) {
          throw new HttpError(405, "Method not allowed", {
            allow: allowedMethods.join(",")
          });
        }

        throw new HttpError(404, "Not found");
      }

      if (route.method === "GET") {
        const viewerAsset = VIEWER_ASSETS[route.path];
        if (!viewerAsset) {
          throw new HttpError(500, `Route handler not implemented: ${route.method} ${route.path}`);
        }

        const content = await readFile(viewerAsset.filePath, "utf8");
        response.statusCode = 200;
        response.setHeader("content-type", viewerAsset.contentType);
        response.end(content);
        emitTraceEvent("resolver.http.request.finish", {
          method,
          path,
          statusCode: 200
        });
        return;
      }

      const scopedReadJsonBody = async (req: IncomingMessage): Promise<unknown> =>
        readJsonBody(req, maxBodyBytes);

      const routeHandler = async (
        req: IncomingMessage
      ): Promise<{ statusCode: number; body: unknown }> => {
        const emitRouteWarning = (warning: unknown): void => {
          emitTraceEvent("resolver.http.route.warning", {
            routePath: route.path,
            warning
          });
        };

        if (route.path === "/v1/stories/analyze") {
          try {
            const input = await scopedReadJsonBody(req);
            const body = await analyzeStory(input as Parameters<typeof analyzeStory>[0], {
              env,
              storyGateway: gateway,
              onWarning: emitRouteWarning
            });
            return { statusCode: 200, body };
          } catch (error) {
            if (error instanceof Error && error.message.startsWith("Invalid analyzeStory input")) {
              throw new HttpError(400, error.message);
            }

            throw error;
          }
        }

        if (route.path === "/v1/character-resolver/resolve") {
          try {
            const input = await scopedReadJsonBody(req);
            const body = await resolveCharacters(input as Parameters<typeof resolveCharacters>[0]);
            return { statusCode: 200, body };
          } catch (error) {
            if (error instanceof Error && error.message.startsWith("Invalid resolveCharacters input")) {
              throw new HttpError(400, error.message);
            }

            throw error;
          }
        }

        if (route.path === "/v1/demo/run") {
          try {
            const input = await scopedReadJsonBody(req);
            const body = await runDemo(input as Parameters<typeof runDemo>[0]);
            return { statusCode: 200, body };
          } catch (error) {
            if (error instanceof Error && error.message.startsWith("Invalid runDemo input")) {
              throw new HttpError(400, error.message);
            }

            throw error;
          }
        }

        if (route.path === "/v1/casting/prepare") {
          try {
            const input = await scopedReadJsonBody(req);
            const body = await prepareCasting(input as Parameters<typeof prepareCasting>[0], {
              env,
              storyGateway: gateway,
              castingGateway: gateway,
              onWarning: emitRouteWarning
            });
            return { statusCode: 200, body };
          } catch (error) {
            if (error instanceof Error && error.message.startsWith("Invalid prepareCasting input")) {
              throw new HttpError(400, error.message);
            }

            throw error;
          }
        }

        if (route.path === "/v1/casting/generate") {
          try {
            const input = await scopedReadJsonBody(req);
            const body = await generateCastingCandidates(
              input as Parameters<typeof generateCastingCandidates>[0]
            );
            return { statusCode: 200, body };
          } catch (error) {
            if (
              error instanceof Error &&
              error.message.startsWith("Invalid generateCastingCandidates input")
            ) {
              throw new HttpError(400, error.message);
            }

            throw error;
          }
        }

        if (route.path === "/v1/casting/approve") {
          try {
            const input = await scopedReadJsonBody(req);
            const body = await approveCasting(input as Parameters<typeof approveCasting>[0]);
            return { statusCode: 200, body };
          } catch (error) {
            if (error instanceof Error && error.message.startsWith("Invalid approveCasting input")) {
              throw new HttpError(400, error.message);
            }

            throw error;
          }
        }

        if (route.path === "/v1/artifacts/generate") {
          try {
            const input = await scopedReadJsonBody(req);
            const body = await generateArtifact(input as Parameters<typeof generateArtifact>[0]);
            return {
              statusCode: 202,
              body
            };
          } catch (error) {
            if (error instanceof Error && error.message.startsWith("Invalid generateArtifact input")) {
              throw new HttpError(400, error.message);
            }

            throw error;
          }
        }

        throw new HttpError(500, `Route handler not implemented: ${route.method} ${route.path}`);
      };

      const result = await routeHandler(request);
      sendJson(response, result.statusCode, result.body);
      emitTraceEvent("resolver.http.request.finish", {
        method,
        path,
        statusCode: result.statusCode
      });
    } catch (error) {
      if (error instanceof HttpError) {
        emitTraceEvent("resolver.http.request.error", {
          method,
          path,
          statusCode: error.statusCode,
          error: error.message
        });
        sendJson(
          response,
          error.statusCode,
          {
            error: error.message
          },
          error.headers
        );
        return;
      }

      emitTraceEvent("resolver.http.request.error", {
        method,
        path,
        statusCode: 500,
        error: "Internal server error"
      });
      sendJson(response, 500, {
        error: "Internal server error"
      });
    }
  });

  await new Promise<void>((resolve, reject) => {
    server.listen(options.port ?? 0, "0.0.0.0", () => resolve());
    server.once("error", reject);
  });

  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("Could not resolve resolver HTTP server address");
  }

  // Wire in the chat WebSocket server on the same HTTP port if enabled.
  let closeChatWs: (() => void) | undefined;
  if (conversationEnabled) {
    const runners = createAgentFromEnv(env);
    const apiKey =
      env.GEMINI_API_KEY ?? env.GOOGLE_GENAI_API_KEY ?? env.GOOGLE_API_KEY;
    closeChatWs = attachChatWebSocketServer(
      server,
      runners?.conversational,
      {
        gcpProject: env.GOOGLE_CLOUD_PROJECT,
        gcpLocation: env.GOOGLE_CLOUD_LOCATION,
        stitchMcpAvailable: env.STITCH_MCP_AVAILABLE?.trim().toLowerCase() === "true",
        apiKey
      },
      runners?.json
    );
  }

  return {
    port: address.port,
    close: async () => {
      closeChatWs?.();
      await closeServer(server);
    }
  };
};
