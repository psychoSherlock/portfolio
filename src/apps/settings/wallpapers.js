// Built-in "dynamic" wallpapers: soft mesh gradients generated as SVG data URLs.
// They are stored in settings.wallpaper as plain URL strings, so the desktop needs no special handling.

const W = 1600;
const H = 1000;

/**
 * @param {string[]} base   two or three stops for the diagonal base gradient
 * @param {Array<[number, number, number, string, number?]>} blobs  [cx%, cy%, r%, color, opacity]
 */
function mesh(base, blobs) {
  const stops = base
    .map((c, i) => `<stop offset="${(i / (base.length - 1)).toFixed(2)}" stop-color="${c}"/>`)
    .join("");
  const defs = blobs
    .map(
      ([cx, cy, r, color, opacity = 0.9], i) =>
        `<radialGradient id="b${i}" gradientUnits="userSpaceOnUse" cx="${(cx / 100) * W}" cy="${(cy / 100) * H}" r="${(r / 100) * W}">` +
        `<stop offset="0" stop-color="${color}" stop-opacity="${opacity}"/>` +
        `<stop offset="1" stop-color="${color}" stop-opacity="0"/></radialGradient>`
    )
    .join("");
  const rects = blobs.map((_, i) => `<rect width="${W}" height="${H}" fill="url(#b${i})"/>`).join("");
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid slice">` +
    `<defs><linearGradient id="base" x1="0" y1="0" x2="1" y2="1">${stops}</linearGradient>${defs}</defs>` +
    `<rect width="${W}" height="${H}" fill="url(#base)"/>${rects}</svg>`;
  // Fully percent-encoded: safe inside url("…") and in CSS/HTML attributes.
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

export const GRADIENT_WALLPAPERS = [
  {
    id: "sherlock",
    name: "Sherlock Purple",
    url: mesh(
      ["#12061f", "#2a0f4d", "#0b0614"],
      [
        [22, 28, 46, "#b05cff", 0.95],
        [82, 18, 38, "#ff4fd8", 0.55],
        [70, 88, 50, "#5b2bff", 0.8],
        [8, 96, 34, "#00d0ff", 0.35],
      ]
    ),
  },
  {
    id: "midnight",
    name: "Midnight",
    url: mesh(
      ["#03060f", "#0a1730", "#02040a"],
      [
        [78, 22, 44, "#1f6bff", 0.75],
        [18, 82, 46, "#3a2bd6", 0.7],
        [52, 50, 30, "#00b3ff", 0.25],
      ]
    ),
  },
  {
    id: "hackthebox",
    name: "Terminal Green",
    url: mesh(
      ["#04100a", "#0a1f14", "#020805"],
      [
        [20, 24, 42, "#9fef00", 0.55],
        [84, 78, 48, "#00c46a", 0.6],
        [70, 12, 30, "#00e5c0", 0.3],
      ]
    ),
  },
  {
    id: "sunset",
    name: "Sunset",
    url: mesh(
      ["#2b0a3d", "#b3305b", "#ff9f0a"],
      [
        [84, 84, 50, "#ffcf5c", 0.85],
        [14, 16, 44, "#5b2bff", 0.75],
        [60, 36, 34, "#ff375f", 0.6],
      ]
    ),
  },
  {
    id: "aurora",
    name: "Aurora",
    url: mesh(
      ["#031a26", "#06343f", "#0a1030"],
      [
        [26, 72, 46, "#30d158", 0.6],
        [74, 26, 44, "#64d2ff", 0.7],
        [90, 90, 38, "#b05cff", 0.55],
      ]
    ),
  },
  {
    id: "ember",
    name: "Ember",
    url: mesh(
      ["#140405", "#3a0a0f", "#0d0304"],
      [
        [24, 78, 48, "#ff453a", 0.75],
        [80, 30, 40, "#ff9f0a", 0.6],
        [52, 6, 30, "#ff375f", 0.4],
      ]
    ),
  },
  {
    id: "ocean",
    name: "Ocean",
    url: mesh(
      ["#0a84ff", "#0b4fb3", "#061a44"],
      [
        [16, 14, 44, "#64d2ff", 0.85],
        [86, 84, 50, "#102a8a", 0.9],
        [66, 28, 30, "#5ef2d6", 0.45],
      ]
    ),
  },
  {
    id: "dawn",
    name: "Dawn",
    url: mesh(
      ["#ffd9c7", "#f6b6d6", "#b9c8ff"],
      [
        [16, 82, 46, "#ffb37a", 0.85],
        [82, 16, 44, "#9db4ff", 0.85],
        [52, 46, 32, "#ffffff", 0.5],
      ]
    ),
  },
  {
    id: "graphite",
    name: "Graphite",
    url: mesh(
      ["#17171a", "#2c2c31", "#0c0c0e"],
      [
        [24, 20, 44, "#6e6e78", 0.55],
        [82, 86, 48, "#3a3a44", 0.8],
      ]
    ),
  },
  {
    id: "sky",
    name: "Daylight",
    url: mesh(
      ["#dff3ff", "#a8d8ff", "#7fb4ff"],
      [
        [80, 12, 42, "#ffffff", 0.9],
        [14, 90, 48, "#5aa0ff", 0.75],
        [50, 60, 30, "#c9b8ff", 0.45],
      ]
    ),
  },
];

const byUrl = new Map(GRADIENT_WALLPAPERS.map((g) => [g.url, g]));
export const gradientByUrl = (url) => byUrl.get(url) || null;
