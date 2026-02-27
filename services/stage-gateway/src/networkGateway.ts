import { fileURLToPath } from "node:url";
import { createServer, type Server as HttpServer } from "node:http";
import type { AddressInfo } from "node:net";
import { once } from "node:events";
import * as grpc from "@grpc/grpc-js";
import type { ClientWritableStream } from "@grpc/grpc-js";
import * as protoLoader from "@grpc/proto-loader";
import WebSocket, { WebSocketServer } from "ws";

import { isStageCommandV1, type StageCommand } from "./validator";
import {
  TelemetryLedger,
  type CinemaCapture,
  type Playbill,
  type TelemetryOverlay
} from "./telemetryLedger";
import type { GatewayMetrics } from "./grpcIngest";

const PROTO_PATH = fileURLToPath(new URL("../proto/stage_gateway.proto", import.meta.url));

type StageCommandEnvelope = {
  json: string;
};

type IngestAck = {
  accepted: number;
  dropped: number;
};

type StageGatewayClient = grpc.Client & {
  StreamStageCommands: (
    callback: (error: grpc.ServiceError | null, response: IngestAck) => void
  ) => ClientWritableStream<StageCommandEnvelope>;
};

type StageGatewayServiceDefinition = {
  service: grpc.ServiceDefinition;
  new (address: string, credentials: grpc.ChannelCredentials): StageGatewayClient;
};

type StageGatewayPackage = {
  stagegateway: {
    StageGateway: StageGatewayServiceDefinition;
  };
};

type StartGatewayOptions = {
  grpcPort?: number;
  wsPort?: number;
  ledgerPath?: string;
  ledgerMaxEntries?: number;
};

export type NetworkGatewayHandle = {
  grpcPort: number;
  wsPort: number;
  metrics: GatewayMetrics;
  replay: (sceneId?: string) => StageCommand[];
  playbill: (sceneId: string) => Playbill;
  cinemaCapture: (sceneId: string) => CinemaCapture;
  overlay: () => TelemetryOverlay;
  close: () => Promise<void>;
};

const loadStageGatewayPackage = (): StageGatewayPackage => {
  const packageDefinition = protoLoader.loadSync(PROTO_PATH, {
    keepCase: false,
    longs: String,
    enums: String,
    defaults: true,
    oneofs: true
  });

  return grpc.loadPackageDefinition(packageDefinition) as unknown as StageGatewayPackage;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object";

const extractEventId = (value: unknown): string | undefined => {
  if (!isRecord(value)) {
    return undefined;
  }

  const eventId = value.eventId;
  return typeof eventId === "string" && eventId.length > 0 ? eventId : undefined;
};

const createMetrics = (): GatewayMetrics => ({
  processed: 0,
  published: 0,
  dropped: 0,
  droppedEventIds: []
});

const listenHttp = async (server: HttpServer, port: number): Promise<number> => {
  server.listen(port, "127.0.0.1");
  await once(server, "listening");
  const address = server.address() as AddressInfo;
  return address.port;
};

const closeHttp = async (server: HttpServer): Promise<void> => {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });
};

const bindGrpc = async (server: grpc.Server, port: number): Promise<number> =>
  new Promise<number>((resolve, reject) => {
    server.bindAsync(
      `127.0.0.1:${port}`,
      grpc.ServerCredentials.createInsecure(),
      (error, boundPort) => {
        if (error) {
          reject(error);
          return;
        }

        resolve(boundPort);
      }
    );
  });

