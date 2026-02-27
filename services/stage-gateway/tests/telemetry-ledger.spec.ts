import { describe, expect, it } from "vitest";
import { mkdtempSync } from "node:fs";
import { rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { TelemetryLedger } from "../src/telemetryLedger";

describe("telemetry ledger", () => {
  it("replays deterministically by beat/lane/wallTime/eventId", () => {
    const ledger = new TelemetryLedger();

    ledger.recordAccepted({
      version: "1.0",
      eventId: "evt_b",
      sceneId: "s1",
      beat: 2,
      lane: "audio",
      opcode: "SPEAK",
      target: { artifactId: "hero" },
      payload: { text: "line" },
      wallTimeMs: 20
    });

    ledger.recordAccepted({
      version: "1.0",
      eventId: "evt_a",
      sceneId: "s1",
      beat: 1,
      lane: "narration",
      opcode: "NARRATE",
      target: { artifactId: "sutradhar" },
      payload: { text: "start" },
      wallTimeMs: 10
    });

    const replay = ledger.replay("s1");
    expect(replay.map((entry) => entry.eventId)).toEqual(["evt_a", "evt_b"]);
  });

  it("persists accepted and dropped events to a jsonl ledger file", async () => {
    const tempDir = mkdtempSync(join(tmpdir(), "story-ai-ledger-"));
    const ledgerPath = join(tempDir, "stage-ledger.jsonl");

    const writer = new TelemetryLedger({
      persistencePath: ledgerPath
    });

    writer.recordAccepted({
      version: "1.0",
      eventId: "evt_1",
      sceneId: "s1",
      beat: 0,
      lane: "narration",
      opcode: "SCENE_OPEN",
      target: { artifactId: "stage" },
      payload: { rasa: "adbhuta", tala: "adi" }
    });
    writer.recordDropped({ eventId: "evt_bad", sceneId: "s1" }, "schema_validation_failed");

    const reader = new TelemetryLedger({
      persistencePath: ledgerPath
    });

    expect(reader.replay("s1").map((entry) => entry.eventId)).toEqual(["evt_1"]);
    expect(reader.getEntries().some((entry) => entry.status === "dropped")).toBe(true);

    await rm(tempDir, { recursive: true, force: true });
  });
});
