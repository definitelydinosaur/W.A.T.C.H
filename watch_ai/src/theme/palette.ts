import { contrastRatio, mixHex, readablePair, shiftHue, shiftLightness } from "./color";

export type ThemeSource = "default" | "university" | "logo";

export type ContrastReport = {
  textOnPrimary: number;
  textOnSurface: number;
  primaryOnSurface: number;
  passesAa: boolean;
  adjusted: boolean;
};

export type AppTheme = {
  id: string;
  name: string;
  source: ThemeSource;
  universityId: string | null;
  logoUri: string | null;
  gradient: [string, string, string];
  primary: string;
  primaryDark: string;
  accent: string;
  onPrimary: string;
  surface: string;
  text: string;
  muted: string;
  settingsGradient: [string, string, string];
  contrast: ContrastReport;
};

export const DEFAULT_THEME: AppTheme = {
  id: "default",
  name: "W.A.T.C.H.",
  source: "default",
  universityId: null,
  logoUri: null,
  gradient: ["#351356", "#511079", "#17152D"],
  primary: "#6738C7",
  primaryDark: "#382493",
  accent: "#4B32B5",
  onPrimary: "#FFFFFF",
  surface: "#FFFFFF",
  text: "#342448",
  muted: "#6E657C",
  settingsGradient: ["#F8F7FB", "#E7E1F3", "#CEC3E2"],
  contrast: {
    textOnPrimary: contrastRatio("#6738C7", "#FFFFFF"),
    textOnSurface: contrastRatio("#FFFFFF", "#342448"),
    primaryOnSurface: contrastRatio("#FFFFFF", "#6738C7"),
    passesAa: true,
    adjusted: false,
  },
};

type BuildInput = {
  id: string;
  name: string;
  source: ThemeSource;
  universityId?: string | null;
  logoUri?: string | null;
  primary: string;
  accent: string;
};

export function buildTheme(input: BuildInput): AppTheme {
  const pair = readablePair(input.primary, 4.5);
  const accentPair = readablePair(input.accent, 3);
  const surface = "#FFFFFF";
  const text = "#16141F";
  const muted = mixHex(text, surface, 0.42);
  const primary = pair.background;
  const accent = accentPair.background;
  const textOnSurface = contrastRatio(surface, text);
  const primaryOnSurface = contrastRatio(surface, primary);
  const passesAa = pair.ratio >= 4.5 && textOnSurface >= 4.5 && primaryOnSurface >= 3;

  return {
    id: input.id,
    name: input.name,
    source: input.source,
    universityId: input.universityId ?? null,
    logoUri: input.logoUri ?? null,
    gradient: [shiftLightness(primary, -0.18), primary, shiftLightness(accent, -0.22)],
    primary,
    primaryDark: shiftLightness(primary, -0.12),
    accent,
    onPrimary: pair.foreground,
    surface,
    text,
    muted,
    settingsGradient: [
      mixHex(primary, "#FFFFFF", 0.9),
      mixHex(primary, "#F4F1FA", 0.78),
      mixHex(accent, "#E7E1F3", 0.62),
    ],
    contrast: {
      textOnPrimary: Number(pair.ratio.toFixed(2)),
      textOnSurface: Number(textOnSurface.toFixed(2)),
      primaryOnSurface: Number(primaryOnSurface.toFixed(2)),
      passesAa,
      adjusted: pair.adjusted || accentPair.adjusted,
    },
  };
}

export function accentFromPrimary(primary: string) {
  return shiftHue(primary, 32);
}

function mixStops(
  from: [string, string, string],
  to: [string, string, string],
  amount: number,
): [string, string, string] {
  return [mixHex(from[0], to[0], amount), mixHex(from[1], to[1], amount), mixHex(from[2], to[2], amount)];
}

export function interpolateTheme(from: AppTheme, to: AppTheme, amount: number): AppTheme {
  const t = Math.max(0, Math.min(1, amount));
  if (t >= 1) return to;
  return {
    ...to,
    logoUri: t < 0.5 ? from.logoUri : to.logoUri,
    gradient: mixStops(from.gradient, to.gradient, t),
    primary: mixHex(from.primary, to.primary, t),
    primaryDark: mixHex(from.primaryDark, to.primaryDark, t),
    accent: mixHex(from.accent, to.accent, t),
    onPrimary: t < 0.5 ? from.onPrimary : to.onPrimary,
    surface: mixHex(from.surface, to.surface, t),
    text: mixHex(from.text, to.text, t),
    muted: mixHex(from.muted, to.muted, t),
    settingsGradient: mixStops(from.settingsGradient, to.settingsGradient, t),
  };
}

export function isAppTheme(value: unknown): value is AppTheme {
  if (!value || typeof value !== "object") return false;
  const theme = value as AppTheme;
  return Array.isArray(theme.gradient) && theme.gradient.length === 3 && typeof theme.primary === "string";
}