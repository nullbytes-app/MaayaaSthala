import type { Server as HttpServer, IncomingMessage } from "node:http";
import { randomUUID } from "node:crypto";
import WebSocket, { WebSocketServer } from "ws";
import type { InMemoryRunner } from "@google/adk";
import { sessionStore } from "./sessionStore.js";
import { handleConversationTurn } from "./agent.js";
import type { ChatInboundMessage, ChatOutboundMessage, AgentStreamMessage } from "./types.js";

type ChatServerConfig = {
  gcpProject?: string;
  gcpLocation?: string;
  stitchMcpAvailable?: boolean;
};

/**
 * Safely parse a WebSocket message as a ChatInboundMessage.
 *
 * @param data - Raw WebSocket message data.
 * @returns Parsed message or null if invalid.
 */
const parseInboundMessage = (data: WebSocket.RawData): ChatInboundMessage | null => {
  try {
    const text = data.toString("utf8");
    const parsed = JSON.parse(text);

    if (!parsed || typeof parsed !== "object" || typeof parsed.type !== "string") {
      return null;
    }

    const type = parsed.type as string;

    if (type === "user_message" && typeof parsed.content === "string") {
      return { type: "user_message", content: parsed.content };
    }

    if (
      type === "approval_response" &&
      typeof parsed.requestId === "string" &&
      typeof parsed.choice === "string"
    ) {
      return { type: "approval_response", requestId: parsed.requestId, choice: parsed.choice };
    }

    if (type === "ping") {
      return { type: "ping" };
    }

    return null;
  } catch {
    return null;
  }
};

/**
 * Send a JSON message to a WebSocket client.
 * Silently ignores closed/errored sockets.
 */
const sendToClient = (socket: WebSocket, message: ChatOutboundMessage): void => {
  if (socket.readyState !== WebSocket.OPEN) {
    return;
  }

  try {
    socket.send(JSON.stringify(message));
  } catch {
    // Ignore send errors — client may have disconnected.
  }
};

/**
 * Attach the WebSocket chat server to an existing HTTP server.
 *
 * Creates a WebSocketServer at the `/ws/chat` path.
 * Each connection gets a conversation session (persistent per userId header or cookie).
 *
 * @param httpServer - Existing Node HTTP server to attach to.
 * @param runner - ADK InMemoryRunner for conversation (undefined = no AI, text-only echo).
 * @param config - Agent configuration for GCP services.
 * @returns Cleanup function to close the WebSocket server.
 */
export const attachChatWebSocketServer = (
  httpServer: HttpServer,
  runner: InMemoryRunner | undefined,
  config: ChatServerConfig = {}
): (() => void) => {
  const wss = new WebSocketServer({ noServer: true });

  // Handle WebSocket upgrade requests at /ws/chat.
  httpServer.on("upgrade", (request: IncomingMessage, socket, head) => {
    const url = new URL(request.url ?? "/", "http://localhost");

    if (url.pathname !== "/ws/chat") {
      socket.destroy();
      return;
    }

    wss.handleUpgrade(request, socket, head, (ws) => {
      wss.emit("connection", ws, request);
    });
  });

  wss.on("connection", (socket: WebSocket, request: IncomingMessage) => {
    // Each connection gets its own unique userId. The client stores the sessionId
    // in sessionStorage and sends a session_resume message on reconnect.
    const userId = `u_${randomUUID()}`;
    let session = sessionStore.create(userId);

    // Send session start — client should store this ID for reconnect.
    sendToClient(socket, { type: "session_start", sessionId: session.sessionId });

    socket.on("message", async (data: WebSocket.RawData) => {
      const message = parseInboundMessage(data);

      // Handle session_resume before any other processing.
      if (!message) {
        // Check for session_resume which may not match ChatInboundMessage schema.
        try {
          const raw = JSON.parse(data.toString("utf8"));
          if (raw?.type === "session_resume" && typeof raw.sessionId === "string") {
            const existing = sessionStore.get(raw.sessionId);
            if (existing) {
              session = existing;
              // Confirm resumed session — client updates its stored ID to the old one,
              // preventing ID drift across reconnects.
              sendToClient(socket, { type: "session_start", sessionId: session.sessionId });
            }
            return;
          }
        } catch { /* fall through */ }
      }

      if (!message) {
        sendToClient(socket, {
          type: "agent_stream",
          payload: { type: "error", message: "Invalid message format" }
        });
        return;
      }

      if (message.type === "ping") {
        sendToClient(socket, { type: "pong" });
        return;
      }

      if (message.type === "approval_response") {
        const resolved = sessionStore.resolveApproval(
          session.sessionId,
          message.requestId,
          message.choice
        );

        if (!resolved) {
          sendToClient(socket, {
            type: "agent_stream",
            payload: { type: "error", message: `No pending approval for requestId: ${message.requestId}` }
          });
        }

        return;
      }

      // Process user_message through the conversation agent.
      if (message.type === "user_message") {
        const onMessage = (agentMessage: AgentStreamMessage): void => {
          sendToClient(socket, {
            type: "agent_stream",
            payload: agentMessage
          });
        };

        try {
          if (runner) {
            await handleConversationTurn(
              message.content,
              session,
              runner,
              onMessage,
              {
                gcpProject: config.gcpProject,
                gcpLocation: config.gcpLocation,
                stitchMcpAvailable: config.stitchMcpAvailable
              }
            );
          } else {
            // No runner configured — echo back with guidance.
            onMessage({
              type: "text",
              content:
                "Story AI is running without an AI model. " +
                "Set GEMINI_API_KEY or configure Vertex AI to enable storytelling."
            });
          }
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          onMessage({ type: "error", message: `Agent error: ${errorMessage}` });
        }
      }
    });

    socket.on("close", () => {
      // Session persists across reconnections — only purge after TTL expires.
    });

    socket.on("error", () => {
      // Silently handle socket errors to prevent server crash.
    });
  });

  return () => {
    wss.close();
  };
};
