import {
  buildApprovePayload,
  initialCastingState,
  reduceCastingState,
  requestApproveCasting,
  requestCastingPrepare,
  requestGenerateCandidates
} from "./castingStudio.js";
import {
  buildRunDemoPayload,
  defaultStoryDraft,
  normalizeStoryDraft
} from "./storyDraft.js";
import { buildArtifactVisualMap } from "./artifactVisuals.js";
import { buildReplayFrames } from "./replayAdapter.js";
import { createStageRenderer } from "./stageRenderer.js";
import { createLiveAdapter } from "./liveAdapter.js";
import { createChatClient, sendUserMessage, sendApprovalResponse } from "./chatClient.js";
import { createChatPanel } from "./chatPanel.js";

// ===== Tab switching =====
const tabChat = document.getElementById("tab-chat");
const tabStudio = document.getElementById("tab-studio");
const mainLayout = document.getElementById("main-layout");
const studioLayout = document.getElementById("studio-layout");

tabChat?.addEventListener("click", () => {
  mainLayout?.classList.remove("hidden");
  studioLayout?.classList.add("hidden");
  tabChat.classList.add("tab-btn--active");
  tabStudio?.classList.remove("tab-btn--active");
});

tabStudio?.addEventListener("click", () => {
  mainLayout?.classList.add("hidden");
  studioLayout?.classList.remove("hidden");
  tabStudio.classList.add("tab-btn--active");
  tabChat?.classList.remove("tab-btn--active");
});

// ===== Chat panel init =====
const chatMessagesEl = document.getElementById("chat-messages");
const chatForm = document.getElementById("chat-form");
const chatInput = document.getElementById("chat-input");
const statusDot = document.getElementById("status-dot");
const statusLabel = document.getElementById("status-label");

const chatCanvas = document.getElementById("stage-canvas");
const chatRenderer = chatCanvas ? createStageRenderer(chatCanvas) : null;
const chatLiveAdapter = createLiveAdapter();

const setConnectionStatus = (state) => {
  const dot = statusDot;
  const label = statusLabel;
  if (!dot || !label) return;
  dot.className = `status-dot status-dot--${state}`;
  label.textContent = state === "connected" ? "Connected" : state === "connecting" ? "Connecting..." : "Disconnected";
};

/** Forward stage_command messages from the agent to the canvas renderer. */
const handleStageCommand = (command) => {
  const frame = { beat: command.beat, label: `${command.opcode} @ beat ${command.beat}`, command };
  chatRenderer?.renderFrame(frame);
  document.getElementById("timeline-output").textContent = `Beat ${command.beat}: ${command.opcode}`;
};

let chatClient = null;

if (chatMessagesEl) {
  const panel = createChatPanel(chatMessagesEl, {
    onApprovalChoice: (requestId, choice) => {
      if (chatClient) {
        sendApprovalResponse(chatClient, requestId, choice);
      }
    },
    onPlayStart: (storyTitle) => {
      chatRenderer?.reset();
      chatLiveAdapter.stop();
    }
  });

  chatClient = createChatClient({
    onAgentMessage: (message) => {
      // Route stage_command events to canvas; everything else to chat panel.
      if (message.type === "stage_command") {
        handleStageCommand(message.command);
      } else {
        panel.handleMessage(message);
      }
    },
    onSessionStart: (sessionId) => {
      panel.setStatus(`Session: ${sessionId.slice(0, 8)}…`);
    },
    onConnected: () => {
      setConnectionStatus("connected");
    },
    onDisconnected: () => {
      setConnectionStatus("disconnected");
    }
  });

  setConnectionStatus("connecting");

  chatForm?.addEventListener("submit", (e) => {
    e.preventDefault();
    const content = chatInput?.value?.trim();
    if (!content || !chatClient) return;
    panel.renderUserMessage(content);
    sendUserMessage(chatClient, content);
    if (chatInput) chatInput.value = "";
  });
}

// Stage panel controls (chat mode)
document.getElementById("stage-pause")?.addEventListener("click", () => {
  chatRenderer?.pause();
  chatLiveAdapter.stop();
});

document.getElementById("stage-reset")?.addEventListener("click", () => {
  chatRenderer?.reset();
  chatLiveAdapter.stop();
});

