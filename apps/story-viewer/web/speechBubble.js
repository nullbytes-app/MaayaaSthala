/**
 * Comic speech bubble system for Story AI stage.
 * Renders emotion-based bubble shapes with typewriter text animation
 * and spring pop-in/out effects.
 *
 * Bubble shapes per emotion:
 *   neutral/speaking → rounded rectangle + bezier tail
 *   angry/excited    → spiky starburst
 *   whisper/fear     → dashed outline, thin
 *   thinking         → cloud with circle-chain tail
 *
 * Draw order: call update(dt) each frame, then draw(ctx, artifacts, canvas).
 * Bubbles are drawn INSIDE the camera transform (so they shake/zoom with scene).
 */

// ─── Constants ────────────────────────────────────────────────────────────────

const CANVAS_W = 720;
const CANVAS_H = 420;
const MARGIN = 10;          // min distance from canvas edge
const MAX_BUBBLE_W = 220;   // max bubble width (text wraps within this)
const SLOT_H = 340;         // character slot height (feet-to-top)
const HEAD_FRACTION = 0.40; // top 40% of slot = head area

// ─── Easing ───────────────────────────────────────────────────────────────────

const easeOutBack = (t) => {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
};

// ─── Text Utilities ───────────────────────────────────────────────────────────

/**
 * Wrap text to fit within maxWidth. Returns array of lines.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {string} text
 * @param {number} maxWidth
 * @returns {string[]}
 */
function wrapText(ctx, text, maxWidth) {
  const words = text.split(" ");
  const lines = [];
  let current = "";

  for (const word of words) {
    const test = current ? `${current} ${word}` : word;
    if (ctx.measureText(test).width > maxWidth && current) {
      lines.push(current);
      current = word;
    } else {
      current = test;
    }
  }
  if (current) lines.push(current);
  return lines;
}

// ─── Bubble Shape Renderers ───────────────────────────────────────────────────

/**
 * Draw a rounded rectangle speech bubble with a bezier tail.
 * Used for normal speech.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} bx - Bubble left X
 * @param {number} by - Bubble top Y
 * @param {number} bw - Bubble width
 * @param {number} bh - Bubble height
 * @param {number} tailX - Tail tip X (character mouth)
 * @param {number} tailY - Tail tip Y (character mouth)
 */
function drawRoundedBubble(ctx, bx, by, bw, bh, tailX, tailY) {
  const r = 12; // corner radius
  const cx = bx + bw / 2;
  const cy = by + bh / 2;

  ctx.beginPath();
  // Rounded rect
  ctx.moveTo(bx + r, by);
  ctx.lineTo(bx + bw - r, by);
  ctx.quadraticCurveTo(bx + bw, by, bx + bw, by + r);
  ctx.lineTo(bx + bw, by + bh - r);
  ctx.quadraticCurveTo(bx + bw, by + bh, bx + bw - r, by + bh);
  // Tail exit point — bottom of bubble near character
  const tailBaseX = Math.max(bx + r, Math.min(bx + bw - r, cx));
  ctx.lineTo(tailBaseX + 8, by + bh);
  // Bezier tail to mouth
  ctx.quadraticCurveTo(tailBaseX + 4, by + bh + (tailY - by - bh) * 0.5, tailX, tailY);
  ctx.quadraticCurveTo(tailBaseX - 4, by + bh + (tailY - by - bh) * 0.5, tailBaseX - 8, by + bh);
  ctx.lineTo(bx + r, by + bh);
  ctx.quadraticCurveTo(bx, by + bh, bx, by + bh - r);
  ctx.lineTo(bx, by + r);
  ctx.quadraticCurveTo(bx, by, bx + r, by);
  ctx.closePath();
}

/**
 * Draw a spiky starburst bubble for shouting/anger.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} bx - Bubble left X
 * @param {number} by - Bubble top Y
 * @param {number} bw - Bubble width
 * @param {number} bh - Bubble height
 * @param {number} tailX - Tail tip X
 * @param {number} tailY - Tail tip Y
 */
