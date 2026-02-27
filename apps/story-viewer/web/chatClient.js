/**
 * chatClient.js — WebSocket client for the /ws/chat conversation agent.
 *
 * Manages the connection lifecycle and dispatches incoming stream messages
 * to registered handlers. Handles reconnection automatically.
 */

const RECONNECT_DELAY_MS = 2000;
const MAX_RECONNECT_ATTEMPTS = 5;

/**
 * @typedef {'text'|'image'|'audio'|'video'|'stage_command'|'approval_request'|'play_start'|'play_frame'|'error'} StreamMessageType
 */

/**
 * Create a chat WebSocket client that connects to /ws/chat.
 *
 * @param {object} options
 * @param {(message: object) => void} options.onAgentMessage - Called for each agent stream message.
 * @param {(sessionId: string) => void} [options.onSessionStart] - Called when a session is established.
 * @param {() => void} [options.onConnected] - Called when WebSocket opens.
 * @param {() => void} [options.onDisconnected] - Called when WebSocket closes.
 * @returns {{ send: (message: object) => void, disconnect: () => void, isConnected: () => boolean }}
 */
export const createChatClient = (options) => {
  let ws = null;
  let reconnectAttempts = 0;
  let intentionalClose = false;

  const buildWsUrl = () => {
    const protocol = location.protocol === "https:" ? "wss:" : "ws:";
    return `${protocol}//${location.host}/ws/chat`;
  };

  const connect = () => {
    if (intentionalClose) return;

    try {
      ws = new WebSocket(buildWsUrl());
    } catch {
      scheduleReconnect();
      return;
    }

    ws.addEventListener("open", () => {
      reconnectAttempts = 0;
      // Resume existing session if we have one stored.
      const storedSessionId = sessionStorage.getItem("story_ai_session_id");
      if (storedSessionId) {
        ws.send(JSON.stringify({ type: "session_resume", sessionId: storedSessionId }));
      }
      options.onConnected?.();
    });

    ws.addEventListener("message", (event) => {
      try {
        const parsed = JSON.parse(event.data);

        if (parsed.type === "pong") return;

        if (parsed.type === "session_start") {
          // Store session ID for reconnect persistence.
          sessionStorage.setItem("story_ai_session_id", parsed.sessionId);
          options.onSessionStart?.(parsed.sessionId);
          return;
        }

        if (parsed.type === "agent_stream") {
          // Unwrap agent_stream wrapper — forward the payload message.
          options.onAgentMessage(parsed.payload);
        }
      } catch {
        // Ignore malformed messages.
      }
    });

    ws.addEventListener("close", () => {
      options.onDisconnected?.();
      if (!intentionalClose) {
        scheduleReconnect();
      }
    });

    ws.addEventListener("error", () => {
      // Error is followed by close — handled above.
    });
  };

  const scheduleReconnect = () => {
    if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) return;
    reconnectAttempts += 1;
    setTimeout(connect, RECONNECT_DELAY_MS * reconnectAttempts);
  };

  const send = (message) => {
    if (ws?.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(message));
    }
  };

  const disconnect = () => {
    intentionalClose = true;
    ws?.close();
  };

  const isConnected = () => ws?.readyState === WebSocket.OPEN;

  // Start heartbeat to keep connection alive.
  const pingInterval = setInterval(() => {
    if (isConnected()) {
      send({ type: "ping" });
    }
  }, 25000);

  // Clean up interval on page unload.
  window.addEventListener("beforeunload", () => {
    clearInterval(pingInterval);
    disconnect();
  });

  connect();

  return { send, disconnect, isConnected };
};

/**
 * Send a user message through the chat client.
 *
 * @param {{ send: (message: object) => void }} client
 * @param {string} content - The user's text message.
 */
export const sendUserMessage = (client, content) => {
  client.send({ type: "user_message", content });
};

/**
 * Send an approval response through the chat client.
 *
 * @param {{ send: (message: object) => void }} client
 * @param {string} requestId - The approval request ID.
 * @param {string} choice - The user's selected choice.
 */
export const sendApprovalResponse = (client, requestId, choice) => {
  client.send({ type: "approval_response", requestId, choice });
};
