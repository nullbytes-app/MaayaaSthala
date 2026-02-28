import { afterAll, describe, expect, it } from "vitest";
import { execFile } from "node:child_process";
import { once } from "node:events";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import WebSocket from "ws";

import {
  createStageGatewayClient,
  sendStageCommands,
  startNetworkGateway,
  type NetworkGatewayHandle
} from "../src/networkGateway";

const withTimeout = async <T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> =>
  new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`Timed out waiting for ${label}`));
    }, timeoutMs);

    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      }
    );
  });

describe("network stage gateway", () => {
  const handles: NetworkGatewayHandle[] = [];
  const execFileAsync = promisify(execFile);
  const runtimeFixturePath = fileURLToPath(
    new URL("./fixtures/runtime-gateway-check.ts", import.meta.url)
  );

  afterAll(async () => {
    await Promise.all(handles.map((handle) => handle.close()));
  });

  it("starts gateway in tsx runtime without proto-loader import errors", async () => {
    const { stdout } = await execFileAsync(process.execPath, ["--import", "tsx", runtimeFixturePath]);

    expect(stdout).toContain("gateway-started");
  }, 15_000);

  it("ingests gRPC stream and forwards valid commands to websocket with telemetry", async () => {
    const handle = await startNetworkGateway({ grpcPort: 0, wsPort: 0 });
    handles.push(handle);

    const ws = new WebSocket(`ws://127.0.0.1:${handle.wsPort}`);
    const client = createStageGatewayClient(`127.0.0.1:${handle.grpcPort}`);

    try {
      await withTimeout(once(ws, "open"), 2_000, "websocket open");

      const wsMessagePromise = withTimeout(once(ws, "message"), 2_000, "websocket message");
      const ack = await sendStageCommands(client, [
        {
          json: JSON.stringify({
            version: "1.0",
            eventId: "evt_1",
            sceneId: "s1",
            beat: 0,
            lane: "puppet",
            opcode: "GESTURE",
            target: { artifactId: "hero_raju_v2", partId: "right_hand_01" },
            payload: { gesture: "anjali" }
          })
        },
        {
          json: JSON.stringify({
            version: "1.0",
            eventId: "evt_bad",
            sceneId: "s1",
            beat: 1,
            lane: "audio",
            opcode: "SPEAK",
            target: { artifactId: "hero_raju_v2" },
            payload: {}
          })
        }
      ]);

      expect(ack.accepted).toBe(1);
      expect(ack.dropped).toBe(1);

      const [rawMessage] = await wsMessagePromise;
      const message = rawMessage.toString().trim();
      expect(message).toContain('"eventId":"evt_1"');
      expect(message).not.toContain('"eventId":"evt_bad"');

      expect(handle.metrics).toMatchObject({
        processed: 2,
        published: 1,
        dropped: 1,
        droppedEventIds: ["evt_bad"]
      });

      expect(handle.replay("s1")).toHaveLength(1);
      expect(handle.playbill("s1").sceneId).toBe("s1");
      expect(handle.cinemaCapture("s1").highlights.length).toBeGreaterThan(0);
      expect(handle.overlay().headline).toBe("Stage Telemetry");
    } finally {
      ws.close();
      client.close();
    }
  });
});
