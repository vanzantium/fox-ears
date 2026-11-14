import type { ThemeId } from "@/lib/hearing/types";

export type VizTheme = {
  id: ThemeId;
  label: string;
  bg: string;
  ink: string;
  bar: string;
  barHi: string;
  left: string;
  right: string;
  glow: string;
  mapLo: string;
  mapHi: string;
  grid: string;
};

export const THEMES: Record<ThemeId, VizTheme> = {
  bone: {
    id: "bone",
    label: "Bone",
    bg: "#0a0a0b",
    ink: "#eceae4",
    bar: "#d8d2c6",
    barHi: "#f4f1ea",
    left: "#c9c3b6",
    right: "#e7e1d4",
    glow: "rgba(232,226,214,0.16)",
    mapLo: "#1a1916",
    mapHi: "#e8e2d6",
    grid: "rgba(236,234,228,0.08)",
  },
  tide: {
    id: "tide",
    label: "Tide",
    bg: "#0a0a0b",
    ink: "#e6eef0",
    bar: "#9eb0b6",
    barHi: "#d5e4e8",
    left: "#7f9aa3",
    right: "#c5d4d8",
    glow: "rgba(158,176,182,0.18)",
    mapLo: "#14181a",
    mapHi: "#c5d4d8",
    grid: "rgba(230,238,240,0.08)",
  },
  ember: {
    id: "ember",
    label: "Ember",
    bg: "#0a0a0b",
    ink: "#f0e6de",
    bar: "#c9a798",
    barHi: "#edd4c6",
    left: "#b0897c",
    right: "#e0c4b4",
    glow: "rgba(201,167,152,0.18)",
    mapLo: "#1a1614",
    mapHi: "#e0c4b4",
    grid: "rgba(240,230,222,0.08)",
  },
  split: {
    id: "split",
    label: "Split",
    bg: "#0a0a0b",
    ink: "#eceae4",
    bar: "#cfc9bc",
    barHi: "#f3efe6",
    left: "#8ea0ae",
    right: "#cbb7a4",
    glow: "rgba(200,196,186,0.14)",
    mapLo: "#161616",
    mapHi: "#d8d2c6",
    grid: "rgba(236,234,228,0.08)",
  },
};

export const THEME_ORDER: ThemeId[] = ["bone", "tide", "ember", "split"];
