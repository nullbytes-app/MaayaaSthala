export type TraceEvent<TPayload = unknown> = {
  requestId: string;
  stage: string;
  payload: TPayload;
  timestamp: string;
};

export const createTraceEvent = <TPayload>(
  requestId: string,
  stage: string,
  payload: TPayload
): TraceEvent<TPayload> => ({
  requestId,
  stage,
  payload,
  timestamp: new Date().toISOString()
});
