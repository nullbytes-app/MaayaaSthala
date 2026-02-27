import { describe, expect, it } from "vitest";
import { runGateway } from "../src/grpcIngest";

const validBaseEvent = {
  version: "1.0",
  sceneId: "scene_1",
  beat: 0,
  wallTimeMs: 1730001123,
  lane: "puppet",
  opcode: "GESTURE",
  target: {
    artifactId: "hero_raju_v2"
  },
  payload: {
    gesture: "anjali"
  }
};

const sampleEvents = [
  {
    ...validBaseEvent,
    eventId: "evt_1"
  },
  {
    ...validBaseEvent,
    eventId: "evt_bad",
    opcode: "SPEAK",
    payload: {}
  },
  {
    ...validBaseEvent,
    eventId: "evt_2",
    beat: 1
  },
  {
    ...validBaseEvent,
    eventId: "evt_3",
    beat: 2
  }
];

describe("stage command stream gateway", () => {
  it("preserves event ordering and drops invalid commands", async () => {
    const output = await runGateway(sampleEvents);
    expect(output.map((e) => e.eventId)).toEqual(["evt_1", "evt_2", "evt_3"]);
    expect(output.find((e) => e.eventId === "evt_bad")).toBeUndefined();
  });

  it("supports async event sources while preserving order and filtering invalid commands", async () => {
    async function* eventsFromAsyncGenerator() {
      for (const event of sampleEvents) {
        await Promise.resolve();
        yield event;
      }
    }

    const output = await runGateway(eventsFromAsyncGenerator());
    expect(output.map((e) => e.eventId)).toEqual(["evt_1", "evt_2", "evt_3"]);
    expect(output.find((e) => e.eventId === "evt_bad")).toBeUndefined();
  });

  it("emits invalid-command observability through callback and metrics", async () => {
    const droppedEventIds: string[] = [];
    const metrics = {
      processed: 0,
      published: 0,
      dropped: 0,
      droppedEventIds: [] as string[]
    };

    const output = await runGateway(sampleEvents, {
      metrics,
      onInvalid: (_event, details) => {
        if (details.eventId) {
          droppedEventIds.push(details.eventId);
        }
      }
    });

    expect(output.map((event) => event.eventId)).toEqual(["evt_1", "evt_2", "evt_3"]);
    expect(droppedEventIds).toEqual(["evt_bad"]);
    expect(metrics).toEqual({
      processed: 4,
      published: 3,
      dropped: 1,
      droppedEventIds: ["evt_bad"]
    });
  });

  it("throws a clear error for unsupported event sources", async () => {
    await expect(runGateway(null as unknown as Iterable<unknown> & object)).rejects.toThrow(
      "Unsupported event source"
    );
  });
});
