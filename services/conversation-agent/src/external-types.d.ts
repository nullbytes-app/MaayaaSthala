/**
 * Minimal type stubs for optional and peer dependencies.
 * These resolve TypeScript module errors when packages are not directly installed.
 */

// @google/genai is a peer dependency of @google/adk — stub the Schema type used in adkTools.ts.
declare module "@google/genai" {
  export type Schema = {
    type?: string;
    format?: string;
    description?: string;
    nullable?: boolean;
    enum?: string[];
    items?: Schema;
    properties?: Record<string, Schema>;
    required?: string[];
    anyOf?: Schema[];
  };
  // Allow other exports to resolve without error.
  export type FunctionDeclaration = unknown;
  export type Part = unknown;
  export type Content = unknown;
}

/**
 * Minimal type stubs for optional GCP cloud SDK dependencies.
 * Using 'any' throughout so TypeScript compiles regardless of
 * which properties the actual SDK uses internally.
 * Real types are available when packages are installed via optionalDependencies.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
declare module "@google-cloud/aiplatform" {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  export class PredictionServiceClient {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    constructor(options?: Record<string, any>);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    predict(request: Record<string, any>): Promise<[{ predictions?: any[] }]>;
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
declare module "@google-cloud/text-to-speech" {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  export class TextToSpeechClient {
    constructor();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    synthesizeSpeech(request: Record<string, any>): Promise<[{ audioContent: Buffer | string }]>;
  }
}
