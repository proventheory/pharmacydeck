/**
 * Design tokens as JS/TS for use in React (e.g. style prop or Tailwind config).
 */
export const tokens = {
  colors: {
    bg: "var(--pd-color-bg)",
    bgCard: "var(--pd-color-bg-card)",
    border: "var(--pd-color-border)",
    borderHover: "var(--pd-color-border-hover)",
    text: "var(--pd-color-text)",
    textMuted: "var(--pd-color-text-muted)",
    textSubtle: "var(--pd-color-text-subtle)",
    accent: "var(--pd-color-accent)",
    accentHover: "var(--pd-color-accent-hover)",
    success: "var(--pd-color-success)",
    warning: "var(--pd-color-warning)",
    error: "var(--pd-color-error)",
  },
  font: {
    sans: "var(--pd-font-sans)",
    mono: "var(--pd-font-mono)",
    size: {
      xs: "var(--pd-text-xs)",
      sm: "var(--pd-text-sm)",
      base: "var(--pd-text-base)",
      lg: "var(--pd-text-lg)",
      xl: "var(--pd-text-xl)",
      "2xl": "var(--pd-text-2xl)",
      "3xl": "var(--pd-text-3xl)",
    },
    weight: { medium: 500, semibold: 600, bold: 700 },
  },
  space: {
    1: "var(--pd-space-1)",
    2: "var(--pd-space-2)",
    3: "var(--pd-space-3)",
    4: "var(--pd-space-4)",
    6: "var(--pd-space-6)",
    8: "var(--pd-space-8)",
    10: "var(--pd-space-10)",
  },
  radius: "var(--pd-radius)",
  shadow: { sm: "var(--pd-shadow-sm)", md: "var(--pd-shadow-md)" },
} as const;
