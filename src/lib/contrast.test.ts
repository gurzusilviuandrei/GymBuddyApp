// Accessibility guard (audit I4): the colours in src/styles.css must keep enough contrast.
// Reads the real tokens, so a palette change that makes text hard to read fails here.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

type Rgb = [number, number, number]; // linear sRGB, 0..1

/** oklch(L C H) to linear sRGB, clamped. */
function oklch(L: number, C: number, hDeg: number): Rgb {
  const h = (hDeg * Math.PI) / 180;
  const a = C * Math.cos(h);
  const b = C * Math.sin(h);
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  const clamp = (v: number) => Math.min(1, Math.max(0, v));
  return [
    clamp(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
    clamp(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
    clamp(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s),
  ];
}

const luminance = ([r, g, b]: Rgb) => 0.2126 * r + 0.7152 * g + 0.0722 * b;
function contrast(x: Rgb, y: Rgb): number {
  const [hi, lo] = [luminance(x), luminance(y)].sort((p, q) => q - p) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}
const blend = (fg: Rgb, bg: Rgb, alpha: number): Rgb => [0, 1, 2].map((i) => fg[i]! * alpha + bg[i]! * (1 - alpha)) as Rgb;

const css = readFileSync(new URL("../styles.css", import.meta.url), "utf8");
const root = css.slice(css.indexOf(":root"), css.indexOf("}", css.indexOf(":root")));

function token(name: string): Rgb {
  const match = new RegExp(`--${name}:\\s*oklch\\(([\\d.]+)\\s+([\\d.]+)\\s+([\\d.]+)\\)`).exec(root);
  if (!match) throw new Error(`token --${name} not found in :root of styles.css`);
  return oklch(Number(match[1]), Number(match[2]), Number(match[3]));
}

const bg = token("background");
const card = token("card");
const secondary = token("secondary");

describe("text contrast (WCAG AA, 4.5:1)", () => {
  const surfaces: Array<[string, Rgb]> = [["background", bg], ["card", card], ["secondary", secondary]];
  for (const name of ["foreground", "muted-foreground", "primary", "destructive-text"]) {
    for (const [surface, colour] of surfaces) {
      it(`${name} on ${surface}`, () => {
        expect(contrast(token(name), colour)).toBeGreaterThanOrEqual(4.5);
      });
    }
  }

  it("button labels: dark text on the green button, white text on the solid red one", () => {
    expect(contrast(token("primary-foreground"), token("primary"))).toBeGreaterThanOrEqual(4.5);
    expect(contrast(token("destructive-foreground"), token("destructive"))).toBeGreaterThanOrEqual(4.5);
  });

  it("red text on the faint red tint behind it (error boxes)", () => {
    const tint = blend(token("destructive"), bg, 0.1);
    expect(contrast(token("destructive-text"), tint)).toBeGreaterThanOrEqual(4.5);
  });

  it("green text on the faint green tint behind it (badges)", () => {
    const tint = blend(token("primary"), card, 0.1);
    expect(contrast(token("primary"), tint)).toBeGreaterThanOrEqual(4.5);
  });
});

describe("outlines of form fields and switches (WCAG 1.4.11, 3:1)", () => {
  it("--input is clearly visible on the background and on cards", () => {
    expect(contrast(token("input"), bg)).toBeGreaterThanOrEqual(3);
    expect(contrast(token("input"), card)).toBeGreaterThanOrEqual(3);
  });
});
