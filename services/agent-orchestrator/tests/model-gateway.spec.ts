import { describe, expect, it } from "vitest";

import {
  buildPromptForAttempt,
  createModelGatewayFromEnv,
  getModelEventError,
  parseJsonResponse,
  shouldRetryModelGatewayError
} from "../src/adk/modelGateway";

describe("model gateway", () => {
  it("parses plain JSON responses", () => {
    const parsed = parseJsonResponse('{"storyId":"s1"}');
    expect(parsed).toEqual({ storyId: "s1" });
  });

  it("parses fenced JSON responses", () => {
    const parsed = parseJsonResponse("```json\n{\"storyId\":\"s1\"}\n```");
    expect(parsed).toEqual({ storyId: "s1" });
  });

  it("parses unlabeled fenced JSON responses", () => {
    const parsed = parseJsonResponse("```\n{\"storyId\":\"s1\"}\n```");
    expect(parsed).toEqual({ storyId: "s1" });
  });

  it("parses fenced JSON surrounded by prose", () => {
    const parsed = parseJsonResponse(
      "Here is the result:\n```json\n{\"storyId\":\"s1\"}\n```\nThanks.",
    );
    expect(parsed).toEqual({ storyId: "s1" });
  });

  it("throws contextual error for invalid input", () => {
    expect(() => parseJsonResponse("not json")).toThrowError(
      /^Invalid model JSON response:/,
    );
  });

  it("returns undefined when gateway env is not configured", () => {
    const gateway = createModelGatewayFromEnv({
      AGENTIC_MODEL: "",
      GEMINI_API_KEY: "",
      GOOGLE_GENAI_API_KEY: "",
      GOOGLE_GENAI_USE_VERTEXAI: "false",
      GOOGLE_CLOUD_PROJECT: "",
      GOOGLE_CLOUD_LOCATION: ""
    });

    expect(gateway).toBeUndefined();
  });

  it("returns a concrete gateway when Gemini API key is configured", () => {
    const gateway = createModelGatewayFromEnv({
      AGENTIC_MODEL: "gemini-2.5-flash",
      GEMINI_API_KEY: "test-key"
    });

    expect(gateway).toBeDefined();
    expect(typeof gateway?.runJsonPrompt).toBe("function");
  });

  it("returns a concrete gateway when Vertex config is enabled", () => {
    const gateway = createModelGatewayFromEnv({
      AGENTIC_MODEL: "gemini-2.5-flash",
      GOOGLE_GENAI_USE_VERTEXAI: "true",
      GOOGLE_CLOUD_PROJECT: "story-ai-project",
      GOOGLE_CLOUD_LOCATION: "us-central1"
    });

    expect(gateway).toBeDefined();
    expect(typeof gateway?.runJsonPrompt).toBe("function");
  });

  it("extracts model error details from ADK events", () => {
    const message = getModelEventError({
      errorCode: "403",
      errorMessage: "Vertex AI API is disabled"
    });

    expect(message).toContain("403");
    expect(message).toContain("Vertex AI API is disabled");
  });

  it("returns undefined for non-error ADK events", () => {
    const message = getModelEventError({
      author: "story_json_gateway",
      actions: {}
    });

    expect(message).toBeUndefined();
  });

  it("marks malformed JSON parse failures as retryable", () => {
    expect(
      shouldRetryModelGatewayError(new Error("Invalid model JSON response: {oops"))
    ).toBe(true);
  });

  it("marks transient model errors as retryable", () => {
    expect(shouldRetryModelGatewayError(new Error("Model returned error 503: unavailable"))).toBe(
      true
    );
  });

  it("does not retry validation errors", () => {
    expect(shouldRetryModelGatewayError(new Error("Model returned error 401: unauthorized"))).toBe(
      false
    );
  });

  it("returns original prompt on first attempt", () => {
    const prompt = "Return JSON";
    expect(buildPromptForAttempt(prompt, 1)).toBe(prompt);
  });

  it("adds strict retry instructions after first attempt", () => {
    const prompt = "Return JSON";
    const retried = buildPromptForAttempt(prompt, 2);

    expect(retried).toContain(prompt);
    expect(retried).toContain("IMPORTANT RETRY INSTRUCTION");
    expect(retried).toContain("Do not use markdown code fences.");
  });
});
