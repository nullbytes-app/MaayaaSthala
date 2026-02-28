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
import { createVoiceInput } from "./voiceInput.js";
import { createAudioSync } from "./audioSync.js";

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

// ===== Audio-Visual Sync =====
// Connects TTS audio elements to a Web Audio AnalyserNode so character
// animation intensity can be driven by real-time vocal amplitude.
const audioSync = createAudioSync();

const setConnectionStatus = (state) => {
  const dot = statusDot;
  const label = statusLabel;
  if (!dot || !label) return;
  dot.className = `status-dot status-dot--${state}`;
  label.textContent = state === "connected" ? "Connected" : state === "connecting" ? "Connecting..." : "Disconnected";
};

/** Track play state for routing captions to stage. */
let isPlayActive = false;
let lastNarrationText = null;

/** Forward stage_command messages from the agent to the canvas renderer. */
const handleStageCommand = (command) => {
  const frame = { beat: command.beat, label: `${command.opcode} @ beat ${command.beat}`, command };
  // Render to both: chatRenderer (stage-canvas in Chat panel) and
  // renderer (studio-stage-canvas in Stage panel — what the user sees).
  chatRenderer?.renderFrame(frame);
  renderer?.renderFrame(frame);
};

let chatClient = null;

if (chatMessagesEl) {
  const panel = createChatPanel(chatMessagesEl, {
    onApprovalChoice: (requestId, choice) => {
      if (chatClient) {
        sendApprovalResponse(chatClient, requestId, choice);
      }
    },
    // Wire TTS audio elements to the AnalyserNode for animation amplitude driving.
    // Reason: chatPanel creates the <audio> element internally; we expose it here
    // via callback rather than duplicating audio creation logic in main.js.
    onAudioPlay: (audioEl, speakerCharId) => {
      audioSync.connectAudio(audioEl, speakerCharId);
    },
    onAudioEnded: () => {
      audioSync.disconnect();
    },
    onPlayStart: (storyTitle) => {
      chatRenderer?.reset();
      renderer?.reset();
      liveAdapter.stop();
      // Re-apply portraits after reset — reset() clears the renderer's portrait map
      // but character_portrait messages arrive before play_start, so we re-inject them.
      for (const [charId, imageUrl] of characterPortraits) {
        chatRenderer?.setCharacterPortrait?.(charId, imageUrl, null, characterExpressions.get(charId));
        renderer?.setCharacterPortrait?.(charId, imageUrl, null, characterExpressions.get(charId));
      }
      chatLiveAdapter.stop();
      isPlayActive = true;
      const timelineEl = document.getElementById("timeline-output");
      if (timelineEl) timelineEl.textContent = storyTitle ? `Now playing: ${storyTitle}` : "Performance in progress…";
    },
    onInputEnabled: (enabled) => {
      if (chatInput) {
        chatInput.disabled = !enabled;
      }
      if (chatForm) {
        const sendBtn = chatForm.querySelector(".btn-send");
        if (sendBtn) sendBtn.disabled = !enabled;
        chatForm.classList.toggle("chat-input-form--disabled", !enabled);
      }
    }
  });

  /** Track character portraits for canvas rendering (re-applied after reset). */
  const characterPortraits = new Map();
  /** Track pre-generated expression maps per charId (for re-apply after reset). */
  const characterExpressions = new Map();

  // ===== Browser TTS for voice narration =====
  let ttsVoices = [];
  const loadVoices = () => { ttsVoices = window.speechSynthesis?.getVoices() ?? []; };
  loadVoices();
  window.speechSynthesis?.addEventListener?.("voiceschanged", loadVoices);

  // Chrome Web Speech API pauses after ~15s — keep alive with periodic pause/resume.
  let ttsKeepAliveTimer = null;
  const startTtsKeepAlive = () => {
    if (ttsKeepAliveTimer) return;
    ttsKeepAliveTimer = setInterval(() => {
      if (window.speechSynthesis?.speaking) {
        window.speechSynthesis.pause();
        window.speechSynthesis.resume();
      }
    }, 10000);
  };
  const stopTtsKeepAlive = () => {
    if (ttsKeepAliveTimer) {
      clearInterval(ttsKeepAliveTimer);
      ttsKeepAliveTimer = null;
    }
  };

  const speakText = (text, isCharacter = false) => {
    if (!window.speechSynthesis || !text?.trim()) return;
    // Cancel current speech only if it's the same type (don't interrupt ongoing speech
    // with a new utterance of same type — just queue); always cancel on explicit stops.
    window.speechSynthesis.cancel();
    const utt = new SpeechSynthesisUtterance(text);
    // Prefer Indian English voice; fall back to any en-IN or English voice.
    const indianVoice =
      ttsVoices.find(v => v.lang === "en-IN") ||
      ttsVoices.find(v => v.lang.startsWith("en-IN")) ||
      ttsVoices.find(v => v.lang.startsWith("en"));
    if (indianVoice) utt.voice = indianVoice;
    utt.lang = "en-IN";
    utt.rate = isCharacter ? 1.05 : 0.88;
    utt.pitch = isCharacter ? 1.1 : 0.85;
    utt.volume = 0.9;
    window.speechSynthesis.speak(utt);
    startTtsKeepAlive();
  };

  chatClient = createChatClient({
    onAgentMessage: (message) => {
      // Route canvas-specific events to renderer; everything else to chat panel.
      if (message.type === "stage_command") {
        handleStageCommand(message.command);
      } else if (message.type === "scene_backdrop") {
        // Apply backdrop to both renderers: chatRenderer (stage-canvas in chat panel)
        // and renderer (studio-stage-canvas in Stage panel — what the user sees).
        chatRenderer?.setBackdrop?.(message.imageUrl);
        renderer?.setBackdrop?.(message.imageUrl);
      } else if (message.type === "character_portrait") {
        characterPortraits.set(message.charId, message.imageUrl);
        // Track expressions for re-apply after renderer reset.
        if (message.expressions) {
          characterExpressions.set(message.charId, message.expressions);
        } else {
          characterExpressions.delete(message.charId);
        }
        chatRenderer?.setCharacterPortrait?.(message.charId, message.imageUrl, null, message.expressions);
        renderer?.setCharacterPortrait?.(message.charId, message.imageUrl, null, message.expressions);
        // Don't add character portrait to chat panel (handled visually on stage)
      } else if (message.type === "character_expression_update") {
        // Hot-add expression variant — arrives during the first beats of the play.
        chatRenderer?.addExpressionVariant?.(message.charId, message.expressionKey, message.imageUrl);
        renderer?.addExpressionVariant?.(message.charId, message.expressionKey, message.imageUrl);
        // Also update cached expressions map for re-apply after reset.
        const existing = characterExpressions.get(message.charId) ?? { neutral: characterPortraits.get(message.charId) ?? "" };
        characterExpressions.set(message.charId, { ...existing, [message.expressionKey]: message.imageUrl });
        // Don't send to chat panel
      } else if (message.type === "text" && isPlayActive) {
        // During play: route narration/dialogue to the correct stage overlay + browser TTS.
        // NARRATE lines are wrapped in *asterisks*; SPEAK (dialogue) lines are wrapped in "quotes".
        // Reason: playCompiler.ts emits text messages without a speaker field — the quote/asterisk
        // convention is the heuristic for distinguishing narration from character dialogue.
        const text = message.content;
        const isNarration = text.startsWith("*") && text.endsWith("*");
        const isDialogue = text.startsWith('"') && text.endsWith('"');

        if (isNarration) {
          // Narration goes to the caption overlay (full-width bar at bottom of stage).
          const clean = text.replace(/^\*|\*$/g, "");
          chatRenderer?.setCaption?.(clean, "Narrator");
          renderer?.setCaption?.(clean, "Narrator");
          speakText(clean, false);
        } else if (isDialogue) {
          // Dialogue goes to speech bubbles on both renderers.
          // The concurrent stage_command (SPEAK opcode) already calls applyFrame →
          // setSpeechBubble internally, but we also call it here to:
          //   a) ensure the studio-panel renderer (renderer) shows the bubble, and
          //   b) keep the two renderers in sync if message ordering shifts.
          // Reason: applyFrame sets the bubble anchored to the character position;
          // calling setSpeechBubble with role="" falls back to a centred bubble,
          // which is acceptable until a speaker field is added to AgentStreamMessage.
          const clean = text.replace(/^"|"$/g, "");
          chatRenderer?.setSpeechBubble?.("", clean, "neutral");
          renderer?.setSpeechBubble?.("", clean, "neutral");
          speakText(clean, true);
        }
        // Still send to chat panel for the transcript.
        panel.handleMessage(message);
      } else if (message.type === "play_frame") {
        // play_frame is a per-beat sync marker — do NOT cancel TTS here.
        // TTS is cancelled naturally: speakText() cancels the prior utterance before the next,
        // and the post-play text message ("The curtain falls...") clears isPlayActive + cancels.
        panel.handleMessage(message);
      } else if (message.type === "mood_change") {
        chatRenderer?.setMood?.(message.mood);
        renderer?.setMood?.(message.mood);
      } else {
        // Non-play text messages: clear caption and reset play state.
        if (message.type === "text") {
          isPlayActive = false;
          chatRenderer?.setCaption?.(null, null);
          window.speechSynthesis?.cancel?.();
          stopTtsKeepAlive();
          const timelineEl = document.getElementById("timeline-output");
          if (timelineEl) timelineEl.textContent = "Stage ready. Start a conversation to begin.";
        }
        panel.handleMessage(message);
      }
    },
    onSessionStart: (_sessionId) => {
      // Session started — no user-visible status update needed.
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

  // Wire microphone button with Web Speech API.
  const micButton = document.getElementById("btn-mic");
  if (micButton) {
    createVoiceInput({
      micButton,
      lang: "en-IN",
      onResult: (transcript) => {
        if (!chatClient || !chatInput) return;
        chatInput.value = transcript;
        // Auto-submit the transcribed text.
        panel.renderUserMessage(transcript);
        sendUserMessage(chatClient, transcript);
        chatInput.value = "";
      }
    });
  }

  // ===== Audio-Visual Sync update loop =====
  // Run a lightweight rAF loop that samples the AnalyserNode each frame.
  // Kept separate from the stageRenderer's loop so audioSync has no coupling
  // to renderer internals; getSpeakState() can be polled by any consumer.
  // Reason: audioSync.update() is cheap — one getByteFrequencyData call plus
  // an 18-element typed array reduce — well within per-frame budget at 60 fps.
  const runAudioSyncLoop = () => {
    audioSync.update();
    requestAnimationFrame(runAudioSyncLoop);
  };
  requestAnimationFrame(runAudioSyncLoop);
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
