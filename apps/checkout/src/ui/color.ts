/** Accent palettes and contrast math for store themes. */

// A merchant can pick any accentColor, including near-black — --pg-accent-2
// aliases straight to it (see body.has-custom-accent in style.css), so an
// unclamped dark accent collapses the storefront's gradient CTA and its glow
// to invisible against the dark page background. Raise perceived lightness to
// a floor that keeps it visibly distinct from --pg-page-bg while preserving
// the merchant's chosen hue.
export const MIN_ACCENT_LIGHTNESS = 0.35;
export const DEFAULT_ACCENT_PALETTES = {
  dark: { accent: "#818cf8", accent2: "#c084fc", contrast: "#000000" },
  light: { accent: "#4f46e5", accent2: "#7e22ce", contrast: "#ffffff" },
} as const;

export function clampAccentLightness(hex: string): string {
  const match = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!match) return hex;
  const r = parseInt(match[1].slice(0, 2), 16) / 255;
  const g = parseInt(match[1].slice(2, 4), 16) / 255;
  const b = parseInt(match[1].slice(4, 6), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (l >= MIN_ACCENT_LIGHTNESS) return hex;

  const d = max - min;
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
  let h = 0;
  if (d !== 0) {
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }

  const newL = MIN_ACCENT_LIGHTNESS;
  const c = (1 - Math.abs(2 * newL - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = newL - c / 2;
  let [r2, g2, b2] = [0, 0, 0];
  if (h < 60) [r2, g2, b2] = [c, x, 0];
  else if (h < 120) [r2, g2, b2] = [x, c, 0];
  else if (h < 180) [r2, g2, b2] = [0, c, x];
  else if (h < 240) [r2, g2, b2] = [0, x, c];
  else if (h < 300) [r2, g2, b2] = [x, 0, c];
  else [r2, g2, b2] = [c, 0, x];

  const toHex = (v: number) =>
    Math.round((v + m) * 255)
      .toString(16)
      .padStart(2, "0");
  return `#${toHex(r2)}${toHex(g2)}${toHex(b2)}`;
}

export function relativeLuminance(hex: string): number {
  const match = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!match) return 0;
  const channels = [0, 2, 4].map((offset) => parseInt(match[1].slice(offset, offset + 2), 16) / 255);
  const [r, g, b] = channels.map((channel) => (channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function colorContrastRatio(first: string, second: string): number {
  const firstLuminance = relativeLuminance(first);
  const secondLuminance = relativeLuminance(second);
  return (Math.max(firstLuminance, secondLuminance) + 0.05) / (Math.min(firstLuminance, secondLuminance) + 0.05);
}

export function binaryContrastColor(backgroundColor: string): "#ffffff" | "#000000" {
  const blackContrast = colorContrastRatio("#000000", backgroundColor);
  const whiteContrast = colorContrastRatio("#ffffff", backgroundColor);
  return blackContrast >= whiteContrast ? "#000000" : "#ffffff";
}

export function accentContrastColor(hex: string): "#ffffff" | "#000000" {
  return binaryContrastColor(hex);
}

export function backgroundTheme(backgroundColor: string | null): { light: boolean; textColor: "#000000" | "#ffffff" } {
  const effectiveBackground = backgroundColor && /^#[0-9a-f]{6}$/i.test(backgroundColor)
    ? backgroundColor
    : "#0a0a0a";
  const textColor = binaryContrastColor(effectiveBackground);
  return { light: textColor === "#000000", textColor };
}
