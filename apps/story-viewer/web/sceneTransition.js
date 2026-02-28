/**
 * sceneTransition.js — Canvas scene transition animations.
 *
 * State-based rendering: transition stores its current animation state;
 * draw() is called each frame from drawStage() to overlay curtain/fade on top.
 * This avoids the double-draw interference that occurred when transition used its
 * own requestAnimationFrame loop competing with the main animation loop.
 */

const TRANSITION_DURATION_MS = 900;

/**
 * Create scene transition effects bound to a canvas element.
 *
 * @param {HTMLCanvasElement} canvas - The stage canvas element.
 * @param {CanvasRenderingContext2D} ctx - The 2D rendering context.
 * @returns {{ curtainClose, curtainOpen, fadeToBlack, showCurtain, isFullyClosed, draw }}
 */
export const createSceneTransition = (canvas, ctx) => {
  // Active animation state: null when idle.
  // { type: "close"|"open"|"fade", startTime, durationMs, onDone }
  let current = null;

  // True when curtain is statically fully closed (no animation running).
  // Starts true so the canvas opens with curtains closed on page load.
  let staticallyClosed = true;

  // ─── Curtain rendering ────────────────────────────────────────────────────

  /**
   * Draw one curtain panel with velvet folds, gold trim, valance and fringe.
   *
   * @param {number} panelX     - Left edge of this panel in canvas px.
   * @param {number} panelW     - Width of this panel in canvas px.
   * @param {boolean} isRight   - True for the right panel (folds mirror).
   */
  const _drawPanel = (panelX, panelW, isRight) => {
    if (panelW <= 0) return;

    ctx.save();
    // Clip so folds don't bleed outside the panel boundary.
    ctx.beginPath();
    ctx.rect(panelX, 0, panelW, canvas.height);
    ctx.clip();

    // ── Velvet fabric folds ───────────────────────────────────────────────
    // Each "fold" is a vertical strip whose gradient simulates fabric catching
    // light on a raised peak and falling into shadow in the valley.
    const foldCount = Math.max(5, Math.ceil(panelW / 30));
    const foldW = panelW / foldCount;

    for (let i = 0; i < foldCount; i++) {
      // Mirror fold index for the right panel so peaks/valleys are symmetric.
      const col = isRight ? foldCount - 1 - i : i;
      const fx = panelX + col * foldW;
      const isPeak = i % 2 === 0;

      const grad = ctx.createLinearGradient(fx, 0, fx + foldW, 0);
      if (isPeak) {
        // Raised fold — fabric catches the stage light.
        grad.addColorStop(0,    "#7A1020");  // shadow coming from valley
        grad.addColorStop(0.25, "#B01830");  // rising highlight
        grad.addColorStop(0.5,  "#CC2040");  // peak — brightest
        grad.addColorStop(0.75, "#9A1428");  // falling
        grad.addColorStop(1,    "#6A0E1C");  // dropping into next valley
      } else {
        // Valley — fabric recesses away from light.
        grad.addColorStop(0,    "#6A0E1C");
        grad.addColorStop(0.4,  "#7A1020");
        grad.addColorStop(0.8,  "#881220");
        grad.addColorStop(1,    "#7A1020");
      }
      ctx.fillStyle = grad;
      ctx.fillRect(fx, 0, foldW, canvas.height);
    }

    // Subtle vertical ambient-occlusion shadow near the outer edge
    // (where the panel emerges from off-screen).
    const outerEdgeGrad = ctx.createLinearGradient(
      isRight ? panelX + panelW : panelX, 0,
      isRight ? panelX + panelW - 18 : panelX + 18, 0
    );
    outerEdgeGrad.addColorStop(0, "rgba(0,0,0,0.55)");
    outerEdgeGrad.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = outerEdgeGrad;
    ctx.fillRect(panelX, 0, panelW, canvas.height);

    // ── Valance (top horizontal decorative band) ──────────────────────────
    const valH = 32;
    const valGrad = ctx.createLinearGradient(0, 0, 0, valH);
    valGrad.addColorStop(0,   "#4A0812");
    valGrad.addColorStop(0.6, "#6A1020");
    valGrad.addColorStop(1,   "#501018");
    ctx.fillStyle = valGrad;
    ctx.fillRect(panelX, 0, panelW, valH);

    // Gold band under the valance.
    const goldBandGrad = ctx.createLinearGradient(panelX, 0, panelX + panelW, 0);
    goldBandGrad.addColorStop(0,   "#7A5A00");
    goldBandGrad.addColorStop(0.3, "#D4A017");
    goldBandGrad.addColorStop(0.5, "#FFD700");
    goldBandGrad.addColorStop(0.7, "#D4A017");
    goldBandGrad.addColorStop(1,   "#7A5A00");
    ctx.fillStyle = goldBandGrad;
    ctx.fillRect(panelX, valH, panelW, 4);

    // ── Gold trim at inner (opening) edge ─────────────────────────────────
    const trimW = 14;
    const trimX = isRight ? panelX : panelX + panelW - trimW;
    const trimGrad = ctx.createLinearGradient(trimX, 0, trimX + trimW, 0);
    trimGrad.addColorStop(0,    "#5A4000");
    trimGrad.addColorStop(0.25, "#C89A10");
    trimGrad.addColorStop(0.5,  "#FFD700");
    trimGrad.addColorStop(0.75, "#C89A10");
    trimGrad.addColorStop(1,    "#5A4000");
    ctx.fillStyle = trimGrad;
    ctx.fillRect(trimX, 0, trimW, canvas.height);

    // ── Fringe at the bottom ──────────────────────────────────────────────
    const fringeBaseY = canvas.height - 28;
    // Fringe base rope.
    const ropeGrad = ctx.createLinearGradient(0, fringeBaseY, 0, fringeBaseY + 4);
    ropeGrad.addColorStop(0, "#C89A10");
    ropeGrad.addColorStop(1, "#8B6914");
    ctx.fillStyle = ropeGrad;
    ctx.fillRect(panelX, fringeBaseY, panelW, 4);

    // Individual fringe strands.
    const strandSpacing = 8;
    const strandCount = Math.floor(panelW / strandSpacing);
    for (let i = 0; i < strandCount; i++) {
      const sx = panelX + i * strandSpacing + strandSpacing / 2;
      // Vary strand length for a natural, staggered look.
      const strandLen = 14 + (i % 4) * 4;

      ctx.strokeStyle = i % 3 === 0 ? "#FFD700" : "#C89A10";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(sx, fringeBaseY + 4);
      ctx.lineTo(sx + (i % 2 === 0 ? 1 : -1), fringeBaseY + 4 + strandLen);
      ctx.stroke();

      // Small tassel bead at end.
      ctx.beginPath();
      ctx.arc(sx + (i % 2 === 0 ? 1 : -1), fringeBaseY + 4 + strandLen + 2, 2.5, 0, Math.PI * 2);
      ctx.fillStyle = "#DAA520";
      ctx.fill();
    }

    ctx.restore();
  };

  /**
   * Draw both curtain panels at the given closure fraction (0=open, 1=fully closed).
   */
  const _drawCurtain = (closedFraction) => {
    if (closedFraction <= 0) return;
    const halfWidth = canvas.width / 2;
    const sweep = closedFraction * halfWidth;

    _drawPanel(0, sweep, false);                         // left panel
    _drawPanel(canvas.width - sweep, sweep, true);       // right panel
  };

  // ─── Public API ───────────────────────────────────────────────────────────

  /**
   * Draw the current transition frame on top of the canvas.
   * Call this at the END of drawStage() every animation frame.
   * If no transition is active, this is a no-op.
   */
  const draw = () => {
    // Static fully-closed curtain (before play starts).
    if (staticallyClosed) {
      _drawCurtain(1.0);
      return;
    }

    if (!current) return;

    const elapsed = performance.now() - current.startTime;
    const progress = Math.min(elapsed / current.durationMs, 1);

    if (current.type === "close") {
      _drawCurtain(progress);
    } else if (current.type === "open") {
      _drawCurtain(1 - progress);
    } else if (current.type === "fade") {
      ctx.save();
      ctx.globalAlpha = progress;
      ctx.fillStyle = "#000000";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.restore();
    } else if (current.type === "iris_close" || current.type === "iris_open") {
      const maxRadius = Math.hypot(canvas.width, canvas.height) / 2 + 10;
      let radius;
      if (current.type === "iris_close") {
        radius = maxRadius * (1 - progress); // circle shrinks to center
      } else {
        radius = maxRadius * progress; // circle grows from center
      }
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, 0, canvas.width, canvas.height);
      ctx.arc(canvas.width / 2, canvas.height / 2, Math.max(radius, 0.5), 0, Math.PI * 2, true);
      ctx.clip();
      ctx.fillStyle = "#000";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.restore();
    }

    // When animation completes, fire the callback.
    if (progress >= 1) {
      const { type, onDone } = current;
      current = null;
      // After a curtainClose with no callback (e.g. SCENE_CLOSE), keep curtain
      // visually closed — don't let the stage peek through between skits.
      if (type === "close" && !onDone) {
        staticallyClosed = true;
      }
      onDone?.();
    }
  };

  /**
   * Close the curtain — panels sweep in from left and right.
   * @param {function} [onDone] - Called when curtain is fully closed.
   */
  const curtainClose = (onDone) => {
    staticallyClosed = false;
    current = { type: "close", startTime: performance.now(), durationMs: TRANSITION_DURATION_MS, onDone };
  };

  /**
   * Open the curtain — panels sweep back out to left and right.
   * @param {function} [onDone] - Called when curtain is fully open.
   */
  const curtainOpen = (onDone) => {
    staticallyClosed = false;
    current = { type: "open", startTime: performance.now(), durationMs: TRANSITION_DURATION_MS, onDone };
  };

  /**
   * Fade the entire canvas to black.
   * @param {function} [onDone] - Called when fade completes.
   */
  const fadeToBlack = (onDone) => {
    staticallyClosed = false;
    current = { type: "fade", startTime: performance.now(), durationMs: TRANSITION_DURATION_MS, onDone };
  };

  /**
   * Iris wipe transition — circle closes to black then opens to reveal new scene.
   * @param {function} [onDone] - Called when the iris has fully opened.
   */
  const irisWipe = (onDone) => {
    staticallyClosed = false;
    current = {
      type: "iris_close",
      startTime: performance.now(),
      durationMs: TRANSITION_DURATION_MS,
      onDone: () => {
        current = {
          type: "iris_open",
          startTime: performance.now(),
          durationMs: TRANSITION_DURATION_MS,
          onDone: onDone || null
        };
      }
    };
  };

  /**
   * Immediately show the curtain fully closed — no animation.
   * Call from reset() before play starts so the first SCENE_OPEN opens dramatically.
   */
  const showCurtain = () => {
    current = null;
    staticallyClosed = true;
  };

  /**
   * True when curtain is statically fully closed (set by showCurtain()).
   * Used by setBackdrop() to skip the curtainClose step when curtain is already closed.
   */
  const isFullyClosed = () => staticallyClosed && current === null;

  return { curtainClose, curtainOpen, fadeToBlack, irisWipe, showCurtain, isFullyClosed, draw };
};
