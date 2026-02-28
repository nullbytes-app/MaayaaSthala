/**
 * audioSync.js — Audio-Visual Sync module.
 *
 * Uses the Web Audio API AnalyserNode to extract real-time amplitude from TTS
 * audio elements. The extracted intensity value drives character animation
 * intensity — characters pulse/bob more vigorously when their voice is louder.
 *
 * Usage:
 *   const sync = createAudioSync();
 *   sync.connectAudio(audioElement, "Meera");  // when audio starts playing
 *   sync.disconnect();                          // when audio ends
 *   // In animation loop:
 *   sync.update();
 *   const { intensity, speaker } = sync.getSpeakState();
 *
 * Browser compatibility:
 *   - AudioContext: supported in all modern browsers (Chrome 35+, Firefox 25+,
 *     Safari 14.1+, Edge 79+). webkitAudioContext fallback covers older Safari.
 *   - createMediaElementSource: supported wherever AudioContext is supported.
 *   - WeakSet: ES6+, supported universally in modern browsers.
 *   - NOTE: Safari on iOS requires a user gesture before AudioContext can be
 *     created or resumed (autoplay policy). The resume() call in connectAudio
 *     handles the "suspended" state that results from this restriction.
 */
export function createAudioSync() {
  /** @type {AudioContext|null} */
  let audioCtx = null;

  /** @type {AnalyserNode|null} */
  let analyser = null;

  /** @type {Uint8Array|null} Frequency data buffer reused each frame to avoid GC pressure. */
  let dataArray = null;

  /** Current normalised speak intensity in [0, 1]. Decays to 0 when silent. */
  let speakIntensity = 0;

  /** Character ID of the currently active speaker, or null if silent. */
  let activeSpeaker = null;

  /**
   * WeakSet of audio elements already connected to the MediaElementSource.
   * createMediaElementSource() throws if called twice on the same element, so
   * we track connected elements and skip re-connection attempts.
   *
   * Reason: WeakSet is used (not Set) so that GC'd audio elements are released
   * automatically without manual cleanup.
   */
  const connectedElements = new WeakSet();

  /**
   * Lazily initialise AudioContext and AnalyserNode on first use.
   * Deferred to avoid creating an AudioContext before any user gesture,
   * which would trigger browser autoplay-policy warnings.
   */
  function ensureAudioContext() {
    if (audioCtx) return;
    // Reason: webkitAudioContext fallback for Safari < 14.1.
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) {
      console.warn("AudioSync: Web Audio API not supported in this browser.");
      return;
    }
    audioCtx = new AudioCtx();
    analyser = audioCtx.createAnalyser();
    // fftSize 256 → 128 frequency bins. Small enough for real-time per-frame
    // processing without performance impact at 60 fps.
    analyser.fftSize = 256;
    // smoothingTimeConstant controls how quickly the analyser averages values.
    // 0.7 gives a responsive but not jittery readout — good for animation driving.
    analyser.smoothingTimeConstant = 0.7;
    dataArray = new Uint8Array(analyser.frequencyBinCount);
  }

  /**
   * Connect a playing audio element to the AnalyserNode for amplitude extraction.
   * Safe to call multiple times with the same element — ignores already-connected
   * elements but always updates activeSpeaker.
   *
   * @param {HTMLAudioElement} audioElement - The audio element to analyse.
   * @param {string} speakerCharId - Character ID of the speaker (used by getSpeakState).
   */
  function connectAudio(audioElement, speakerCharId) {
    if (!audioElement) return;

    // Always update active speaker, even if the element is already connected.
    activeSpeaker = speakerCharId || "unknown";

    if (connectedElements.has(audioElement)) {
      return; // Already wired — skip MediaElementSource creation.
    }

    ensureAudioContext();
    if (!audioCtx || !analyser) {
      // Web Audio not available — degrade gracefully (no amplitude data).
      return;
    }

    // Resume AudioContext if suspended by browser autoplay policy.
    // Reason: Chrome/Safari suspend the context if created before a user gesture.
    // The audio message arrives after user interaction (chat send), so resuming
    // here is safe and should succeed.
    if (audioCtx.state === "suspended") {
      audioCtx.resume().catch((err) => {
        console.warn("AudioSync: could not resume AudioContext:", err.message);
      });
    }

    try {
      const source = audioCtx.createMediaElementSource(audioElement);
      // Wire: source → analyser → destination (speakers).
      // Reason: we must connect to destination too, otherwise the audio is
      // routed through the analyser but no sound reaches the speakers.
      source.connect(analyser);
      analyser.connect(audioCtx.destination);
      connectedElements.add(audioElement);
    } catch (err) {
      // createMediaElementSource throws InvalidStateError if the element was
      // already used by another AudioContext, or if it is cross-origin.
      // In either case, degrade gracefully — animation will use fallback.
      console.warn("AudioSync: could not connect audio element:", err.message);
    }
  }

  /**
   * Sample current audio amplitude. Call once per animation frame (requestAnimationFrame).
   *
   * Reads frequency data from the AnalyserNode and computes average amplitude
   * in the speech frequency range (approx. 300–3400 Hz vocal formants).
   * When no speaker is active, speakIntensity decays smoothly toward 0.
   */
  function update() {
    if (!analyser || !activeSpeaker) {
      // Smooth decay — prevents hard cuts in animation intensity when audio ends.
      speakIntensity = Math.max(0, speakIntensity - 0.05);
      return;
    }

    analyser.getByteFrequencyData(dataArray);

    // Frequency bin mapping at a typical 44100 Hz sample rate:
    //   bin width = sampleRate / fftSize = 44100 / 256 ≈ 172 Hz per bin
    //   bin 2  ≈  344 Hz  (lower vocal range)
    //   bin 20 ≈ 3440 Hz  (upper vocal formant F2/F3)
    // We sample bins 2–20 to focus on speech intelligibility frequencies.
    // Reason: higher bins capture harmonic overtones but not fundamental speech
    // energy; lower bins (0-1) are dominated by DC offset and sub-bass.
    const speechBins = dataArray.slice(2, 20);
    const sum = speechBins.reduce((acc, val) => acc + val, 0);
    const avg = sum / speechBins.length;

    // Uint8Array values are in [0, 255]. Normalise to [0, 1].
    // We clamp the normalised value to [0, 1] as a safety guard.
    speakIntensity = Math.min(avg / 255, 1.0);
  }

  /**
   * Get the current speak state for driving character animations.
   *
   * intensity === 0 when silent; ~0.3 for quiet speech; ~0.8+ for loud speech.
   *
   * @returns {{ intensity: number, speaker: string|null }}
   *   intensity — normalised amplitude [0, 1]
   *   speaker  — character ID of the active speaker, or null if silent
   */
  function getSpeakState() {
    return { intensity: speakIntensity, speaker: activeSpeaker };
  }

  /**
   * Signal that the current speaker's audio has ended.
   * Resets activeSpeaker so update() applies the decay path.
   * Does NOT close the AudioContext — it is reused for subsequent audio.
   */
  function disconnect() {
    activeSpeaker = null;
    // Do not immediately zero intensity — let update()'s decay handle it
    // smoothly so animation doesn't snap to idle on the exact last frame.
  }

  /**
   * Tear down the AudioContext entirely (call on page unload or cleanup).
   * After calling destroy(), this instance should be discarded.
   */
  function destroy() {
    activeSpeaker = null;
    speakIntensity = 0;
    if (audioCtx) {
      audioCtx.close().catch(() => {});
      audioCtx = null;
      analyser = null;
      dataArray = null;
    }
  }

  return { connectAudio, update, getSpeakState, disconnect, destroy };
}
