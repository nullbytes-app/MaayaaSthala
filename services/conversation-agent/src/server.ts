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
  apiKey?: string;
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
  config: ChatServerConfig = {},
  jsonRunner?: InMemoryRunner
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
      // Serialize per session: chain each turn onto session.activeTurn so concurrent
      // WebSocket messages execute sequentially and don't corrupt approval state.
      if (message.type === "user_message") {
        const onMessage = (agentMessage: AgentStreamMessage): void => {
          sendToClient(socket, {
            type: "agent_stream",
            payload: agentMessage
          });
        };

        const content = message.content;

        // Preemption: if the user sends a new message while approvals are pending,
        // cancel those approvals synchronously now — before chaining onto the queue.
        // Reason: approval_response bypasses the queue (handled immediately above),
        // but user_message is queued. Without this, a story-interrupt user_message
        // can never unblock a turn that is blocked on addPendingApproval.
        // We cancel eagerly on any user_message with pending approvals, because:
        // (a) approval choices are sent via approval_response, not user_message, so
        //     a user_message while an approval is pending almost always means the user
        //     is trying to move on, and (b) the queued turn will re-evaluate intent.
        if (session.pendingApprovals.size > 0) {
          for (const approval of session.pendingApprovals.values()) {
            approval.reject("Interrupted by new user message");
          }
          session.pendingApprovals.clear();
        }

        session.activeTurn = session.activeTurn
          .catch(() => { /* swallow errors from previous turn so chain continues */ })
          .then(async () => {
            try {
              if (runner) {
                await handleConversationTurn(
                  content,
                  session,
                  runner,
                  onMessage,
                  {
                    gcpProject: config.gcpProject,
                    gcpLocation: config.gcpLocation,
                    stitchMcpAvailable: config.stitchMcpAvailable,
                    apiKey: config.apiKey
                  },
                  jsonRunner
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
              // Silently discard expected interruption — user already sent a new message
              // that cancelled this turn's pending approval. No user-visible error needed.
              if (errorMessage === "Interrupted by new user message") return;
              onMessage({ type: "error", message: `Agent error: ${errorMessage}` });
            }
          });
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
