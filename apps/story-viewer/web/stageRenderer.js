import {
  createLeatherTextureRecipe,
  createPuppetPalette,
  createPuppetPose,
  createStageLook
} from "./puppetVisuals.js";
import { createSceneTransition } from "./sceneTransition.js";

// Stage position zones for ENTER/MOVE/EXIT opcodes.
const STAGE_ZONES = {
  offscreen_left: -80,
  left: 120,
  center_left: 260,
  center: 400,
  center_right: 540,
  right: 620,
  offscreen_right: 800
};

const ensureArtifact = (state, artifactId) => {
  if (!state.artifacts[artifactId]) {
    const index = Object.keys(state.artifacts).length;
    const x = 140 + index * 190;
    const y = 292;
    state.artifacts[artifactId] = {
      x,
      y,
      targetX: x,
      targetY: y,
      pulse: 0,
      lastOpcode: "INIT",
      lastPayload: {},
      swayOffset: index * 0.83,
      direction: index % 2 === 0 ? 1 : -1,
      // Sustained emotion from EMOTE opcode — persists until overridden.
      emotion: null,
      // Lerp speed: higher = snappier transitions (BARGE_IN=8, normal=4, walk=2.5).
      lerpSpeed: 4.0
    };
  }

  return state.artifacts[artifactId];
};

const pseudoNoise = (seed) => {
  const value = Math.sin(seed * 12.9898) * 43758.5453123;
  return value - Math.floor(value);
};

const isRecord = (value) => value !== null && typeof value === "object";

const clamp = (value, minimum, maximum) => Math.min(maximum, Math.max(minimum, value));
const toRadians = (degrees) => (degrees * Math.PI) / 180;

const limbPointFromAngle = (originX, originY, length, angleDeg) => {
  const radians = toRadians(angleDeg);

  return {
    x: originX + Math.sin(radians) * length,
    y: originY + Math.cos(radians) * length
  };
};

