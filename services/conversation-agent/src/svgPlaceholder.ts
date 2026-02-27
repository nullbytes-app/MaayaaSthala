/**
 * SVG placeholder generator for character assets.
 * Mirrors the pattern in services/resolver/src/httpServer.ts.
 */

const escapeSvgText = (value: string): string =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");

const hashString = (value: string): number => {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash += (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24);
  }

  return Math.abs(hash >>> 0);
};

/**
 * Generate an inline SVG data URI for a character placeholder.
 *
 * @param charId - Character ID used to derive a unique color scheme.
 * @param name - Character name displayed in the SVG.
 * @returns A `data:image/svg+xml` URI string.
 */
export const renderSvgPlaceholder = (charId: string, name: string): string => {
  const hash = hashString(charId);
  const hue = hash % 360;
  const hueDark = (hue + 18) % 360;
  const hueLight = (hue + 320) % 360;
  const title = escapeSvgText(name);

  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256" viewBox="0 0 256 256" role="img" aria-label="${title}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="hsl(${hueDark} 56% 22%)"/>
      <stop offset="100%" stop-color="hsl(${hue} 62% 33%)"/>
    </linearGradient>
    <linearGradient id="puppet" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="hsl(${hueLight} 68% 66%)"/>
      <stop offset="100%" stop-color="hsl(${hue} 58% 48%)"/>
    </linearGradient>
  </defs>
  <rect width="256" height="256" fill="url(#bg)"/>
  <g transform="translate(128 146)">
    <ellipse cx="0" cy="-56" rx="16" ry="20" fill="url(#puppet)"/>
    <path d="M -22 -37 Q -30 -11 -25 27 L -19 63 L 19 63 L 25 27 Q 30 -11 22 -37 Z" fill="url(#puppet)"/>
  </g>
  <text x="128" y="243" font-size="14" text-anchor="middle" fill="rgba(255,233,183,0.92)"
    font-family="Trebuchet MS, sans-serif">${title}</text>
</svg>`;

  return `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
};
