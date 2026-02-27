import type { StageCommand } from "./validator";

export class InProcessWsPublisher {
  private readonly frames: string[] = [];

  publish(command: StageCommand): void {
    this.frames.push(`${JSON.stringify(command)}\n`);
  }

  readPublishedCommands(): StageCommand[] {
    return this.frames.map((frame) => JSON.parse(frame) as StageCommand);
  }
}
