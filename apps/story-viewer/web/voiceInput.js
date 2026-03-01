/**
 * voiceInput.js — Web Speech API voice input module.
 *
 * Provides a microphone button that transcribes speech to text.
 * Falls back gracefully when the Web Speech API is unsupported.
 */

/**
 * Create a voice input handler bound to a microphone button element.
 *
 * @param {object} options
 * @param {HTMLButtonElement} options.micButton - The microphone button element.
 * @param {function} options.onResult - Called with transcribed text when speech ends.
 * @param {function} [options.onStart] - Called when recognition starts.
 * @param {function} [options.onEnd] - Called when recognition ends (success or failure).
 * @param {string} [options.lang='en-IN'] - BCP-47 language tag for recognition.
 * @returns {{ start: () => void, stop: () => void, isSupported: boolean }}
 */
export const createVoiceInput = (options) => {
  const { micButton, onResult, onStart, onEnd, lang = "en-IN" } = options;

  // Check for Web Speech API support.
  const SpeechRecognition =
    window.SpeechRecognition || window.webkitSpeechRecognition;

  if (!SpeechRecognition) {
    // Hide the button when unsupported.
    if (micButton) {
      micButton.style.display = "none";
    }
    return { start: () => {}, stop: () => {}, isSupported: false };
  }

  const recognition = new SpeechRecognition();
  recognition.continuous = false;
  recognition.interimResults = false;
  recognition.lang = lang;
  recognition.maxAlternatives = 1;

  let isListening = false;

  recognition.onstart = () => {
    isListening = true;
    micButton?.classList.add("btn-mic--active");
    micButton?.setAttribute("aria-label", "Stop listening");
    onStart?.();
  };

  recognition.onresult = (event) => {
    const transcript = event.results?.[0]?.[0]?.transcript?.trim();
    if (transcript) {
      onResult(transcript);
    }
  };

  recognition.onerror = (event) => {
    // Ignore no-speech and aborted errors — these are expected.
    if (event.error !== "no-speech" && event.error !== "aborted") {
      console.warn("[voiceInput] Recognition error:", event.error);
    }
  };

  recognition.onend = () => {
    isListening = false;
    micButton?.classList.remove("btn-mic--active");
    micButton?.setAttribute("aria-label", "Start voice input");
    onEnd?.();
  };

  const start = () => {
    if (!isListening) {
      try {
        recognition.start();
      } catch {
        // Recognition may already be running in some browsers.
      }
    }
  };

  const stop = () => {
    if (isListening) {
      recognition.stop();
    }
  };

  // Toggle on button click.
  if (micButton) {
    micButton.setAttribute("aria-label", "Start voice input");
    micButton.addEventListener("click", () => {
      if (isListening) {
        stop();
      } else {
        start();
      }
    });
  }

  return { start, stop, isSupported: true };
};
