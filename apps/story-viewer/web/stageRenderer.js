import {
  createLeatherTextureRecipe,
  createPuppetPalette,
  createPuppetPose,
  createStageLook
} from "./puppetVisuals.js";

const ensureArtifact = (state, artifactId) => {
  if (!state.artifacts[artifactId]) {
    const index = Object.keys(state.artifacts).length;
    state.artifacts[artifactId] = {
      x: 140 + index * 190,
      y: 292,
      pulse: 0,
      lastOpcode: "INIT",
      lastPayload: {},
      swayOffset: index * 0.83,
      direction: index % 2 === 0 ? 1 : -1
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
  const gradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
  gradient.addColorStop(0, stageLook.top);
  gradient.addColorStop(0.52, stageLook.mid);
  gradient.addColorStop(1, stageLook.bottom);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

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

const drawPuppet = (ctx, artifactId, artifact, state) => {
  const palette = createPuppetPalette(artifactId);
  const role = palette.role;
  const recipe = createLeatherTextureRecipe(artifactId);
  const previewUrl = state.artifactVisualsById[artifactId]?.previewUrl;
  const imagePattern = getImagePattern(ctx, state, previewUrl);
  const texturePattern = imagePattern ?? getLeatherPattern(ctx, state, artifactId, palette, recipe);
  const pose = createPuppetPose({
    role,
    opcode: artifact.lastOpcode,
    beat: state.beat,
    payload: artifact.lastPayload,
    direction: artifact.direction
  });
  const sway = Math.sin((state.beat + artifact.swayOffset) * 0.75) * 4;
  const pulseLift = artifact.lastOpcode === "BARGE_IN" ? 11 : artifact.lastOpcode === "GESTURE" ? 7 : 0;
  const x = artifact.x + sway * artifact.direction + pose.swayPx;
  const y = artifact.y - pulseLift - pose.torsoLift;

  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(toRadians(pose.torsoTiltDeg));
  ctx.globalAlpha = 0.98;

  const wrists = drawPuppetFigure(ctx, palette, recipe, texturePattern, role, pose);

  ctx.strokeStyle = palette.rod;
  ctx.lineWidth = 2;
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
    requestRedraw: null
  };

  let frames = [];
  let frameIndex = 0;
  let timerId = null;

  const drawStage = () => {
    if (!ctx || !canvas) {
      return;
    }

    drawBackdrop(ctx, canvas, state);

    for (const [artifactId, artifact] of Object.entries(state.artifacts)) {
      drawPuppet(ctx, artifactId, artifact, state);
    }

    ctx.fillStyle = state.stageLook.text;
    ctx.font = "bold 13px Trebuchet MS";
    ctx.fillText(`Frame: ${state.lastLabel}`, 14, 24);
  };

  state.requestRedraw = () => {
    drawStage();
  };

  const applyFrame = (frame) => {
    state.beat = frame.beat;
    state.lastLabel = frame.label;

    const artifactId = frame.command?.target?.artifactId;
    if (!artifactId) {
      drawStage();
      return;
    }

    const artifact = ensureArtifact(state, artifactId);
    artifact.lastOpcode = frame.command.opcode;
    artifact.lastPayload = frame.command.payload ?? {};
    artifact.pulse = frame.command.opcode === "GESTURE" ? 8 : frame.command.opcode === "BARGE_IN" ? 12 : 0;

    if (frame.command.opcode === "SCENE_OPEN") {
      artifact.y = 292;
    }

    if (frame.command.opcode === "NARRATE") {
      artifact.y = 284;
    }

    if (frame.command.opcode === "BARGE_IN") {
      artifact.y = 276;
      artifact.x = clamp(artifact.x + artifact.direction * 16, 90, (canvas?.width ?? 720) - 90);
      artifact.direction *= -1;
    }

    if (frame.command.opcode === "SCENE_CLOSE") {
      artifact.y = 300;
      artifact.pulse = 0;
    }

    drawStage();
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
      frames = [];
      frameIndex = 0;
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
    play: (onFrame) => {
      if (timerId !== null || frames.length === 0) {
        return;
      }

      timerId = setInterval(() => {
        if (frameIndex >= frames.length) {
          stop();
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
    },
    renderFrame: (frame) => {
      stop();
      applyFrame(frame);
    }
  };
};
