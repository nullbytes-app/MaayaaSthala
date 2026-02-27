const isStageCommandLike = (value) => {
  if (value === null || typeof value !== "object") {
    return false;
  }

  return (
    typeof value.opcode === "string" &&
    typeof value.beat === "number" &&
    value.target !== null &&
    typeof value.target === "object" &&
    typeof value.target.artifactId === "string"
  );
};

export const parseWsFrame = (frame) => {
  if (typeof frame !== "string") {
    return null;
  }

  const lines = frame
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  for (const line of lines) {
    try {
      const parsed = JSON.parse(line);
      if (isStageCommandLike(parsed)) {
        return parsed;
      }
    } catch {
      // ignore malformed line and continue
    }
  }

  return null;
};

export const createLiveAdapter = () => {
  let socket = null;
  let timerId = null;

  const stop = () => {
    if (timerId !== null) {
      clearInterval(timerId);
      timerId = null;
    }
  };

  const disconnect = () => {
    stop();
    if (socket) {
      socket.close();
      socket = null;
    }
  };

  return {
    connect: (url, onCommand, onStatus) => {
      disconnect();

      if (typeof WebSocket === "undefined") {
        onStatus?.("WebSocket API is unavailable in this environment.");
        return;
      }

      socket = new WebSocket(url);
      socket.onopen = () => onStatus?.(`Connected to ${url}`);
      socket.onerror = () => onStatus?.(`Failed to connect to ${url}`);
      socket.onclose = () => onStatus?.("Live stream disconnected.");
      socket.onmessage = (event) => {
        const frameText = typeof event.data === "string" ? event.data : String(event.data);
        const command = parseWsFrame(frameText);
        if (command) {
          onCommand?.(command);
        }
      };
    },
    disconnect,
    stop,
    playFromCommands: (commands, onCommand, onDone, intervalMs = 500) => {
      stop();

      if (!Array.isArray(commands) || commands.length === 0) {
        onDone?.();
        return;
      }

      let index = 0;
      timerId = setInterval(() => {
        if (index >= commands.length) {
          stop();
          onDone?.();
          return;
        }

        const command = commands[index];
        index += 1;
        onCommand?.(command, index, commands.length);
      }, intervalMs);
    }
  };
};