const hexToRgba = (hexColor, alpha) => {
  const normalized = String(hexColor ?? "").replace("#", "");
  if (!/^[0-9a-f]{6}$/i.test(normalized)) {
    return `rgba(0, 0, 0, ${alpha})`;
  }

  const r = Number.parseInt(normalized.slice(0, 2), 16);
  const g = Number.parseInt(normalized.slice(2, 4), 16);
  const b = Number.parseInt(normalized.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
};

const seededUnit = (seed, offset) => {
  const value = Math.sin((seed + offset * 97.31) * 12.9898) * 43758.5453123;
  return value - Math.floor(value);
};

const createLeatherPattern = (ctx, palette, recipe, artifactId) => {
  const tile = document.createElement("canvas");
  tile.width = 52;
  tile.height = 52;
  const tileCtx = tile.getContext("2d");

  if (!tileCtx) {
    return null;
  }

  tileCtx.fillStyle = palette.leatherFill;
  tileCtx.fillRect(0, 0, tile.width, tile.height);

  const grainCount = Math.floor(34 * recipe.grainScale);
  for (let index = 0; index < grainCount; index += 1) {
    const x = seededUnit(recipe.seed, index + 1) * tile.width;
    const y = seededUnit(recipe.seed, index + 201) * tile.height;
    const radius = 0.5 + seededUnit(recipe.seed, index + 401) * 1.6;
    tileCtx.fillStyle = hexToRgba(palette.edge, recipe.grainAlpha * (0.25 + seededUnit(recipe.seed, index + 601)));
    tileCtx.beginPath();
    tileCtx.arc(x, y, radius, 0, Math.PI * 2);
    tileCtx.fill();
  }

  tileCtx.strokeStyle = hexToRgba(palette.ornament, recipe.highlightAlpha);
  tileCtx.lineWidth = 1.1;
  tileCtx.beginPath();
  tileCtx.moveTo(4, 13);
  tileCtx.bezierCurveTo(14, 6, 32, 5, 48, 12);
  tileCtx.stroke();

  tileCtx.strokeStyle = hexToRgba(palette.edge, recipe.crackAlpha);
  tileCtx.lineWidth = 0.9;
  tileCtx.beginPath();
  tileCtx.moveTo(2, 37 + seededUnit(recipe.seed, 33) * recipe.seamWobble);
  tileCtx.bezierCurveTo(15, 30, 33, 44, 50, 35);
  tileCtx.stroke();

  tileCtx.setLineDash([recipe.stitchLength, recipe.stitchSpacing]);
  tileCtx.strokeStyle = hexToRgba(palette.edge, 0.4);
  tileCtx.lineWidth = 1.2;
  tileCtx.beginPath();
  tileCtx.moveTo(6, 49);
  tileCtx.lineTo(46, 49);
  tileCtx.stroke();
  tileCtx.setLineDash([]);

  const pattern = ctx.createPattern(tile, "repeat");
  if (!pattern) {
    return null;
  }

  return {
    pattern,
    key: `${artifactId}:${recipe.seed}`
  };
};

/**
 * Remove background pixels from an image by sampling corner colors.
 * Detects the actual background color (white, gray, black, or any solid bg) from
 * the four corners rather than hardcoding white. Works for AI-generated images
 * that may produce off-white, light-gray, or other solid-color backgrounds.
 *
 * @param {HTMLImageElement} img - Loaded image element to process.
 * @param {number} tolerance - RGB distance from detected background color to remove (default 40).
 * @returns {HTMLCanvasElement} Canvas with background pixels made transparent.
 */
const removeBackground = (img, tolerance = 40) => {
  const offscreen = document.createElement("canvas");
  offscreen.width = img.naturalWidth || img.width;
  offscreen.height = img.naturalHeight || img.height;
  const offCtx = offscreen.getContext("2d");
  offCtx.drawImage(img, 0, 0);
  const imageData = offCtx.getImageData(0, 0, offscreen.width, offscreen.height);
  const data = imageData.data;

  // Sample corner pixels to detect actual background color.
  // AI may generate off-white, light gray, or other solid backgrounds.
  const w = offscreen.width;
  const h = offscreen.height;
  const corners = [
    [0, 0],
    [w - 1, 0],
    [0, h - 1],
    [w - 1, h - 1]
  ];
  let bgR = 0, bgG = 0, bgB = 0;
  for (const [cx, cy] of corners) {
    const idx = (cy * w + cx) * 4;
    bgR += data[idx];
    bgG += data[idx + 1];
    bgB += data[idx + 2];
  }
  bgR = Math.round(bgR / 4);
  bgG = Math.round(bgG / 4);
  bgB = Math.round(bgB / 4);

  // Remove pixels close to the detected background color.
  for (let i = 0; i < data.length; i += 4) {
    const dr = Math.abs(data[i] - bgR);
    const dg = Math.abs(data[i + 1] - bgG);
    const db = Math.abs(data[i + 2] - bgB);
    if (dr < tolerance && dg < tolerance && db < tolerance) {
      data[i + 3] = 0;
    }
  }
  offCtx.putImageData(imageData, 0, 0);
  return offscreen;
};

const ensurePreviewImageEntry = (state, previewUrl) => {
  const cached = state.previewImageByUrl.get(previewUrl);
  if (cached) {
    return cached;
  }

  const entry = {
    status: "loading",
    image: null
  };

  const image = new Image();
  image.crossOrigin = "anonymous";
  image.onload = () => {
    entry.status = "loaded";
    entry.image = image;
    state.imagePatternCache.delete(previewUrl);
    state.requestRedraw?.();
  };
  image.onerror = () => {
    entry.status = "error";
    state.requestRedraw?.();
  };
  image.src = previewUrl;

  state.previewImageByUrl.set(previewUrl, entry);
  return entry;
};

const getImagePattern = (ctx, state, previewUrl) => {
  if (typeof previewUrl !== "string" || previewUrl.trim().length === 0) {
    return null;
  }

  const normalizedPreviewUrl = previewUrl.trim();
  const cachedPattern = state.imagePatternCache.get(normalizedPreviewUrl);
  if (cachedPattern) {
    return cachedPattern;
  }

  const imageEntry = ensurePreviewImageEntry(state, normalizedPreviewUrl);
  if (imageEntry.status !== "loaded" || !imageEntry.image) {
    return null;
  }

  const pattern = ctx.createPattern(imageEntry.image, "repeat");
  if (!pattern) {
    return null;
  }

  state.imagePatternCache.set(normalizedPreviewUrl, pattern);
  return pattern;
};

const getLeatherPattern = (ctx, state, artifactId, palette, recipe) => {
  const key = `${artifactId}:${recipe.seed}`;
  const cached = state.texturePatternCache.get(key);
  if (cached) {
    return cached;
  }

  const created = createLeatherPattern(ctx, palette, recipe, artifactId);
  if (!created?.pattern) {
    return null;
  }

  state.texturePatternCache.set(key, created.pattern);
  return created.pattern;
};

const strokeStitchPath = (ctx, recipe, color) => {
  ctx.save();
  ctx.setLineDash([recipe.stitchLength, recipe.stitchSpacing]);
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.1;
  ctx.stroke();
  ctx.restore();
};

const drawBackdrop = (ctx, canvas, state) => {
  const stageLook = state.stageLook;

  // Use AI-generated backdrop image when available; fallback to gradient.
  if (state.backdropImage?.complete && state.backdropImage.naturalWidth > 0) {
    ctx.drawImage(state.backdropImage, 0, 0, canvas.width, canvas.height);
    // Semi-transparent overlay for theatrical backlit look.
    ctx.fillStyle = "rgba(43, 19, 11, 0.35)";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  } else {
    const gradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
    gradient.addColorStop(0, stageLook.top);
    gradient.addColorStop(0.52, stageLook.mid);
    gradient.addColorStop(1, stageLook.bottom);
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }

  ctx.fillStyle = stageLook.curtain;
  ctx.fillRect(0, 0, canvas.width, 38);

  ctx.fillStyle = "rgba(36, 10, 5, 0.65)";
  for (let index = 0; index < 8; index += 1) {
    const centerX = 48 + index * (canvas.width / 7);
    ctx.beginPath();
    ctx.ellipse(centerX, 38, 58, 18, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  const flicker = 0.94 + Math.sin(state.beat * 0.6 + state.flickerOffset) * 0.06;
  const glow = ctx.createRadialGradient(
    canvas.width * 0.5,
    canvas.height * 0.28,
    12,
    canvas.width * 0.5,
    canvas.height * 0.44,
    290
  );
  glow.addColorStop(0, `rgba(255, 228, 165, ${0.48 * flicker})`);
  glow.addColorStop(0.45, `rgba(246, 192, 111, ${0.3 * flicker})`);
  glow.addColorStop(1, "rgba(20, 7, 4, 0)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.fillStyle = "rgba(15, 5, 2, 0.38)";
  ctx.beginPath();
  ctx.ellipse(canvas.width * 0.5, canvas.height * 0.9, 292, 58, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = stageLook.grain;
  for (let index = 0; index < 44; index += 1) {
    const x = pseudoNoise(index + state.beat * 0.17) * canvas.width;
    const y = pseudoNoise(index * 1.21 + state.beat * 0.33) * (canvas.height * 0.82);
    const radius = 0.4 + pseudoNoise(index * 1.37) * 1.2;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();
  }
};

const drawArticulatedArm = (
  ctx,
  palette,
  recipe,
  texturePattern,
  shoulderX,
  shoulderY,
  shoulderDeg,
  elbowDeg
) => {
  const elbow = limbPointFromAngle(shoulderX, shoulderY, 34, shoulderDeg);
  const wrist = limbPointFromAngle(elbow.x, elbow.y, 30, shoulderDeg + elbowDeg);

  ctx.strokeStyle = palette.edge;
  ctx.lineWidth = 11;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.beginPath();
  ctx.moveTo(shoulderX, shoulderY);
  ctx.lineTo(elbow.x, elbow.y);
  ctx.lineTo(wrist.x, wrist.y);
  ctx.stroke();

  ctx.strokeStyle = palette.leatherFill;
  ctx.lineWidth = 7;
  ctx.beginPath();
  ctx.moveTo(shoulderX, shoulderY);
  ctx.lineTo(elbow.x, elbow.y);
  ctx.lineTo(wrist.x, wrist.y);
  ctx.stroke();

  if (texturePattern) {
    ctx.save();
    ctx.strokeStyle = texturePattern;
    ctx.globalAlpha = 0.42;
    ctx.lineWidth = 7;
    ctx.beginPath();
    ctx.moveTo(shoulderX, shoulderY);
    ctx.lineTo(elbow.x, elbow.y);
    ctx.lineTo(wrist.x, wrist.y);
    ctx.stroke();
    ctx.restore();
  }

  ctx.beginPath();
  ctx.moveTo(shoulderX, shoulderY);
  ctx.lineTo(elbow.x, elbow.y);
  ctx.lineTo(wrist.x, wrist.y);
  strokeStitchPath(ctx, recipe, hexToRgba(palette.edge, 0.52));

  ctx.fillStyle = palette.edge;
  ctx.beginPath();
  ctx.arc(elbow.x, elbow.y, 3.4, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = palette.ornament;
  ctx.beginPath();
  ctx.arc(wrist.x, wrist.y, 3.8, 0, Math.PI * 2);
  ctx.fill();

  return wrist;
};

/**
 * Draw a single articulated leg for the procedural puppet fallback.
 * Mirrors drawArticulatedArm but for hip/knee joints.
 */
const drawArticulatedLeg = (ctx, palette, recipe, texturePattern, hipX, hipY, hipDeg, kneeDeg) => {
  const knee = limbPointFromAngle(hipX, hipY, 40, hipDeg);
  const foot = limbPointFromAngle(knee.x, knee.y, 36, hipDeg + kneeDeg);

  ctx.strokeStyle = palette.edge;
  ctx.lineWidth = 13;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.beginPath();
  ctx.moveTo(hipX, hipY);
  ctx.lineTo(knee.x, knee.y);
  ctx.lineTo(foot.x, foot.y);
  ctx.stroke();

  ctx.strokeStyle = palette.leatherFill;
  ctx.lineWidth = 9;
  ctx.beginPath();
  ctx.moveTo(hipX, hipY);
  ctx.lineTo(knee.x, knee.y);
  ctx.lineTo(foot.x, foot.y);
  ctx.stroke();

  if (texturePattern) {
    ctx.save();
    ctx.strokeStyle = texturePattern;
    ctx.globalAlpha = 0.42;
    ctx.lineWidth = 9;
    ctx.beginPath();
    ctx.moveTo(hipX, hipY);
    ctx.lineTo(knee.x, knee.y);
    ctx.lineTo(foot.x, foot.y);
    ctx.stroke();
    ctx.restore();
  }

  ctx.beginPath();
  ctx.moveTo(hipX, hipY);
  ctx.lineTo(knee.x, knee.y);
  ctx.lineTo(foot.x, foot.y);
  strokeStitchPath(ctx, recipe, hexToRgba(palette.edge, 0.52));

  ctx.fillStyle = palette.edge;
  ctx.beginPath();
  ctx.arc(knee.x, knee.y, 4.0, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = palette.ornament;
  ctx.beginPath();
  ctx.arc(foot.x, foot.y, 4.2, 0, Math.PI * 2);
  ctx.fill();
};

const drawPuppetFigure = (ctx, palette, recipe, texturePattern, role, pose) => {
  const bodyGradient = ctx.createLinearGradient(0, -108, 0, 110);
  bodyGradient.addColorStop(0, palette.leatherFill);
  bodyGradient.addColorStop(1, palette.leatherShade);

  if (role === "shadow") {
    ctx.fillStyle = "rgba(61, 23, 19, 0.58)";
    ctx.beginPath();
    ctx.ellipse(0, -26, 52, 95, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.fillStyle = bodyGradient;
  ctx.strokeStyle = palette.edge;
  ctx.lineWidth = 2.2;

  ctx.save();
  ctx.translate(0, -86);
  ctx.rotate(toRadians(pose.headTiltDeg));
  ctx.beginPath();
  ctx.ellipse(0, 0, 24, 30, 0, 0, Math.PI * 2);
  ctx.fill();
  if (texturePattern) {
    ctx.save();
    ctx.fillStyle = texturePattern;
    ctx.globalAlpha = 0.48;
    ctx.fill();
    ctx.restore();
  }
  ctx.stroke();

  ctx.beginPath();
  ctx.ellipse(0, 0, 24, 30, 0, 0, Math.PI * 2);
  strokeStitchPath(ctx, recipe, hexToRgba(palette.edge, 0.5));
  ctx.restore();

  ctx.beginPath();
  ctx.moveTo(-30, -54);
  ctx.quadraticCurveTo(-45, -18, -34, 34);
  ctx.lineTo(-26, 88);
  ctx.lineTo(26, 88);
  ctx.lineTo(34, 34);
  ctx.quadraticCurveTo(45, -18, 30, -54);
  ctx.closePath();
  ctx.fill();
  if (texturePattern) {
    ctx.save();
    ctx.fillStyle = texturePattern;
    ctx.globalAlpha = 0.52;
    ctx.fill();
    ctx.restore();
  }
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(-30, -54);
  ctx.quadraticCurveTo(-45, -18, -34, 34);
  ctx.lineTo(-26, 88);
  ctx.lineTo(26, 88);
  ctx.lineTo(34, 34);
  ctx.quadraticCurveTo(45, -18, 30, -54);
  ctx.closePath();
  strokeStitchPath(ctx, recipe, hexToRgba(palette.edge, 0.5));

  ctx.strokeStyle = hexToRgba(palette.ornament, recipe.highlightAlpha);
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(-3, -46);
  ctx.quadraticCurveTo(2 + recipe.seamWobble, 7, -2, 86);
  ctx.stroke();

  const leftWrist = drawArticulatedArm(
    ctx,
    palette,
    recipe,
    texturePattern,
    -25,
    -24,
    pose.leftShoulderDeg,
    pose.leftElbowDeg
  );
  const rightWrist = drawArticulatedArm(
    ctx,
    palette,
    recipe,
    texturePattern,
    25,
    -24,
    pose.rightShoulderDeg,
    pose.rightElbowDeg
  );

  // Articulated legs — drawn after body/arms so they appear in front.
  drawArticulatedLeg(ctx, palette, recipe, texturePattern, -14, 88, pose.leftHipDeg ?? -5, pose.leftKneeDeg ?? 3);
  drawArticulatedLeg(ctx, palette, recipe, texturePattern, 14, 88, pose.rightHipDeg ?? 5, pose.rightKneeDeg ?? 3);

  ctx.fillStyle = "rgba(50, 20, 11, 0.48)";
  const cutouts = [-14, 0, 14];
  for (const cutoutX of cutouts) {
    for (const cutoutY of [-20, 6, 30, 56]) {
      ctx.beginPath();
      ctx.arc(cutoutX, cutoutY, 2.6, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  ctx.fillStyle = palette.ornament;
  ctx.beginPath();
  ctx.arc(0, -6, 5.6, 0, Math.PI * 2);
  ctx.fill();

  if (role === "hero") {
    ctx.strokeStyle = palette.ornament;
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(-20, -38);
    ctx.lineTo(20, -38);
    ctx.stroke();
  }

  if (role === "mentor") {
    ctx.strokeStyle = palette.ornament;
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.arc(0, -86, 30, 0.2 * Math.PI, 0.8 * Math.PI);
    ctx.stroke();
  }

  return {
    leftWrist,
    rightWrist
  };
};

/**
 * Draw a character using 6 separate body-part canvases with independent joint rotation.
 * Painter's order: back leg → back arm → torso → front leg → front arm → head.
 * Returns approximate wrist positions for control rod rendering.
 *
 * @param {CanvasRenderingContext2D} ctx - Stage rendering context.
 * @param {{ head, torso, leftArm, rightArm, leftLeg, rightLeg }} parts - Background-removed part canvases.
 * @param {object} pose - Pose parameters from createPuppetPose().
 * @returns {{ leftWrist, rightWrist }} Wrist positions for control rod overlay.
 */
const drawPuppetWithParts = (ctx, parts, pose) => {
  const { head, torso, leftArm, rightArm, leftLeg, rightLeg } = parts;

  ctx.imageSmoothingEnabled = true;

  // LEFT LEG — drawn first (behind torso), hip joint at torso base.
  const leftHipX = -12;
  const leftHipY = 60;
  if (leftLeg) {
    ctx.save();
    ctx.translate(leftHipX, leftHipY);
    ctx.rotate(toRadians(pose.leftHipDeg ?? 0));
    ctx.drawImage(leftLeg, -14, 0, 28, 90);
    ctx.restore();
  }

  // LEFT ARM — behind torso in painter's order.
  const leftShoulderX = -28;
  const leftShoulderY = -50;
  let leftWrist = { x: leftShoulderX - 22, y: leftShoulderY + 40 };
  if (leftArm) {
    ctx.save();
    ctx.translate(leftShoulderX, leftShoulderY);
    ctx.rotate(toRadians(pose.leftShoulderDeg));
    ctx.drawImage(leftArm, -16, 0, 28, 80);
    leftWrist = { x: leftShoulderX + Math.sin(toRadians(pose.leftShoulderDeg)) * 60, y: leftShoulderY + Math.cos(toRadians(pose.leftShoulderDeg)) * 60 };
    ctx.restore();
  }

  // TORSO — root of the hierarchy, drawn at origin (transforms applied by outer ctx.translate).
  if (torso) {
    ctx.drawImage(torso, -35, -60, 70, 130);
  }

  // RIGHT LEG — drawn in front of torso.
  const rightHipX = 12;
  const rightHipY = 60;
  if (rightLeg) {
    ctx.save();
    ctx.translate(rightHipX, rightHipY);
    ctx.rotate(toRadians(pose.rightHipDeg ?? 0));
    ctx.drawImage(rightLeg, -14, 0, 28, 90);
    ctx.restore();
  }

  // RIGHT ARM — in front of torso.
  const rightShoulderX = 28;
  const rightShoulderY = -50;
  let rightWrist = { x: rightShoulderX + 22, y: rightShoulderY + 40 };
  if (rightArm) {
    ctx.save();
    ctx.translate(rightShoulderX, rightShoulderY);
    ctx.rotate(toRadians(pose.rightShoulderDeg));
    ctx.drawImage(rightArm, -12, 0, 28, 80);
    rightWrist = { x: rightShoulderX + Math.sin(toRadians(pose.rightShoulderDeg)) * 60, y: rightShoulderY + Math.cos(toRadians(pose.rightShoulderDeg)) * 60 };
    ctx.restore();
  }

  // HEAD — on top (drawn last).
  if (head) {
    ctx.save();
    ctx.translate(0, -75);
    ctx.rotate(toRadians(pose.headTiltDeg));
    ctx.drawImage(head, -30, -50, 60, 65);
    ctx.restore();
  }

  return { leftWrist, rightWrist };
};

/**
 * Draw a caption overlay at the bottom of the stage.
 * Semi-transparent dark banner with warm parchment text.
 */
const drawCaption = (ctx, canvas, caption) => {
  if (!caption?.text) return;

  const bannerHeight = 52;
  const y = canvas.height - bannerHeight;

  // Dark semi-transparent banner.
  ctx.save();
  ctx.fillStyle = "rgba(15, 5, 2, 0.78)";
  ctx.fillRect(0, y, canvas.width, bannerHeight);

  // Speaker label in accent color.
  if (caption.speaker) {
    ctx.font = "bold 11px Trebuchet MS";
    ctx.fillStyle = "#e8a45a";
    ctx.fillText(caption.speaker.toUpperCase(), 14, y + 16);
  }

  // Caption text in warm parchment color, word-wrapped.
  ctx.font = "14px Trebuchet MS";
  ctx.fillStyle = "#fff3d6";
  const maxWidth = canvas.width - 28;
  const words = caption.text.split(" ");
  let line = "";
  let lineY = caption.speaker ? y + 33 : y + 22;

  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width > maxWidth && line) {
      ctx.fillText(line, 14, lineY);
      line = word;
      lineY += 17;
    } else {
      line = test;
    }
  }
  if (line) ctx.fillText(line, 14, lineY);

  ctx.restore();
};

const drawPuppet = (ctx, artifactId, artifact, state) => {
  const palette = createPuppetPalette(artifactId);
  const role = palette.role;
  const recipe = createLeatherTextureRecipe(artifactId);
  const previewUrl = state.artifactVisualsById[artifactId]?.previewUrl;

  // Check if character has a real AI portrait (not SVG placeholder).
  // Portraits are keyed by charId (e.g. "c_kak") but artifactId may be the assetId
  // (e.g. "gemini_c_kak_1772189..."). Fall back to substring match so both work.
  // After background removal, portraits are stored as HTMLCanvasElement (not HTMLImageElement).
  const portraitImage =
    state.characterPortraits.get(artifactId) ||
    [...state.characterPortraits.entries()].find(([key]) => artifactId.includes(key))?.[1];
  // Canvas elements (from removeBackground) are always ready to draw; Image elements need the
  // complete + naturalWidth check and must not be stub /generated/ placeholders.
  const hasRealPortrait =
    (portraitImage instanceof HTMLCanvasElement && portraitImage.width > 0) ||
    (portraitImage?.complete &&
      portraitImage.naturalWidth > 0 &&
      portraitImage.src &&
      !portraitImage.src.includes("/generated/"));

  const imagePattern = getImagePattern(ctx, state, previewUrl);
  const texturePattern = imagePattern ?? getLeatherPattern(ctx, state, artifactId, palette, recipe);
  const pose = createPuppetPose({
    role,
    opcode: artifact.lastOpcode,
    beat: state.beat,
    payload: artifact.lastPayload,
    direction: artifact.direction,
    emotion: artifact.emotion
  });
  const sway = Math.sin((state.beat + artifact.swayOffset) * 0.75) * 4;
  const pulseLift = artifact.lastOpcode === "BARGE_IN" ? 11 : artifact.lastOpcode === "GESTURE" ? 7 : 0;
  const x = artifact.x + sway * artifact.direction + pose.swayPx;
  const y = artifact.y - pulseLift - pose.torsoLift;

  // Depth illusion: characters further back (higher y) appear smaller and more transparent.
  // Stage floor is ~y=340, curtain is y=38. Normalize y in that range.
  const depthScale = 0.75 + clamp((y - 200) / 200, 0, 1) * 0.35;
  const depthAlpha = 0.70 + clamp((y - 200) / 200, 0, 1) * 0.28;

  // Drop shadow behind puppet for authentic shadow-theatre look.
  ctx.save();
  ctx.translate(x + 8, y + 14);
  ctx.rotate(toRadians(pose.torsoTiltDeg));
  ctx.scale(depthScale * 1.05, depthScale * 0.85);
  ctx.globalAlpha = 0.22;
  ctx.fillStyle = "rgba(20, 5, 2, 1)";
  ctx.beginPath();
  ctx.ellipse(0, -20, 38, 80, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(toRadians(pose.torsoTiltDeg));
  ctx.scale(depthScale, depthScale);
  ctx.globalAlpha = depthAlpha;

  // Check for articulated parts (Phase 2) — prefer over static portrait.
  const characterParts =
    state.characterParts.get(artifactId) ||
    [...state.characterParts.entries()].find(([key]) => artifactId.includes(key))?.[1];
  // Allow partial articulation — torso + any non-torso part is enough to animate.
  const hasParts =
    characterParts?.torso?.width > 0 &&
    (characterParts?.head?.width > 0 || characterParts?.leftArm?.width > 0 || characterParts?.rightArm?.width > 0);

  let wrists;
  if (hasParts) {
    // Articulated limbs mode — each body part independently transforms by pose joint angles.
    wrists = drawPuppetWithParts(ctx, characterParts, pose);
  } else if (hasRealPortrait) {
    // Static portrait mode — replace stick figure with the AI-generated cutout portrait.
    ctx.save();
    ctx.drawImage(portraitImage, -70, -190, 140, 280);
    ctx.restore();
    // Approximate wrist positions for the control rod overlay below.
    wrists = { leftWrist: { x: -38, y: 32 }, rightWrist: { x: 38, y: 32 } };
  } else {
    wrists = drawPuppetFigure(ctx, palette, recipe, texturePattern, role, pose);
  }

  // Control rods — made more visible to reinforce "being manipulated" puppet aesthetic.
  ctx.strokeStyle = palette.rod;
  ctx.lineWidth = 2.5;
  ctx.globalAlpha = 0.85;
  ctx.beginPath();
  ctx.moveTo(0, -8);
  ctx.lineTo(0, 118);
  ctx.moveTo(wrists.leftWrist.x, wrists.leftWrist.y);
  ctx.lineTo(-62, 70);
  ctx.moveTo(wrists.rightWrist.x, wrists.rightWrist.y);
  ctx.lineTo(62, 70);
  ctx.stroke();

  ctx.restore();

  ctx.fillStyle = state.stageLook.text;
  ctx.font = "bold 11px Trebuchet MS";
  ctx.fillText(artifactId, x - 62, y + 105);
  ctx.fillText(`beat ${state.beat}`, x - 25, y + 120);
};

export const createStageRenderer = (canvas) => {
  const ctx = canvas?.getContext("2d");
  const transition = canvas && ctx ? createSceneTransition(canvas, ctx) : null;
  const state = {
    beat: 0,
    artifacts: {},
    artifactVisualsById: {},
    previewImageByUrl: new Map(),
    imagePatternCache: new Map(),
    texturePatternCache: new Map(),
    lastLabel: "idle",
    style: "leather-shadow",
    stageLook: createStageLook("leather-shadow"),
    flickerOffset: 0.4,
    requestRedraw: null,
    /** AI-generated backdrop image element (null = use gradient). */
    backdropImage: null,
    /** Per-character portrait canvas elements keyed by charId (after background removal). */
    characterPortraits: new Map(),
    /**
     * Per-character body-part canvases for articulated animation.
     * Keyed by charId; each value is {head, torso, leftArm, rightArm, leftLeg, rightLeg} canvases or null.
     */
    characterParts: new Map(),
    /** Current caption text and speaker for stage overlay. */
    caption: null,
    captionTimer: null
  };

  let frames = [];
  let frameIndex = 0;
  let timerId = null;

  // 60fps animation loop state — decoupled from the 500ms beat-stream interval.
  let animating = false;
  let animFrameId = null;
  let lastFrameTime = 0;

  // Smoothly interpolate all artifact positions toward their targets each rAF frame.
  const interpolateArtifacts = (dt) => {
    for (const artifact of Object.values(state.artifacts)) {
      const speed = artifact.lerpSpeed ?? 4.0;
      const factor = Math.min(1, dt * speed);
      if (artifact.targetX !== undefined) {
        artifact.x += (artifact.targetX - artifact.x) * factor;
      }
      if (artifact.targetY !== undefined) {
        artifact.y += (artifact.targetY - artifact.y) * factor;
      }
    }
  };

  const animationLoop = (timestamp) => {
    if (!animating) return;
    const dt = Math.min((timestamp - lastFrameTime) / 1000, 0.1); // cap at 100ms
    lastFrameTime = timestamp;
    // Advance beat counter continuously for smooth sine-wave idle/breathing animation.
    state.beat += dt * 2;
    interpolateArtifacts(dt);
    drawStage();
    animFrameId = requestAnimationFrame(animationLoop);
  };

  const startAnimation = () => {
    if (!animating) {
      animating = true;
      lastFrameTime = performance.now();
      animFrameId = requestAnimationFrame(animationLoop);
    }
  };

  const stopAnimation = () => {
    animating = false;
    if (animFrameId !== null) {
      cancelAnimationFrame(animFrameId);
      animFrameId = null;
    }
  };

  const drawStage = () => {
    if (!ctx || !canvas) {
      return;
    }

    drawBackdrop(ctx, canvas, state);

    for (const [artifactId, artifact] of Object.entries(state.artifacts)) {
      drawPuppet(ctx, artifactId, artifact, state);
    }

    // Draw narration caption overlay.
    if (state.caption) {
      drawCaption(ctx, canvas, state.caption);
    }

    ctx.fillStyle = state.stageLook.text;
    ctx.font = "bold 13px Trebuchet MS";
    ctx.fillText(`Frame: ${state.lastLabel}`, 14, 24);
  };

  state.requestRedraw = () => {
    drawStage();
  };

  const applyFrame = (frame) => {
    // Note: do NOT set state.beat from frame.beat — the rAF loop advances it continuously.
    state.lastLabel = frame.label;

    const artifactId = frame.command?.target?.artifactId;
    if (!artifactId) {
      return;
    }

    const artifact = ensureArtifact(state, artifactId);
    artifact.lastOpcode = frame.command.opcode;
    artifact.lastPayload = frame.command.payload ?? {};
    artifact.pulse = frame.command.opcode === "GESTURE" ? 8 : frame.command.opcode === "BARGE_IN" ? 12 : 0;
    artifact.lerpSpeed = frame.command.opcode === "BARGE_IN" ? 8.0 : 4.0;

    if (frame.command.opcode === "SCENE_OPEN") {
      artifact.targetY = 292;
    }

    if (frame.command.opcode === "NARRATE") {
      artifact.targetY = 284;
    }

    if (frame.command.opcode === "SPEAK") {
      // Speaking character steps slightly forward (up on stage = toward audience).
      artifact.targetY = 278;
      artifact.lerpSpeed = 4.0;
    }

    if (frame.command.opcode === "BARGE_IN") {
      artifact.targetY = 276;
      artifact.targetX = clamp(artifact.x + artifact.direction * 16, 90, (canvas?.width ?? 720) - 90);
      artifact.direction *= -1;
    }

    if (frame.command.opcode === "SCENE_CLOSE") {
      artifact.targetY = 300;
      artifact.pulse = 0;
      transition?.fadeToBlack();
    }

    // Stage movement opcodes — set targetX for smooth position lerp by rAF loop.
    if (frame.command.opcode === "ENTER") {
      const from = frame.command.payload.from === "right" ? "offscreen_right" : "offscreen_left";
      const to = frame.command.payload.to ?? "center";
      // Teleport to offscreen start immediately; lerp handles the smooth entry.
      artifact.x = STAGE_ZONES[from] ?? -80;
      artifact.targetX = STAGE_ZONES[to] ?? STAGE_ZONES.center;
      artifact.targetY = 292;
      artifact.lerpSpeed = 2.5;
      // Villain enters from right (convention), so set direction to face inward.
      artifact.direction = from === "offscreen_right" ? -1 : 1;
    }

    if (frame.command.opcode === "EXIT") {
      const to = frame.command.payload.to === "right" ? "offscreen_right" : "offscreen_left";
      artifact.targetX = STAGE_ZONES[to] ?? -80;
      artifact.lerpSpeed = 2.5;
    }

    if (frame.command.opcode === "MOVE") {
      const to = frame.command.payload.to ?? "center";
      artifact.targetX = STAGE_ZONES[to] ?? artifact.x;
      artifact.lerpSpeed = 3.5;
      // Update facing direction based on movement direction.
      const dx = artifact.targetX - artifact.x;
      if (Math.abs(dx) > 10) {
        artifact.direction = dx > 0 ? 1 : -1;
      }
    }

    if (frame.command.opcode === "EMOTE") {
      // Store sustained emotion state — applied to idle pose until next EMOTE or opcode.
      artifact.emotion = frame.command.payload.emotion ?? null;
    }
  };

  const resetState = () => {
    state.beat = 0;
    state.lastLabel = "idle";
    state.artifacts = {};
    state.texturePatternCache = new Map();
    state.imagePatternCache = new Map();
    drawStage();
  };

  const stop = () => {
    if (timerId !== null) {
      clearInterval(timerId);
      timerId = null;
    }
  };

  return {
    reset: () => {
      stop();
      stopAnimation();
      frames = [];
      frameIndex = 0;
      state.backdropImage = null;
      state.characterPortraits = new Map();
      state.characterParts = new Map();
      state.caption = null;
      if (state.captionTimer) {
        clearTimeout(state.captionTimer);
        state.captionTimer = null;
      }
      resetState();
    },
    loadFrames: (nextFrames) => {
      stop();
      frames = [...nextFrames];
      frameIndex = 0;
      resetState();
    },
    setStyle: (style) => {
      state.style = typeof style === "string" ? style : state.style;
      state.stageLook = createStageLook(state.style);
      state.texturePatternCache = new Map();
      state.imagePatternCache = new Map();
      drawStage();
    },
    setArtifactVisuals: (nextArtifactVisualsById) => {
      state.artifactVisualsById = isRecord(nextArtifactVisualsById) ? nextArtifactVisualsById : {};
      state.imagePatternCache = new Map();
      drawStage();
    },
    /**
     * Set AI-generated backdrop image URL for the stage.
     * Falls back to gradient when image fails to load.
     */
    setBackdrop: (imageUrl) => {
      if (!imageUrl) return;
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => {
        if (transition) {
          // Curtain close → swap backdrop → curtain open.
          transition.curtainClose(() => {
            state.backdropImage = img;
            drawStage();
            transition.curtainOpen();
          });
        } else {
          state.backdropImage = img;
          drawStage();
        }
      };
      img.onerror = () => {
        state.backdropImage = null;
      };
      img.src = imageUrl;
    },
    /**
     * Register an AI-generated character portrait for overlay on puppet silhouette.
     * Applies background removal so the character composites cleanly over backdrops.
     * If body-part URLs are provided, loads each part image with background removal for
     * articulated limb animation (6 parts: head, torso, leftArm, rightArm, leftLeg, rightLeg).
     *
     * @param {string} charId - Character identifier used as portrait map key.
     * @param {string} imageUrl - Full-body portrait URL or data URI.
     * @param {{ head, torso, leftArm, rightArm, leftLeg, rightLeg }|undefined} parts - Optional part image URLs.
     */
    setCharacterPortrait: (charId, imageUrl, parts) => {
      if (!charId || !imageUrl) return;
      // Skip background removal for stub /generated/ placeholders — they use leather rendering.
      if (imageUrl.includes("/generated/")) {
        const img = new Image();
        img.crossOrigin = "anonymous";
        img.onload = () => {
          state.characterPortraits.set(charId, img);
          drawStage();
        };
        img.src = imageUrl;
        return;
      }

      // Load main portrait with background removal.
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => {
        // Reason: AI generates on solid background — color-key it away so the character
        // composites cleanly over any scene backdrop without a colored rectangle.
        const cutout = removeBackground(img);
        state.characterPortraits.set(charId, cutout);
        drawStage();
      };
      img.onerror = () => {
        // On load failure keep any existing portrait entry unchanged.
        drawStage();
      };
      img.src = imageUrl;

      // Load 6 body parts with background removal for articulated animation.
      // Require at least one anchor part (torso or head) to begin loading.
      if (parts?.torso || parts?.head) {
        const partNames = ["head", "torso", "leftArm", "rightArm", "leftLeg", "rightLeg"];
        const partCanvases = {};
        let loadedCount = 0;
        const totalParts = partNames.length;

        for (const partName of partNames) {
          const partUrl = parts[partName];
          if (!partUrl) {
            loadedCount += 1;
            if (loadedCount === totalParts) {
              state.characterParts.set(charId, partCanvases);
              drawStage();
            }
            continue;
          }
          const partImg = new Image();
          partImg.crossOrigin = "anonymous";
          partImg.onload = () => {
            partCanvases[partName] = removeBackground(partImg);
            loadedCount += 1;
            if (loadedCount === totalParts) {
              state.characterParts.set(charId, partCanvases);
              drawStage();
            }
          };
          partImg.onerror = () => {
            loadedCount += 1;
            if (loadedCount === totalParts) {
              // Register whatever parts loaded successfully — partial articulation is fine.
              state.characterParts.set(charId, partCanvases);
              drawStage();
            }
          };
          partImg.src = partUrl;
        }
      }
    },
    /**
     * Show a caption on the stage canvas.
     * Auto-fades after duration proportional to word count (min 2s, max 8s).
     */
    setCaption: (text, speaker) => {
      if (state.captionTimer) {
        clearTimeout(state.captionTimer);
        state.captionTimer = null;
      }

      if (!text) {
        state.caption = null;
        drawStage();
        return;
      }

      state.caption = { text, speaker };
      drawStage();

      const wordCount = text.trim().split(/\s+/).length;
      const displayMs = Math.min(Math.max(wordCount * 400, 2000), 8000);
      state.captionTimer = setTimeout(() => {
        state.caption = null;
        state.captionTimer = null;
        drawStage();
      }, displayMs);
    },
    play: (onFrame) => {
      if (timerId !== null || frames.length === 0) {
        return;
      }

      // Start the 60fps render loop first — it will continuously animate puppets.
      startAnimation();

      // Beat-stream interval advances through NatyaScript frames at theatrical pace.
      timerId = setInterval(() => {
        if (frameIndex >= frames.length) {
          stop();
          // Keep animating after play ends for continuous idle movement.
          return;
        }

        const frame = frames[frameIndex];
        frameIndex += 1;
        applyFrame(frame);
        onFrame?.(frame, frameIndex, frames.length);
      }, 500);
    },
    pause: () => {
      stop();
      stopAnimation();
    },
    renderFrame: (frame) => {
      stop();
      applyFrame(frame);
      // Single frame preview: start animation so idle sway is visible.
      startAnimation();
    }
  };
};