// ===== Casting Studio (legacy button-driven flow) =====
const timelineOutput = document.getElementById("studio-timeline-output") ?? document.getElementById("timeline-output");
const castingOutput = document.getElementById("casting-output");
const castingOptions = document.getElementById("casting-options");
const modeSelect = document.getElementById("mode-select");
const canvas = document.getElementById("studio-stage-canvas") ?? document.getElementById("stage-canvas");
const storyIdInput = document.getElementById("story-id-input");
const styleInput = document.getElementById("style-input");
const languageInput = document.getElementById("language-input");
const storyTextInput = document.getElementById("story-text-input");
const storyScriptInput = document.getElementById("story-script-input");
const renderer = createStageRenderer(canvas);
const liveAdapter = createLiveAdapter();

let castingState = initialCastingState;
let playbackMode = modeSelect?.value === "live" ? "live" : "replay";
let activeStoryDraft = normalizeStoryDraft(defaultStoryDraft);

const hydrateStoryControls = (storyDraft) => {
  if (storyIdInput) {
    storyIdInput.value = storyDraft.storyId;
  }

  if (styleInput) {
    styleInput.value = storyDraft.style;
  }

  if (languageInput) {
    languageInput.value = storyDraft.language;
  }

  if (storyTextInput) {
    storyTextInput.value = storyDraft.text;
  }

  if (storyScriptInput) {
    storyScriptInput.value = storyDraft.script;
  }
};

const readStoryDraft = () =>
  normalizeStoryDraft({
    storyId: storyIdInput?.value,
    style: styleInput?.value,
    language: languageInput?.value,
    text: storyTextInput?.value,
    script: storyScriptInput?.value
  });

hydrateStoryControls(activeStoryDraft);
renderer.setStyle(activeStoryDraft.style);

const syncArtifactVisuals = () => {
  renderer.setArtifactVisuals(buildArtifactVisualMap(castingState));
};

const writeTimeline = (message) => {
  if (!timelineOutput) {
    return;
  }

  timelineOutput.textContent = message;
};

const renderCastingSummary = () => {
  if (!castingOutput) {
    return;
  }

  if (castingState.order.length === 0) {
    castingOutput.textContent = "Casting not loaded yet.";
    return;
  }

  const lines = castingState.order.map((charId) => {
    const entry = castingState.byCharId[charId];
    const selected = [...entry.existingCandidates, ...entry.generatedCandidates].find(
      (candidate) => candidate.candidateId === entry.selectedCandidateId
    );

    if (!selected) {
      return `${entry.characterProfile.name}: no candidate selected`;
    }

    return `${entry.characterProfile.name}: ${selected.artifactId} (${selected.source})`;
  });

  castingOutput.textContent = lines.join("\n");
};

const renderCastingOptions = () => {
  if (!castingOptions) {
    return;
  }

  castingOptions.textContent = "";
  if (castingState.order.length === 0) {
    return;
  }

  const fragment = document.createDocumentFragment();

  for (const charId of castingState.order) {
    const entry = castingState.byCharId[charId];
    const container = document.createElement("div");
    container.className = "casting-character";

    const title = document.createElement("h4");
    title.textContent = entry.characterProfile.name;
    container.appendChild(title);

    const candidates = [...entry.existingCandidates, ...entry.generatedCandidates];
    for (const candidate of candidates) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = `candidate-option${
        entry.selectedCandidateId === candidate.candidateId ? " selected" : ""
      }`;
      button.textContent = `${candidate.artifactId} (${candidate.source})`;

      button.addEventListener("click", () => {
        castingState = reduceCastingState(castingState, {
          type: "selectCandidate",
          charId,
          candidateId: candidate.candidateId
        });
        syncArtifactVisuals();
        renderCastingSummary();
        renderCastingOptions();
        writeTimeline(`Selected ${candidate.artifactId} for ${entry.characterProfile.name}.`);
      });

      container.appendChild(button);
    }

    fragment.appendChild(container);
  }

  castingOptions.appendChild(fragment);
};

const runDemoReplay = async (storyDraft, castSelections) => {
  const response = await fetch("/v1/demo/run", {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify(buildRunDemoPayload(storyDraft, castSelections))
  });

  if (!response.ok) {
    throw new Error(`Failed to run demo (${response.status})`);
  }

  return response.json();
};

const startReplayPlayback = (replayCommands) => {
  liveAdapter.stop();
  liveAdapter.disconnect();

  const frames = buildReplayFrames(replayCommands);
  if (frames.length === 0) {
    writeTimeline("Replay contained no frames.");
    return;
  }

  renderer.loadFrames(frames);
  renderer.play((frame, frameNumber, totalFrames) => {
    writeTimeline(`Frame ${frameNumber}/${totalFrames}: ${frame.label}`);
  });
};

const toLiveFrame = (command) => ({
  beat: command.beat,
  label: `${command.opcode} @ beat ${command.beat}`,
  command
});

