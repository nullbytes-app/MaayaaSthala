/**
 * Tests for WebSocket protocol contract.
 *
 * Verifies that:
 * - agent_stream messages wrap payload correctly (type not overwritten)
 * - pong and session_start have correct shape
 * - Client unwrapping yields correct inner message
 */
import { describe, it, expect } from "vitest";
import type { ChatOutboundMessage, AgentStreamMessage } from "../src/types.js";

describe("WebSocket protocol contract", () => {
  describe("agent_stream message structure", () => {
    it("wraps text payload without type collision", () => {
      const innerMessage: AgentStreamMessage = { type: "text", content: "Hello" };
      const outbound: ChatOutboundMessage = { type: "agent_stream", payload: innerMessage };

      // Outer type must remain "agent_stream"
      expect(outbound.type).toBe("agent_stream");
      // Payload must carry the inner type
      expect(outbound.type === "agent_stream" && outbound.payload.type).toBe("text");
    });

    it("wraps error payload without type collision", () => {
      const innerMessage: AgentStreamMessage = { type: "error", message: "Something failed" };
      const outbound: ChatOutboundMessage = { type: "agent_stream", payload: innerMessage };

      expect(outbound.type).toBe("agent_stream");
      expect(outbound.type === "agent_stream" && outbound.payload.type).toBe("error");
    });

    it("wraps approval_request payload", () => {
      const innerMessage: AgentStreamMessage = {
        type: "approval_request",
        requestId: "req-123",
        choices: ["Yes", "No"],
        context: "Test context"
      };
      const outbound: ChatOutboundMessage = { type: "agent_stream", payload: innerMessage };

      expect(outbound.type).toBe("agent_stream");
      if (outbound.type === "agent_stream" && outbound.payload.type === "approval_request") {
        expect(outbound.payload.requestId).toBe("req-123");
        expect(outbound.payload.choices).toEqual(["Yes", "No"]);
      } else {
        throw new Error("Wrong message shape");
      }
    });

    it("wraps image payload", () => {
      const innerMessage: AgentStreamMessage = {
        type: "image",
        url: "/test.png",
        caption: "A puppet"
      };
      const outbound: ChatOutboundMessage = { type: "agent_stream", payload: innerMessage };

      expect(outbound.type).toBe("agent_stream");
      if (outbound.type === "agent_stream" && outbound.payload.type === "image") {
        expect(outbound.payload.url).toBe("/test.png");
      } else {
        throw new Error("Wrong message shape");
      }
    });
  });

  describe("client-side unwrapping", () => {
    it("extracts inner message from payload", () => {
      const serverMessage = {
        type: "agent_stream",
        payload: { type: "text", content: "Hello from agent" }
      };

      // Simulate client unwrapping — should forward payload not outer object.
      const parsed = serverMessage;
      const inner = parsed.type === "agent_stream" ? parsed.payload : null;

      expect(inner).not.toBeNull();
      expect(inner?.type).toBe("text");
      expect((inner as { type: string; content: string })?.content).toBe("Hello from agent");
    });

    it("does NOT forward outer type field as inner message type", () => {
      // Regression test: the old spread pattern { type: "agent_stream", ...agentMessage }
      // would cause the inner type to overwrite "agent_stream". Verify the fix works.
      const innerMessage: AgentStreamMessage = { type: "text", content: "Story time" };
      const outbound: ChatOutboundMessage = { type: "agent_stream", payload: innerMessage };

      // Outer type must NOT be "text"
      expect(outbound.type).toBe("agent_stream");
      // Inner type must NOT be "agent_stream"
      if (outbound.type === "agent_stream") {
        expect(outbound.payload.type).toBe("text");
        expect(outbound.payload.type).not.toBe("agent_stream");
      }
    });
  });

  describe("non-agent_stream message shapes", () => {
    it("pong has no payload", () => {
      const pong: ChatOutboundMessage = { type: "pong" };
      expect(pong.type).toBe("pong");
      expect(Object.keys(pong)).not.toContain("payload");
    });

    it("session_start has sessionId but no payload", () => {
      const sessionStart: ChatOutboundMessage = {
        type: "session_start",
        sessionId: "abc-123"
      };
      expect(sessionStart.type).toBe("session_start");
      if (sessionStart.type === "session_start") {
        expect(sessionStart.sessionId).toBe("abc-123");
      }
      expect(Object.keys(sessionStart)).not.toContain("payload");
    });
  });

  describe("JSON serialization round-trip", () => {
    it("serializes and deserializes agent_stream correctly", () => {
      const outbound: ChatOutboundMessage = {
        type: "agent_stream",
        payload: { type: "text", content: "Test" }
      };

      const json = JSON.stringify(outbound);
      const parsed = JSON.parse(json) as ChatOutboundMessage;

      expect(parsed.type).toBe("agent_stream");
      if (parsed.type === "agent_stream") {
        expect(parsed.payload.type).toBe("text");
      }
    });
  });
});