function drawShoutBubble(ctx, bx, by, bw, bh, tailX, tailY) {
  const cx = bx + bw / 2;
  const cy = by + bh / 2;
  const spikes = 10;
  const outerR = Math.max(bw, bh) / 2 + 8;
  const innerR = Math.min(bw, bh) / 2 - 4;

  ctx.beginPath();
  for (let i = 0; i < spikes * 2; i++) {
    const angle = (i * Math.PI) / spikes - Math.PI / 2;
    const r = i % 2 === 0 ? outerR : innerR;
    const px = cx + Math.cos(angle) * r;
    const py = cy + Math.sin(angle) * r;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();

  // Simple line tail for shout
  ctx.moveTo(cx, cy + outerR);
  ctx.lineTo(tailX, tailY);
}

/**
 * Draw a dashed-outline whisper bubble (thin, ghost-like).
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} bx
 * @param {number} by
 * @param {number} bw
 * @param {number} bh
 * @param {number} tailX
 * @param {number} tailY
 */
function drawWhisperBubble(ctx, bx, by, bw, bh, tailX, tailY) {
  const r = 8;
  ctx.setLineDash([5, 4]);
  ctx.lineWidth = 1.5;

  ctx.beginPath();
  ctx.moveTo(bx + r, by);
  ctx.lineTo(bx + bw - r, by);
  ctx.quadraticCurveTo(bx + bw, by, bx + bw, by + r);
  ctx.lineTo(bx + bw, by + bh - r);
  ctx.quadraticCurveTo(bx + bw, by + bh, bx + bw - r, by + bh);
  ctx.lineTo(bx + r, by + bh);
  ctx.quadraticCurveTo(bx, by + bh, bx, by + bh - r);
  ctx.lineTo(bx, by + r);
  ctx.quadraticCurveTo(bx, by, bx + r, by);
  ctx.closePath();

  // Dotted line tail
  const cx = bx + bw / 2;
  ctx.moveTo(cx, by + bh);
  ctx.lineTo(tailX, tailY);
}

/**
 * Draw a thought bubble (cloud shape with circle chain tail).
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} bx
 * @param {number} by
 * @param {number} bw
 * @param {number} bh
 * @param {number} tailX
 * @param {number} tailY
 */
function drawThoughtBubble(ctx, bx, by, bw, bh, tailX, tailY) {
  const cx = bx + bw / 2;
  const cy = by + bh / 2;
  const rx = bw / 2 + 4;
  const ry = bh / 2 + 4;

  // Cloud shape: ellipse with bumps on top
  ctx.beginPath();
  ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
  ctx.closePath();

  // Chain tail: 3 diminishing circles
  const tailMidX = (cx + tailX) / 2;
  const tailMidY = (cy + tailY) / 2;
  ctx.moveTo(tailMidX + 8, tailMidY);
  ctx.arc(tailMidX, tailMidY, 8, 0, Math.PI * 2);
  ctx.moveTo(tailX + 4, tailY);
  ctx.arc(tailX, tailY, 4, 0, Math.PI * 2);
}

// ─── Emotion → Shape Map ──────────────────────────────────────────────────────

const EMOTION_SHAPE = {
  angry: "shout",
  anger: "shout",   // alias for angry
  excited: "shout",
  shout: "shout",
  whisper: "whisper",
  fear: "whisper",
  fearful: "whisper",
  thinking: "thought",
  thought: "thought",
  // All others → rounded
};

const EMOTION_FONT = {
  shout: { font: "bold 16px Bangers, Impact, sans-serif", color: "#1a0000", textTransform: "upper" },
  whisper: { font: "italic 12px 'Comic Neue', cursive", color: "#334", textTransform: "none" },
  thought: { font: "italic 13px 'Comic Neue', cursive", color: "#334", textTransform: "none" },
  rounded: { font: "14px 'Patrick Hand', cursive", color: "#111", textTransform: "none" },
};

// ─── Speech Bubble System ─────────────────────────────────────────────────────

/**
 * Create and manage a set of comic speech bubbles for stage characters.
 *
 * Usage:
 *   const bubbles = createSpeechBubbleSystem();
 *   bubbles.setSpeechBubble("Meera", "Hello!", "neutral");
 *   // each frame:
 *   bubbles.update(dt);
 *   bubbles.draw(ctx, artifacts, canvas);
 *
 * @returns {object} Speech bubble controller.
 */
export function createSpeechBubbleSystem() {
  // Map from charId → bubble state
  const bubbles = new Map();

  /**
   * Show a speech bubble for a character.
   *
   * @param {string} charId - Character identifier (matches artifact key in stageRenderer).
   * @param {string} text - Text to display.
   * @param {string} [emotion="neutral"] - Emotion key affecting bubble shape and font.
   */
  function setSpeechBubble(charId, text, emotion = "neutral") {
    const shape = EMOTION_SHAPE[emotion] || "rounded";
    const existing = bubbles.get(charId);
    bubbles.set(charId, {
      text,
      emotion,
      shape,
      // Animation state
      scale: existing ? existing.scale : 0,  // spring from 0 (or current if replacing)
      opacity: 0,
      textProgress: 0,     // typewriter 0..1
      popping: false,       // true when dismissing
      textLength: text.length,
      // Cache: offscreen canvas for text (recreated when text changes)
      textCanvas: null,
      textCacheKey: null,
    });
  }

  /**
   * Start dismissal animation for a character's bubble.
   *
   * @param {string} charId
   */
  function clearSpeechBubble(charId) {
    const bubble = bubbles.get(charId);
    if (bubble) {
      bubble.popping = true;
    }
  }

  /**
   * Immediately remove all speech bubbles.
   */
  function clearAll() {
    bubbles.clear();
  }

  /**
   * Advance all bubble animations.
   *
   * @param {number} dt - Elapsed time in seconds.
   */
  function update(dt) {
    for (const [charId, b] of bubbles.entries()) {
      if (b.popping) {
        // Dismiss: shrink scale quickly
        b.scale = Math.max(0, b.scale - dt * 6);
        b.opacity = b.scale;
        if (b.scale <= 0) {
          bubbles.delete(charId);
        }
      } else {
        // Pop-in: spring toward scale=1
        b.scale = Math.min(1, b.scale + (1 - b.scale) * Math.min(1, dt * 8));
        b.opacity = Math.min(1, b.opacity + (1 - b.opacity) * Math.min(1, dt * 8));
        // Typewriter reveal
        if (b.scale > 0.5) {
          b.textProgress = Math.min(1, b.textProgress + (dt * 30) / Math.max(1, b.textLength));
        }
      }
    }
  }

  /**
   * Draw all active speech bubbles.
   *
   * @param {CanvasRenderingContext2D} ctx - Canvas 2D context (inside camera transform).
   * @param {object} artifacts - Stage artifacts from stageRenderer state.
   * @param {HTMLCanvasElement} canvas - The stage canvas.
   */
  function draw(ctx, artifacts, canvas) {
    if (!artifacts || bubbles.size === 0) return;

    // Collect bubble positions for collision avoidance
    const positions = [];

    for (const [charId, b] of bubbles.entries()) {
      if (b.scale <= 0 || b.opacity <= 0) continue;

      // Find character position from artifacts
      const artifact = artifacts[charId];
      if (!artifact) continue;

      const charX = artifact.x;
      const charY = artifact.y; // feet position (~395)
      const depthScale = artifact.depthScale ?? 1.0;
      const charH = 340 * depthScale;

      // Mouth position: ~60% from top of character slot = below head fraction
      const mouthY = charY - charH * 0.60;
      const mouthX = charX;

      // Measure text to size bubble
      const shape = b.shape || "rounded";
      const fontStyle = EMOTION_FONT[shape] || EMOTION_FONT.rounded;

      ctx.save();
      ctx.font = fontStyle.font;

      const rawText = fontStyle.textTransform === "upper" ? b.text.toUpperCase() : b.text;
      const visibleText = rawText.slice(0, Math.ceil(rawText.length * b.textProgress));

      const lines = wrapText(ctx, rawText, MAX_BUBBLE_W - 20);
      const lineHeight = parseInt(ctx.font) + 4;
      const textW = Math.min(MAX_BUBBLE_W, Math.max(...lines.map(l => ctx.measureText(l).width)) + 24);
      const textH = lines.length * lineHeight + 20;

      const bw = textW;
      const bh = textH;

      // Default position: centered above character head
      let bx = charX - bw / 2;
      let by = charY - charH - bh - 12; // 12px above head top

      // Clamp to canvas bounds
      bx = Math.max(MARGIN, Math.min((canvas?.width ?? CANVAS_W) - bw - MARGIN, bx));
      by = Math.max(MARGIN, Math.min((canvas?.height ?? CANVAS_H) - bh - MARGIN, by));

      // Simple collision avoidance: shift right if overlapping a previous bubble
      for (const prev of positions) {
        const overlapX = bx < prev.bx + prev.bw && bx + bw > prev.bx;
        const overlapY = by < prev.by + prev.bh && by + bh > prev.by;
        if (overlapX && overlapY) {
          bx = Math.min(prev.bx + prev.bw + 8, (canvas?.width ?? CANVAS_W) - bw - MARGIN);
        }
      }

      positions.push({ bx, by, bw, bh });

      // Apply spring pop-in scale transform centered on bubble
      const popScale = b.scale < 1 ? easeOutBack(b.scale) : 1;
      const pivotX = bx + bw / 2;
      const pivotY = by + bh / 2;

      ctx.globalAlpha = b.opacity;
      ctx.translate(pivotX, pivotY);
      ctx.scale(popScale, popScale);
      ctx.translate(-pivotX, -pivotY);

      // Draw bubble background
      ctx.fillStyle = shape === "whisper" ? "rgba(230,240,255,0.92)"
        : shape === "shout" ? "rgba(255,240,220,0.95)"
        : "rgba(255,255,255,0.95)";
      ctx.strokeStyle = shape === "shout" ? "#cc2200" : shape === "whisper" ? "#6699aa" : "#333";
      ctx.lineWidth = shape === "shout" ? 2.5 : 1.5;

      if (shape === "shout") {
        drawShoutBubble(ctx, bx, by, bw, bh, mouthX, mouthY);
      } else if (shape === "whisper") {
        drawWhisperBubble(ctx, bx, by, bw, bh, mouthX, mouthY);
      } else if (shape === "thought") {
        drawThoughtBubble(ctx, bx, by, bw, bh, mouthX, mouthY);
      } else {
        drawRoundedBubble(ctx, bx, by, bw, bh, mouthX, mouthY);
      }

      ctx.fill();
      ctx.stroke();
      ctx.setLineDash([]); // reset dash

      // Draw typewriter text
      ctx.fillStyle = fontStyle.color;
      ctx.font = fontStyle.font;
      ctx.textBaseline = "top";

      const visibleLines = wrapText(ctx, visibleText, bw - 20);
      const textStartX = bx + 10;
      const textStartY = by + 10;

      for (let i = 0; i < visibleLines.length; i++) {
        ctx.fillText(visibleLines[i], textStartX, textStartY + i * lineHeight);
      }

      ctx.restore();
    }
  }

  return { setSpeechBubble, clearSpeechBubble, clearAll, update, draw };
}
