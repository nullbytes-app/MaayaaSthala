/**
 * chatPanel.js — Renders multimodal agent messages in the chat panel.
 *
 * Handles: text, image, audio, approval_request, play_start, error messages.
 * Integrates with chatClient.js for approval responses.
 */

/**
 * Create a chat panel renderer bound to a container element.
 *
 * @param {HTMLElement} container - The DOM element to render messages into.
 * @param {object} options
 * @param {(requestId: string, choice: string) => void} options.onApprovalChoice
 *   Called when the user clicks an approval card button.
 * @param {(storyTitle: string) => void} [options.onPlayStart]
 *   Called when a play_start message is received.
 * @returns {{ handleMessage: (message: object) => void, clear: () => void, setStatus: (text: string) => void }}
 */
/**
 * Escape HTML special characters to prevent XSS injection.
 * @param {string} text - Raw text to sanitize.
 * @returns {string} HTML-safe string.
 */
const sanitize = (text) =>
  String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#x27;");

export const createChatPanel = (container, options) => {
  const { onApprovalChoice, onPlayStart } = options;

  /** Scroll the container to the bottom after adding content. */
  const scrollToBottom = () => {
    container.scrollTop = container.scrollHeight;
  };

  /** Create a message bubble wrapper. */
  const createBubble = (role) => {
    const wrapper = document.createElement("div");
    wrapper.className = `chat-bubble chat-bubble--${role}`;
    return wrapper;
  };

  /** Append a bubble to the container and scroll. */
  const appendBubble = (bubble) => {
    container.appendChild(bubble);
    scrollToBottom();
  };

  /** Render a plain text message (supports markdown-like bold/italic). */
  const renderText = (content) => {
    const bubble = createBubble("agent");

    // Sanitize first, then apply safe markdown-like replacements for **bold** and *italic*.
    const html = sanitize(content)
      .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
      .replace(/\*(.+?)\*/g, "<em>$1</em>")
      .replace(/\n/g, "<br>");

    bubble.innerHTML = `<div class="chat-text">${html}</div>`;
    appendBubble(bubble);
  };

  /** Render an image with caption. */
  const renderImage = (url, caption) => {
    const bubble = createBubble("agent");
    const figure = document.createElement("figure");
    figure.className = "chat-image";

    const img = document.createElement("img");
    img.src = url;
    img.alt = caption;
    img.loading = "lazy";
    img.addEventListener("error", () => {
      img.style.display = "none";
    });

    const figcaption = document.createElement("figcaption");
    figcaption.textContent = caption;

    figure.appendChild(img);
    figure.appendChild(figcaption);
    bubble.appendChild(figure);
    appendBubble(bubble);
  };

  /** Render an inline audio player. */
  const renderAudio = (url, durationMs, beatNumber) => {
    if (!url) return; // No audio URL = TTS unavailable, skip silently.

    const bubble = createBubble("agent");
    const wrapper = document.createElement("div");
    wrapper.className = "chat-audio";

    const label = document.createElement("span");
    label.className = "chat-audio__label";
    label.textContent = beatNumber !== undefined ? `🔊 Narration (beat ${beatNumber})` : "🔊 Narration";

    const audio = document.createElement("audio");
    audio.src = url;
    audio.controls = true;
    audio.preload = "auto";
    // Auto-play narration audio for immersive experience.
    audio.autoplay = true;

    wrapper.appendChild(label);
    wrapper.appendChild(audio);
    bubble.appendChild(wrapper);
    appendBubble(bubble);
  };

  /** Render an approval request as a card with clickable choices. */
  const renderApprovalRequest = (requestId, choices, context) => {
    const bubble = createBubble("agent");
    const card = document.createElement("div");
    card.className = "chat-approval-card";
    card.dataset.requestId = requestId;

    const contextEl = document.createElement("p");
    contextEl.className = "chat-approval-card__context";
    contextEl.textContent = context;
    card.appendChild(contextEl);

    const choicesList = document.createElement("div");
    choicesList.className = "chat-approval-card__choices";

    for (const choice of choices) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "chat-approval-btn";
      btn.textContent = choice;

      btn.addEventListener("click", () => {
        // Disable all buttons in this card after a choice.
        for (const sibling of card.querySelectorAll(".chat-approval-btn")) {
          sibling.disabled = true;
        }

        btn.classList.add("chat-approval-btn--selected");
        onApprovalChoice(requestId, choice);

        // Show the selection as a user bubble.
        renderUserMessage(choice);
      });

      choicesList.appendChild(btn);
    }

    card.appendChild(choicesList);
    bubble.appendChild(card);
    appendBubble(bubble);
  };

  /**
   * Render a recorded video clip (video modality — MediaRecorder MP4 artifact).
   * This handles the "video" AgentStreamMessage type produced when a play scene
   * has been recorded as a video artifact.
   */
  const renderVideo = (url, sceneId) => {
    const bubble = createBubble("agent");
    const wrapper = document.createElement("div");
    wrapper.className = "chat-video";

    const label = document.createElement("span");
    label.className = "chat-video__label";
    label.textContent = `Scene recording${sceneId ? ` — ${sanitize(sceneId)}` : ""}`;

    const video = document.createElement("video");
    video.src = url;
    video.controls = true;
    video.preload = "metadata";
    video.style.maxWidth = "100%";
    video.addEventListener("error", () => {
      video.style.display = "none";
      label.textContent += " (unavailable)";
    });

    wrapper.appendChild(label);
    wrapper.appendChild(video);
    bubble.appendChild(wrapper);
    appendBubble(bubble);
  };

  /** Render a play_start banner. */
  const renderPlayStart = (sceneId, storyTitle) => {
    const banner = document.createElement("div");
    banner.className = "chat-play-banner";
    banner.innerHTML = `<span>🎭</span> <strong>${sanitize(storyTitle)}</strong> — Performance starting...`;
    container.appendChild(banner);
    scrollToBottom();
    onPlayStart?.(storyTitle);
  };

  /** Render an error message. */
  const renderError = (message) => {
    const bubble = createBubble("error");
    bubble.innerHTML = `<div class="chat-text chat-text--error">⚠️ ${sanitize(message)}</div>`;
    appendBubble(bubble);
  };

  /** Render a user's own message. */
  const renderUserMessage = (content) => {
    const bubble = createBubble("user");
    // Use textContent for user messages — no markup needed, prevents XSS.
    const textDiv = document.createElement("div");
    textDiv.className = "chat-text";
    textDiv.textContent = content;
    bubble.appendChild(textDiv);
    appendBubble(bubble);
  };

  /**
   * Handle any agent stream message and render the appropriate UI.
   *
   * @param {object} message - AgentStreamMessage from the WebSocket.
   */
  const handleMessage = (message) => {
    switch (message.type) {
      case "text":
        renderText(message.content);
        break;

      case "image":
        renderImage(message.url, message.caption);
        break;

      case "audio":
        renderAudio(message.url, message.duration, message.beatNumber);
        break;

      case "video":
        renderVideo(message.url, message.sceneId);
        break;

      case "approval_request":
        renderApprovalRequest(message.requestId, message.choices, message.context);
        break;

      case "play_start":
        renderPlayStart(message.sceneId, message.storyTitle);
        break;

      case "play_frame":
        // play_frame events are consumed by the canvas renderer, not the chat panel.
        break;

      case "stage_command":
        // stage_command events are consumed by the canvas renderer via the live adapter.
        break;

      case "error":
        renderError(message.message);
        break;

      default:
        // Unknown message type — ignore silently.
        break;
    }
  };

  /** Clear all messages from the panel. */
  const clear = () => {
    container.innerHTML = "";
  };

  /** Show a status line (connected/disconnected/loading). */
  const setStatus = (text) => {
    let statusEl = container.querySelector(".chat-status");
    if (!statusEl) {
      statusEl = document.createElement("div");
      statusEl.className = "chat-status";
      container.prepend(statusEl);
    }

    statusEl.textContent = text;
  };

  return { handleMessage, renderUserMessage, clear, setStatus };
};
