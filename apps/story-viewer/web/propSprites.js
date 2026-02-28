/**
 * propSprites.js — Canvas 2D inline prop drawing for Story AI stage.
 * Each draw function centers the prop at (x, y) where y is the prop's base (floor level).
 * All props are drawn with Canvas 2D primitives — no external image assets required.
 * Each prop is sized to fit within ~60×80px at scale=1.0.
 */

const drawPot = (ctx, x, y, s) => {
  ctx.save(); ctx.translate(x, y);
  // Base ellipse (pot body, earthen clay color)
  ctx.beginPath(); ctx.ellipse(0, -20*s, 18*s, 22*s, 0, 0, Math.PI*2);
  ctx.fillStyle = "#c4712a"; ctx.fill();
  ctx.strokeStyle = "#8b4513"; ctx.lineWidth = 1.5*s; ctx.stroke();
  // Narrow neck
  ctx.beginPath(); ctx.ellipse(0, -40*s, 8*s, 5*s, 0, 0, Math.PI*2);
  ctx.fillStyle = "#b05a1c"; ctx.fill();
  // Rim
  ctx.beginPath(); ctx.ellipse(0, -44*s, 10*s, 3*s, 0, 0, Math.PI*2);
  ctx.fillStyle = "#d48030"; ctx.fill(); ctx.stroke();
  // Highlight shimmer
  ctx.beginPath(); ctx.ellipse(-6*s, -24*s, 4*s, 7*s, -0.3, 0, Math.PI*2);
  ctx.fillStyle = "rgba(255,200,140,0.28)"; ctx.fill();
  // Water line (subtle blue inside neck opening)
  ctx.beginPath(); ctx.ellipse(0, -41*s, 7*s, 2*s, 0, 0, Math.PI*2);
  ctx.fillStyle = "rgba(80,160,230,0.5)"; ctx.fill();
  ctx.restore();
};

const drawStonePile = (ctx, x, y, s) => {
  ctx.save(); ctx.translate(x, y);
  const stones = [
    {dx:0,dy:-6,rx:9,ry:7}, {dx:-11,dy:-2,rx:7,ry:5.5}, {dx:11,dy:-2,rx:7,ry:5.5},
    {dx:-5,dy:-14,rx:6,ry:5}, {dx:6,dy:-13,rx:5.5,ry:4.5}
  ];
  for (const st of stones) {
    ctx.beginPath(); ctx.ellipse(st.dx*s, st.dy*s, st.rx*s, st.ry*s, 0, 0, Math.PI*2);
    ctx.fillStyle = "#8a8a8a"; ctx.fill();
    ctx.strokeStyle = "#555"; ctx.lineWidth = 0.8; ctx.stroke();
    // Highlight
    ctx.beginPath(); ctx.ellipse((st.dx-2)*s, (st.dy-2)*s, st.rx*0.4*s, st.ry*0.35*s, 0, 0, Math.PI*2);
    ctx.fillStyle = "rgba(255,255,255,0.18)"; ctx.fill();
  }
  ctx.restore();
};

const drawWaterJug = (ctx, x, y, s) => {
  ctx.save(); ctx.translate(x, y);
  ctx.beginPath(); ctx.ellipse(0, -18*s, 12*s, 18*s, 0, 0, Math.PI*2);
  ctx.fillStyle = "#7ba7bc"; ctx.fill();
  ctx.strokeStyle = "#4a7a96"; ctx.lineWidth = 1.5*s; ctx.stroke();
  // Handle
  ctx.beginPath(); ctx.arc(14*s, -18*s, 8*s, -Math.PI*0.6, Math.PI*0.6);
  ctx.strokeStyle = "#4a7a96"; ctx.lineWidth = 3*s; ctx.stroke();
  // Spout
  ctx.beginPath(); ctx.ellipse(0, -34*s, 6*s, 3*s, 0, 0, Math.PI*2);
  ctx.fillStyle = "#4a7a96"; ctx.fill();
  ctx.restore();
};

const drawFruitBasket = (ctx, x, y, s) => {
  ctx.save(); ctx.translate(x, y);
  // Basket body
  ctx.beginPath(); ctx.ellipse(0, -10*s, 16*s, 10*s, 0, 0, Math.PI*2);
  ctx.fillStyle = "#c8942a"; ctx.fill();
  ctx.strokeStyle = "#8b6010"; ctx.lineWidth = 1.5; ctx.stroke();
  // Weave lines
  for (let i = -12; i <= 12; i += 6) {
    ctx.beginPath(); ctx.moveTo(i*s, -1*s); ctx.lineTo(i*s, -19*s);
    ctx.strokeStyle = "rgba(100,60,0,0.3)"; ctx.lineWidth = 1; ctx.stroke();
  }
  // Fruits (3 circles peeking over top)
  const fruits = [{dx:-7,c:"#e83030"},{dx:0,c:"#e8a020"},{dx:7,c:"#30a830"}];
  for (const f of fruits) {
    ctx.beginPath(); ctx.arc(f.dx*s, -20*s, 5*s, 0, Math.PI*2);
    ctx.fillStyle = f.c; ctx.fill();
    ctx.strokeStyle = "rgba(0,0,0,0.2)"; ctx.lineWidth = 0.5; ctx.stroke();
  }
  ctx.restore();
};

const drawLamp = (ctx, x, y, s) => {
  ctx.save(); ctx.translate(x, y);
  // Base
  ctx.beginPath(); ctx.ellipse(0, -3*s, 10*s, 3*s, 0, 0, Math.PI*2);
  ctx.fillStyle = "#d4a02a"; ctx.fill();
  // Stem
  ctx.fillRect(-3*s, -18*s, 6*s, 15*s);
  // Oil dish
  ctx.beginPath(); ctx.ellipse(0, -20*s, 10*s, 4*s, 0, 0, Math.PI*2);
  ctx.fillStyle = "#c88020"; ctx.fill();
  // Flame
  ctx.beginPath();
  ctx.moveTo(0, -24*s);
  ctx.bezierCurveTo(-4*s, -30*s, -3*s, -36*s, 0, -38*s);
  ctx.bezierCurveTo(3*s, -36*s, 4*s, -30*s, 0, -24*s);
  ctx.fillStyle = "#ff8c00"; ctx.fill();
  ctx.beginPath();
  ctx.moveTo(0, -26*s);
  ctx.bezierCurveTo(-2*s, -30*s, -1*s, -34*s, 0, -35*s);
  ctx.bezierCurveTo(1*s, -34*s, 2*s, -30*s, 0, -26*s);
  ctx.fillStyle = "#ffe040"; ctx.fill();
  ctx.restore();
};

/**
 * Draw a named prop sprite at (x, y) with the given scale.
 * (x, y) is the base (floor-level anchor), matching the character foot-anchor convention.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {string} propType - One of: "pot" | "stone_pile" | "water_jug" | "fruit_basket" | "lamp"
 * @param {number} x - Base X (horizontal center).
 * @param {number} y - Base Y (floor level).
 * @param {number} [scale=1.0] - Scale factor.
 */
export const drawPropSVG = (ctx, propType, x, y, scale = 1.0) => {
  switch (propType) {
    case "pot":          return drawPot(ctx, x, y, scale);
    case "stone_pile":   return drawStonePile(ctx, x, y, scale);
    case "water_jug":    return drawWaterJug(ctx, x, y, scale);
    case "fruit_basket": return drawFruitBasket(ctx, x, y, scale);
    case "lamp":         return drawLamp(ctx, x, y, scale);
    default: return;
  }
};
