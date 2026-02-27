import { isStageCommandV1, type StageCommand } from "./validator";
import { InProcessWsPublisher } from "./wsPublisher";

export type GatewayMetrics = {
  processed: number;
  published: number;
  dropped: number;
  droppedEventIds: string[];
};

export type GatewayOptions = {
  metrics?: GatewayMetrics;
  onInvalid?: (event: unknown, details: { reason: "schema_validation_failed"; eventId?: string }) => void;
};

const createGatewayMetrics = (): GatewayMetrics => ({
  processed: 0,
  published: 0,
  dropped: 0,
  droppedEventIds: []
});

const extractEventId = (event: unknown): string | undefined => {
  if (event === null || typeof event !== "object") {
    return undefined;
  }

  const eventId = (event as Record<string, unknown>).eventId;
  return typeof eventId === "string" && eventId.length > 0 ? eventId : undefined;
};

async function* toAsyncIterable(events: (Iterable<unknown> | AsyncIterable<unknown>) & object): AsyncGenerator<unknown> {
  if (events === null || typeof events !== "object") {
    throw new TypeError("Unsupported event source: expected Iterable or AsyncIterable");
  }

  if (Symbol.asyncIterator in events) {
    for await (const event of events as AsyncIterable<unknown>) {
      yield event;
    }
    return;
  }

  if (Symbol.iterator in events) {
    for (const event of events as Iterable<unknown>) {
      yield event;
    }
    return;
  }

  throw new TypeError("Unsupported event source: expected Iterable or AsyncIterable");
}

export async function runGateway(
  source: (Iterable<unknown> | AsyncIterable<unknown>) & object,
  options: GatewayOptions = {}
): Promise<StageCommand[]> {
  const publisher = new InProcessWsPublisher();
  const metrics = options.metrics ?? createGatewayMetrics();

  for await (const event of toAsyncIterable(source)) {
    metrics.processed += 1;

    if (!isStageCommandV1(event)) {
      metrics.dropped += 1;
      const eventId = extractEventId(event);
      if (eventId) {
        metrics.droppedEventIds.push(eventId);
      }
      options.onInvalid?.(event, {
        reason: "schema_validation_failed",
        eventId
      });
      continue;
    }

    publisher.publish(event);
    metrics.published += 1;
  }

  return publisher.readPublishedCommands();
}