const startLivePlayback = (commands) => {
  liveAdapter.stop();
  renderer.pause();
  renderer.reset();
  liveAdapter.playFromCommands(
    commands,
    (command, index, total) => {
      const frame = toLiveFrame(command);
      renderer.renderFrame(frame);
      writeTimeline(`Live ${index}/${total}: ${frame.label}`);
    },
    () => {
      writeTimeline("Live stream complete.");
    }
  );
};

modeSelect?.addEventListener("change", () => {
  playbackMode = modeSelect.value === "live" ? "live" : "replay";
  liveAdapter.stop();
  liveAdapter.disconnect();
  renderer.pause();
  writeTimeline(`Playback mode set to ${playbackMode}.`);
});

styleInput?.addEventListener("input", () => {
  const typedStyle = typeof styleInput.value === "string" ? styleInput.value.trim() : "";
  renderer.setStyle(typedStyle.length > 0 ? typedStyle : activeStoryDraft.style);
});

document.getElementById("load-demo")?.addEventListener("click", async () => {
  try {
    const storyDraft = readStoryDraft();
    const prepared = await requestCastingPrepare("", {
      storyId: storyDraft.storyId,
      style: storyDraft.style,
      language: storyDraft.language,
      text: storyDraft.text
    });

    activeStoryDraft = storyDraft;
    hydrateStoryControls(activeStoryDraft);
    renderer.setStyle(activeStoryDraft.style);

    castingState = reduceCastingState(castingState, {
      type: "loadPrepareSuccess",
      storyId: prepared.storyId,
      characters: prepared.characters
    });
    syncArtifactVisuals();

    renderer.reset();
    renderCastingSummary();
    renderCastingOptions();
    writeTimeline(
      `Loaded ${activeStoryDraft.storyId} from /v1/casting/prepare. You can generate additional candidates.`
    );
  } catch (error) {
    writeTimeline(error instanceof Error ? error.message : "Failed to load casting data.");
  }
});

document.getElementById("generate-cast")?.addEventListener("click", async () => {
  try {
    if (castingState.order.length === 0 || !castingState.storyId) {
      writeTimeline("Load casting first before generating candidates.");
      return;
    }

    for (const charId of castingState.order) {
      const entry = castingState.byCharId[charId];
      const generated = await requestGenerateCandidates("", {
        storyId: castingState.storyId,
        style: activeStoryDraft.style,
        character: entry.characterProfile
      });

      castingState = reduceCastingState(castingState, {
        type: "mergeGeneratedCandidates",
        charId,
        generatedCandidates: generated.generatedCandidates
      });
    }

    syncArtifactVisuals();

    renderCastingSummary();
    renderCastingOptions();
    writeTimeline("Generated candidate sets added for all characters.");
  } catch (error) {
    writeTimeline(error instanceof Error ? error.message : "Failed to generate cast candidates.");
  }
});

document.getElementById("play")?.addEventListener("click", async () => {
  try {
    if (!castingState.storyId) {
      writeTimeline("Load casting first before starting playback.");
      return;
    }

    if (activeStoryDraft.storyId !== castingState.storyId) {
      writeTimeline("Story draft changed. Click Load Story before playback.");
      return;
    }

    const approvePayload = buildApprovePayload(castingState);
    if (approvePayload.castSelections.length === 0) {
      writeTimeline("Select at least one cast candidate before approving playback.");
      return;
    }

    if (approvePayload.castSelections.length < castingState.order.length) {
      writeTimeline("Select a candidate for each character before approving playback.");
      return;
    }

    const approved = await requestApproveCasting("", approvePayload);
    castingState = reduceCastingState(castingState, {
      type: "approveSuccess",
      approvedAt: approved.sessionArtifactMap.approvedAt
    });
    syncArtifactVisuals();

    const demoResult = await runDemoReplay(activeStoryDraft, approvePayload.castSelections);
    if (playbackMode === "live") {
      startLivePlayback(demoResult.replay);
    } else {
      startReplayPlayback(demoResult.replay);
    }

    renderCastingSummary();
    renderCastingOptions();
    writeTimeline(
      playbackMode === "live"
        ? "Casting approved. Live playback started (simulated stream)."
        : "Casting approved. Replay playback started."
    );
  } catch (error) {
    writeTimeline(error instanceof Error ? error.message : "Failed to approve casting.");
  }
});

document.getElementById("pause")?.addEventListener("click", () => {
  liveAdapter.stop();
  renderer.pause();
  writeTimeline("Playback paused.");
});

renderer.reset();
syncArtifactVisuals();
renderCastingSummary();
renderCastingOptions();
