import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname } from "node:path";

import type { StageCommand } from "./validator";

type LedgerStatus = "accepted" | "dropped";

export type LedgerEntry = {
  arrivalOrder: number;
  timestampMs: number;
  status: LedgerStatus;
  eventId?: string;
  sceneId?: string;
  lane?: string;
  opcode?: string;
  reason?: string;
  command?: StageCommand;
};

type TelemetryLedgerOptions = {
  persistencePath?: string;
  maxEntries?: number;
};

export type Playbill = {
  sceneId: string;
  cast: string[];
  opcodes: string[];
  beats: {
    start: number;
    end: number;
  };
};

export type CinemaCapture = {
  sceneId: string;
  highlights: Array<{
    eventId: string;
    beat: number;
    label: string;
  }>;
};

export type TelemetryOverlay = {
  headline: string;
  lines: string[];
};

type OverlayMetrics = {
  processed: number;
  published: number;
  dropped: number;
  droppedEventIds: string[];
};

const lanePriority: Record<string, number> = {
  narration: 0,
  puppet: 1,
  audio: 2,
  control: 3
};

const getLanePriority = (lane: string | undefined): number => lanePriority[lane ?? ""] ?? 99;

const getEventId = (value: unknown): string | undefined => {
  if (value === null || typeof value !== "object") {
    return undefined;
  }

  const eventId = (value as Record<string, unknown>).eventId;
  return typeof eventId === "string" && eventId.length > 0 ? eventId : undefined;
};

const getSceneId = (value: unknown): string | undefined => {
  if (value === null || typeof value !== "object") {
    return undefined;
  }

  const sceneId = (value as Record<string, unknown>).sceneId;
  return typeof sceneId === "string" && sceneId.length > 0 ? sceneId : undefined;
};

const compareCommands = (
  left: { command: StageCommand; arrivalOrder: number },
  right: { command: StageCommand; arrivalOrder: number }
): number => {
  const sceneCompare = left.command.sceneId.localeCompare(right.command.sceneId);
  if (sceneCompare !== 0) {
    return sceneCompare;
  }

  if (left.command.beat !== right.command.beat) {
    return left.command.beat - right.command.beat;
  }

  const laneCompare = getLanePriority(left.command.lane) - getLanePriority(right.command.lane);
  if (laneCompare !== 0) {
    return laneCompare;
  }

  const wallTimeCompare = (left.command.wallTimeMs ?? 0) - (right.command.wallTimeMs ?? 0);
  if (wallTimeCompare !== 0) {
    return wallTimeCompare;
  }

  const eventCompare = left.command.eventId.localeCompare(right.command.eventId);
  if (eventCompare !== 0) {
    return eventCompare;
  }

  return left.arrivalOrder - right.arrivalOrder;
};

export class TelemetryLedger {
  private readonly entries: LedgerEntry[] = [];

  private readonly persistencePath?: string;

  private readonly maxEntries: number;

  private arrivalCounter = 0;

  constructor(options: TelemetryLedgerOptions = {}) {
    this.persistencePath = options.persistencePath;
    this.maxEntries = options.maxEntries ?? 2000;

    if (this.persistencePath && existsSync(this.persistencePath)) {
      this.loadFromDisk(this.persistencePath);
    }
  }

  private loadFromDisk(filePath: string): void {
    const raw = readFileSync(filePath, "utf8");
    for (const line of raw.split("\n").filter(Boolean)) {
      const parsed = JSON.parse(line) as LedgerEntry;
      this.entries.push(parsed);
      this.arrivalCounter = Math.max(this.arrivalCounter, parsed.arrivalOrder + 1);
    }
  }

  private persist(entry: LedgerEntry): void {
    if (!this.persistencePath) {
      return;
    }

    mkdirSync(dirname(this.persistencePath), { recursive: true });
    appendFileSync(this.persistencePath, `${JSON.stringify(entry)}\n`, "utf8");
  }

  private enforceRetention(): void {
    if (this.entries.length <= this.maxEntries) {
      return;
    }

    const overflow = this.entries.length - this.maxEntries;
    this.entries.splice(0, overflow);
  }

  private nextArrivalOrder(): number {
    const current = this.arrivalCounter;
    this.arrivalCounter += 1;
    return current;
  }

  recordAccepted(command: StageCommand): void {
    const entry: LedgerEntry = {
      arrivalOrder: this.nextArrivalOrder(),
      timestampMs: Date.now(),
      status: "accepted",
      eventId: command.eventId,
      sceneId: command.sceneId,
      lane: command.lane,
      opcode: command.opcode,
      command
    };

    this.entries.push(entry);
    this.enforceRetention();
    this.persist(entry);
  }

  recordDropped(event: unknown, reason: string): void {
    const entry: LedgerEntry = {
      arrivalOrder: this.nextArrivalOrder(),
      timestampMs: Date.now(),
      status: "dropped",
      eventId: getEventId(event),
      sceneId: getSceneId(event),
      reason
    };

    this.entries.push(entry);
    this.enforceRetention();
    this.persist(entry);
  }

  getEntries(): LedgerEntry[] {
    return [...this.entries];
  }

  replay(sceneId?: string): StageCommand[] {
    return this.entries
      .filter((entry) => entry.status === "accepted")
      .filter((entry) => (sceneId ? entry.sceneId === sceneId : true))
      .map((entry) => ({
        command: entry.command,
        arrivalOrder: entry.arrivalOrder
      }))
      .filter((entry): entry is { command: StageCommand; arrivalOrder: number } => Boolean(entry.command))
      .sort(compareCommands)
      .map((entry) => entry.command);
  }

  playbill(sceneId: string): Playbill {
    const commands = this.replay(sceneId);
    const beats = commands.map((command) => command.beat);

    return {
      sceneId,
      cast: Array.from(new Set(commands.map((command) => command.target.artifactId))),
      opcodes: Array.from(new Set(commands.map((command) => command.opcode))),
      beats: {
        start: beats.length > 0 ? Math.min(...beats) : 0,
        end: beats.length > 0 ? Math.max(...beats) : 0
      }
    };
  }

  cinemaCapture(sceneId: string): CinemaCapture {
    const commands = this.replay(sceneId);
    const highlights = commands
      .filter(
        (command) =>
          command.opcode === "SCENE_OPEN" ||
          command.opcode === "GESTURE" ||
          command.opcode === "BARGE_IN" ||
          command.opcode === "SCENE_CLOSE"
      )
      .map((command) => ({
        eventId: command.eventId,
        beat: command.beat,
        label: `${command.opcode} @ beat ${command.beat}`
      }));

    return {
      sceneId,
      highlights
    };
  }

  overlay(metrics: OverlayMetrics): TelemetryOverlay {
    return {
      headline: "Stage Telemetry",
      lines: [
        `Processed: ${metrics.processed}`,
        `Published: ${metrics.published}`,
        `Dropped: ${metrics.dropped}`,
        `Dropped IDs: ${metrics.droppedEventIds.join(",") || "none"}`,
        `Ledger Entries: ${this.entries.length}`
      ]
    };
  }
}