const shutdownGrpc = async (server: grpc.Server): Promise<void> =>
  new Promise<void>((resolve, reject) => {
    server.tryShutdown((error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });

export const startNetworkGateway = async (
  options: StartGatewayOptions = {}
): Promise<NetworkGatewayHandle> => {
  const metrics = createMetrics();
  const ledger = new TelemetryLedger({
    persistencePath: options.ledgerPath,
    maxEntries: options.ledgerMaxEntries
  });

  const wsHttpServer = createServer();
  const wsServer = new WebSocketServer({ server: wsHttpServer });
  const wsClients = new Set<WebSocket>();
  let wsListening = false;
  let grpcServer: grpc.Server | undefined;

  try {
    wsServer.on("connection", (socket) => {
      wsClients.add(socket);
      socket.on("close", () => wsClients.delete(socket));
    });

    const wsPort = await listenHttp(wsHttpServer, options.wsPort ?? 0);
    wsListening = true;

    const stageGatewayPackage = loadStageGatewayPackage();
    grpcServer = new grpc.Server();

    grpcServer.addService(stageGatewayPackage.stagegateway.StageGateway.service, {
      StreamStageCommands: (
        call: grpc.ServerReadableStream<StageCommandEnvelope, IngestAck>,
        callback: grpc.sendUnaryData<IngestAck>
      ) => {
        let accepted = 0;
        let dropped = 0;
        let completed = false;

        const toServiceError = (error: Error): grpc.ServiceError => {
          const serviceError = error as grpc.ServiceError;
          if (typeof serviceError.code !== "number") {
            serviceError.code = grpc.status.UNKNOWN;
          }
          if (typeof serviceError.details !== "string") {
            serviceError.details = error.message;
          }
          if (!serviceError.metadata) {
            serviceError.metadata = new grpc.Metadata();
          }
          return serviceError;
        };

        const finish = (error: grpc.ServiceError | Error | null = null): void => {
          if (completed) {
            return;
          }

          completed = true;
          callback(error ? toServiceError(error) : null, {
            accepted,
            dropped
          });
        };

        call.on("data", (message: StageCommandEnvelope) => {
          metrics.processed += 1;

          let parsed: unknown;
          try {
            parsed = JSON.parse(message.json);
          } catch {
            parsed = { eventId: undefined };
          }

          if (!isStageCommandV1(parsed)) {
            dropped += 1;
            metrics.dropped += 1;
            const eventId = extractEventId(parsed);
            if (eventId) {
              metrics.droppedEventIds.push(eventId);
            }
            ledger.recordDropped(parsed, "schema_validation_failed");
            return;
          }

          accepted += 1;
          metrics.published += 1;
          ledger.recordAccepted(parsed);

          const frame = `${JSON.stringify(parsed)}\n`;
          for (const client of wsClients) {
            if (client.readyState === WebSocket.OPEN) {
              client.send(frame);
            }
          }
        });

        call.on("end", () => {
          finish(null);
        });

        call.on("error", (error) => {
          finish(error);
        });
      }
    });

    const grpcPort = await bindGrpc(grpcServer, options.grpcPort ?? 0);

    return {
      grpcPort,
      wsPort,
      metrics,
      replay: (sceneId?: string) => ledger.replay(sceneId),
      playbill: (sceneId: string) => ledger.playbill(sceneId),
      cinemaCapture: (sceneId: string) => ledger.cinemaCapture(sceneId),
      overlay: () => ledger.overlay(metrics),
      close: async () => {
        for (const client of wsClients) {
          client.close();
        }

        wsServer.close();
        if (wsListening) {
          await closeHttp(wsHttpServer);
        }
        if (grpcServer) {
          await shutdownGrpc(grpcServer);
        }
      }
    };
  } catch (error) {
    for (const client of wsClients) {
      client.close();
    }

    wsServer.close();
    if (wsListening) {
      await closeHttp(wsHttpServer).catch(() => undefined);
    }
    if (grpcServer) {
      await shutdownGrpc(grpcServer).catch(() => undefined);
    }

    throw error;
  }
};

export const createStageGatewayClient = (address: string): StageGatewayClient => {
  const stageGatewayPackage = loadStageGatewayPackage();
  return new stageGatewayPackage.stagegateway.StageGateway(
    address,
    grpc.credentials.createInsecure()
  );
};

export const sendStageCommands = async (
  client: StageGatewayClient,
  commands: StageCommandEnvelope[]
): Promise<IngestAck> =>
  new Promise<IngestAck>((resolve, reject) => {
    const stream = client.StreamStageCommands((error, response) => {
      if (error) {
        reject(error);
        return;
      }

      resolve(response);
    });

    for (const command of commands) {
      stream.write(command);
    }
    stream.end();
  });
