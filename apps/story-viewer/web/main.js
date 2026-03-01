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
/** When true, server sends GCP TTS audio — browser TTS should NOT speak during play. */
let serverAudioEnabled = false;
/** CharId of the character whose server audio is currently playing (for bubble cleanup). */
let currentSpeakingCharId = null;
let lastNarrationText = null;

/**
 * Forward stage_command messages from the agent to the canvas renderer.
 *
 * @param {object} command - The RuntimeStageCommand to render.
 * @param {function|null} onSpeakCharId - Optional callback invoked with the
 *   speaker charId when a SPEAK command arrives. Used by the chatClient block
 *   to trigger character-aware browser TTS with the buffered dialogue text.
 *   (Dialogue text arrives in the preceding text message; charId is only known
 *   when the stage_command arrives, hence the callback pattern.)
 */
const handleStageCommand = (command, onSpeakCharId = null) => {
  const frame = { beat: command.beat, label: `${command.opcode} @ beat ${command.beat}`, command };
  // Render to both: chatRenderer (stage-canvas in Chat panel) and
  // renderer (studio-stage-canvas in Stage panel — what the user sees).
  chatRenderer?.renderFrame(frame);
  renderer?.renderFrame(frame);
  // Trigger character-specific browser TTS for dialogue beats.
  if (command.opcode === "SPEAK" && onSpeakCharId) {
    const charId = typeof command.payload?.role === "string" ? command.payload.role : null;
    onSpeakCharId(charId);
  }
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
      serverAudioActive = true;
      currentSpeakingCharId = speakerCharId || null;
      // Cancel any in-flight browser TTS to avoid overlap with server audio.
      window.speechSynthesis?.cancel?.();
      audioSync.connectAudio(audioEl, speakerCharId);
    },
    onAudioEnded: () => {
      serverAudioActive = false;
      // Clear the speech bubble for the character whose audio just finished.
      if (currentSpeakingCharId && currentSpeakingCharId !== "narrator" && currentSpeakingCharId !== "unknown") {
        chatRenderer?.clearSpeechBubble?.(currentSpeakingCharId);
        renderer?.clearSpeechBubble?.(currentSpeakingCharId);
      }
      currentSpeakingCharId = null;
      audioSync.disconnect();
    },
    onPlayStart: (storyTitle, audioEnabled) => {
      chatRenderer?.reset();
      renderer?.reset();
      liveAdapter.stop();
      // Track whether server GCP TTS audio will be sent for this play.
      // When true, browser Web Speech API is suppressed to avoid dual-voice overlap.
      serverAudioEnabled = !!audioEnabled;
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
  // Reason: when Google Cloud TTS audio is playing via <audio> element, the browser
  // Web Speech API must NOT also speak the same text — otherwise you hear both
  // engines overlapping, making it sound worse. serverAudioActive is set by the
  // onAudioPlay/onAudioEnded callbacks and checked in speakText().
  let serverAudioActive = false;
  let ttsVoices = [];

  /**
   * Per-charId voice configuration for browser TTS fallback.
   * Built from voice_casting message + available speechSynthesis voices.
   * Maps charId → { voice, rate, pitch }.
   */
  let charVoiceMap = new Map();
  let pendingVoiceCasting = null; // retained so charVoiceMap can be rebuilt on voiceschanged

  /**
   * Classify a SpeechSynthesisVoice as female or male using its name.
   * Heuristic: checks for female/male keywords, then common female names.
   */
  const classifyVoiceGender = (voice) => {
    const name = (voice.name || "").toLowerCase();
    if (/\b(female|woman|girl|fiona|samantha|victoria|karen|moira|tessa|veena|zira|hazel|susan|lisa|alice|amelie|anna|lekha)\b/.test(name)) return "female";
    if (/\b(male|man|boy|daniel|david|fred|jorge|junior|lee|mark|tom|james|peter|rishi|yuri|aaron|alex|thomas|bruce|ralph)\b/.test(name)) return "male";
    return null; // unknown
  };

  /**
   * Build charVoiceMap from voice_casting data + available browser voices.
   * Strongly prefers Indian English (en-IN) voices over British/American.
   * Uses the full casting data (gender, rate, pitch) from the Rangmanch agent
   * and round-robins across available voices for maximum character distinction.
   */
  const buildCharVoiceMap = (casting, voices) => {
    const map = new Map();
    if (!casting || !voices.length) return map;

    // Reason: on macOS Chrome, "Google UK English Male/Female" voices appear before
    // Indian voices in the list. We must explicitly filter and rank to avoid picking
    // British accents for an Indian storytelling app.
    const isIndianVoice = (v) => v.lang === "en-IN" || v.lang === "hi-IN" ||
      /\b(indian|hindi|rishi|lekha|veena)\b/i.test(v.name);
    const isEnglishVoice = (v) => v.lang.startsWith("en");

    // Build voice pools: Indian English first, then any English, then everything.
    const indianVoices = voices.filter(isIndianVoice);
    const englishVoices = voices.filter(v => isEnglishVoice(v) && !isIndianVoice(v));
    const allUsableVoices = [...indianVoices, ...englishVoices];

    const classifyAndSort = (pool) => {
      const female = pool.filter(v => classifyVoiceGender(v) === "female");
      const male = pool.filter(v => classifyVoiceGender(v) === "male");
      return { female, male };
    };

    // Prefer Indian voices, fall back to English voices if no Indian ones available.
    const indianSorted = classifyAndSort(indianVoices);
    const allSorted = classifyAndSort(allUsableVoices);

    const femalePool = indianSorted.female.length > 0 ? indianSorted.female : allSorted.female;
    const malePool = indianSorted.male.length > 0 ? indianSorted.male : allSorted.male;

    const fallbackVoice = indianVoices[0] || allUsableVoices[0] || voices[0];

    // Round-robin counters so each same-gender character gets a different voice.
    let femaleIdx = 0;
    let maleIdx = 0;

    // Reason: GCP pitch range is roughly -6 to +6 semitones for our casting values,
    // but browser Web Speech API pitch is 0–2 (1.0 = normal). Map accordingly.
    const mapPitch = (gcpPitch) =>
      Math.max(0.3, Math.min(2.0, 1.0 + gcpPitch * 0.1));

    for (const [charId, hint] of Object.entries(casting)) {
      const pool = hint.gender === "female" ? femalePool : malePool;
      let voice;

      if (pool.length > 0) {
        const idx = hint.gender === "female" ? femaleIdx++ : maleIdx++;
        voice = pool[idx % pool.length];
      } else {
        voice = fallbackVoice;
      }

      // Use the per-character rate/pitch from the Rangmanch agent's casting,
      // falling back to sensible defaults if not provided.
      const rate = hint.rate ?? (charId === "narrator" ? 0.85 : 1.0);
      const pitch = hint.pitch != null ? mapPitch(hint.pitch) : (charId === "narrator" ? 0.7 : 1.0);

      map.set(charId, { voice, rate, pitch });
    }

    // Log what voices were selected for debugging.
    for (const [charId, cfg] of map) {
      console.log(`[TTS] ${charId} → voice="${cfg.voice?.name}" lang=${cfg.voice?.lang} rate=${cfg.rate} pitch=${cfg.pitch.toFixed(2)}`);
    }
    return map;
  };

  const loadVoices = () => {
    ttsVoices = window.speechSynthesis?.getVoices() ?? [];
    // Rebuild charVoiceMap if we already received a voice_casting message.
    if (pendingVoiceCasting) {
      charVoiceMap = buildCharVoiceMap(pendingVoiceCasting, ttsVoices);
    }
  };
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

  /**
   * Speak text using browser Web Speech API.
   *
   * @param {string} text - Text to speak.
   * @param {string|null} charId - Character ID (from voiceCasting) or "narrator".
   *   Null / undefined → treat as narrator.
   */
  const speakText = (text, charId = null) => {
    try {
    if (!window.speechSynthesis || !text?.trim()) return;
    // Skip browser TTS entirely when server GCP TTS is enabled for this play.
    // Reason: text messages arrive instantly but server audio takes 1-3s to generate.
    // Without this guard, browser TTS starts speaking, then server audio arrives and
    // plays over it — creating the "starts with one voice then abruptly switches" effect.
    if (serverAudioEnabled && isPlayActive) return;
    // Also skip if server audio is actively playing (belt-and-suspenders guard).
    if (serverAudioActive) return;
    window.speechSynthesis.cancel();
    const utt = new SpeechSynthesisUtterance(text);
    utt.lang = "en-IN";
    utt.volume = 0.9;

    const assignment = charId ? charVoiceMap.get(charId) : null;
    if (assignment) {
      // Use character-specific voice assignment from voice_casting.
      if (assignment.voice) utt.voice = assignment.voice;
      utt.rate = assignment.rate;
      utt.pitch = assignment.pitch;
    } else {
      // Fallback: no casting received yet — use Indian English voice with role heuristic.
      const defaultVoice =
        ttsVoices.find(v => v.lang === "en-IN") ||
        ttsVoices.find(v => v.lang.startsWith("en-IN")) ||
        ttsVoices.find(v => v.lang.startsWith("en"));
      if (defaultVoice) utt.voice = defaultVoice;
      const isNarrator = !charId || charId === "narrator";
      utt.rate = isNarrator ? 0.88 : 1.05;
      utt.pitch = isNarrator ? 0.85 : 1.1;
    }

    // Clear the speech bubble when TTS finishes speaking.
    // Reason: bubbles should disappear once the character is done talking,
    // not stay frozen on screen for the rest of the play.
    if (charId) {
      utt.onend = () => {
        chatRenderer?.clearSpeechBubble?.(charId);
        renderer?.clearSpeechBubble?.(charId);
      };
    }

    window.speechSynthesis.speak(utt);
    startTtsKeepAlive();
    } catch (err) {
      console.warn("[speakText] TTS error:", err);
    }
  };

  /**
   * Buffer for pending dialogue text — text message arrives before SPEAK stage_command.
   * We save the text here and speak it when we receive the SPEAK command with charId.
   */
  let pendingDialogueText = null;

  chatClient = createChatClient({
    onAgentMessage: (message) => {
      // Route canvas-specific events to renderer; everything else to chat panel.
      if (message.type === "stage_command") {
        handleStageCommand(message.command, (charId) => {
          // SPEAK stage_command arrives right after the dialogue text message.
          // stageRenderer uses payload.text (only the first word — NatyaScript parser
          // splits on spaces) so we override the bubble here with the full dialogue
          // text buffered from the preceding text message.
          if (isPlayActive && pendingDialogueText) {
            const fullText = pendingDialogueText;
            pendingDialogueText = null;
            if (charId) {
              chatRenderer?.setSpeechBubble?.(charId, fullText, "neutral");
              renderer?.setSpeechBubble?.(charId, fullText, "neutral");
            }
            speakText(fullText, charId);
          }
        });
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
          if (clean.trim()) {
            chatRenderer?.setCaption?.(clean, "Narrator");
            renderer?.setCaption?.(clean, "Narrator");
            // Narrator has a stable charId — speak with narrator's assigned voice.
            speakText(clean, "narrator");
          }
        } else if (isDialogue) {
          // Buffer the dialogue text — the following SPEAK stage_command carries the
          // charId needed to pick the right voice and to correctly set the bubble.
          // stageRenderer sets the bubble via renderFrame but uses payload.text which is
          // only the first word; the handleStageCommand callback overrides with the full text.
          const clean = text.replace(/^"|"$/g, "");
          if (clean.trim()) {
            pendingDialogueText = clean;
          }
        } else {
          // Malformed or unrecognized format — treat as narration fallback
          chatRenderer?.setCaption?.(text, "Narrator");
          renderer?.setCaption?.(text, "Narrator");
          speakText(text, "narrator");
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
      } else if (message.type === "voice_casting") {
        // Build character-aware browser voice map from gender hints.
        // Emitted by rangmanch agent before play_start. On voiceschanged, the map
        // is also rebuilt (see loadVoices callback above).
        pendingVoiceCasting = message.casting;
        charVoiceMap = buildCharVoiceMap(pendingVoiceCasting, ttsVoices);
      } else {
        // Non-play text messages: clear caption and reset play state.
        if (message.type === "text") {
          isPlayActive = false;
          serverAudioActive = false;
          serverAudioEnabled = false;
          pendingDialogueText = null;
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

  // ===== Stage panel controls (chat mode) =====
  // Placed inside if(chatMessagesEl) so handlers can access TTS state variables
  // (stopTtsKeepAlive, pendingDialogueText, isPlayActive) defined in this block.
  document.getElementById("stage-pause")?.addEventListener("click", () => {
    chatRenderer?.pause();
    chatLiveAdapter.stop();
    // Cancel any in-flight browser TTS and clear pending dialogue buffer.
    window.speechSynthesis?.cancel?.();
    stopTtsKeepAlive();
    pendingDialogueText = null;
    isPlayActive = false;
    serverAudioEnabled = false;
    // Stop the currently playing server TTS audio element.
    panel.stopAudio();
  });

  document.getElementById("stage-reset")?.addEventListener("click", () => {
    chatRenderer?.reset();
    chatLiveAdapter.stop();
    window.speechSynthesis?.cancel?.();
    stopTtsKeepAlive();
    pendingDialogueText = null;
    isPlayActive = false;
    charVoiceMap = new Map();
    pendingVoiceCasting = null;
    const timelineEl = document.getElementById("timeline-output");
    if (timelineEl) timelineEl.textContent = "Stage ready. Start a conversation to begin.";
  });
}

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
