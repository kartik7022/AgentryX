import { useEffect } from "react";
import { themeTokens } from "./tokens";

function flatten(prefix, value, target) {
  if (typeof value === "string") {
    target[prefix] = value;
    return target;
  }

  Object.entries(value).forEach(([key, next]) => {
    flatten(`${prefix}-${key}`, next, target);
  });

  return target;
}

function buildCssVariables(tokens) {
  const flat = flatten("theme", tokens, {});

  return {
    "--color-bg-canvas": flat["theme-color-bg-canvas"],
    "--color-bg-surface": flat["theme-color-bg-surface"],
    "--color-bg-muted": flat["theme-color-bg-muted"],
    "--color-bg-subtle": flat["theme-color-bg-subtle"],
    "--color-bg-elevated": flat["theme-color-bg-elevated"],
    "--color-text-strong": flat["theme-color-text-strong"],
    "--color-text-base": flat["theme-color-text-base"],
    "--color-text-muted": flat["theme-color-text-muted"],
    "--color-text-soft": flat["theme-color-text-soft"],
    "--color-text-inverse": flat["theme-color-text-inverse"],
    "--color-text-brand": flat["theme-color-text-brand"],
    "--color-border-soft": flat["theme-color-border-soft"],
    "--color-border-base": flat["theme-color-border-base"],
    "--color-border-strong": flat["theme-color-border-strong"],
    "--color-primary-50": flat["theme-color-primary-50"],
    "--color-primary-100": flat["theme-color-primary-100"],
    "--color-primary-200": flat["theme-color-primary-200"],
    "--color-primary-600": flat["theme-color-primary-600"],
    "--color-primary-700": flat["theme-color-primary-700"],
    "--color-primary-800": flat["theme-color-primary-800"],
    "--color-accent-50": flat["theme-color-accent-50"],
    "--color-accent-100": flat["theme-color-accent-100"],
    "--color-accent-500": flat["theme-color-accent-500"],
    "--color-accent-700": flat["theme-color-accent-700"],
    "--color-status-success-bg": flat["theme-color-status-successBg"],
    "--color-status-success-text": flat["theme-color-status-successText"],
    "--color-status-success-border": flat["theme-color-status-successBorder"],
    "--color-status-warning-bg": flat["theme-color-status-warningBg"],
    "--color-status-warning-text": flat["theme-color-status-warningText"],
    "--color-status-warning-border": flat["theme-color-status-warningBorder"],
    "--color-status-error-bg": flat["theme-color-status-errorBg"],
    "--color-status-error-text": flat["theme-color-status-errorText"],
    "--color-status-error-border": flat["theme-color-status-errorBorder"],
    "--color-status-info-bg": flat["theme-color-status-infoBg"],
    "--color-status-info-text": flat["theme-color-status-infoText"],
    "--color-status-info-border": flat["theme-color-status-infoBorder"],
    "--color-overlay-scrim": flat["theme-color-overlay-scrim"],
    "--color-overlay-tooltip": flat["theme-color-overlay-tooltip"],
    "--font-family-sans": flat["theme-typography-family-sans"],
    "--font-family-mono": flat["theme-typography-family-mono"],
    "--font-size-xs": flat["theme-typography-size-xs"],
    "--font-size-sm": flat["theme-typography-size-sm"],
    "--font-size-md": flat["theme-typography-size-md"],
    "--font-size-lg": flat["theme-typography-size-lg"],
    "--font-size-xl": flat["theme-typography-size-xl"],
    "--font-size-2xl": flat["theme-typography-size-2xl"],
    "--font-size-3xl": flat["theme-typography-size-3xl"],
    "--font-weight-regular": flat["theme-typography-weight-regular"],
    "--font-weight-medium": flat["theme-typography-weight-medium"],
    "--font-weight-semibold": flat["theme-typography-weight-semibold"],
    "--font-weight-bold": flat["theme-typography-weight-bold"],
    "--font-weight-extrabold": flat["theme-typography-weight-extrabold"],
    "--line-height-tight": flat["theme-typography-lineHeight-tight"],
    "--line-height-snug": flat["theme-typography-lineHeight-snug"],
    "--line-height-base": flat["theme-typography-lineHeight-base"],
    "--line-height-relaxed": flat["theme-typography-lineHeight-relaxed"],
    "--tracking-tight": flat["theme-typography-tracking-tight"],
    "--tracking-normal": flat["theme-typography-tracking-normal"],
    "--tracking-wide": flat["theme-typography-tracking-wide"],
    "--radius-xs": flat["theme-radius-xs"],
    "--radius-sm": flat["theme-radius-sm"],
    "--radius-md": flat["theme-radius-md"],
    "--radius-lg": flat["theme-radius-lg"],
    "--radius-pill": flat["theme-radius-pill"],
    "--space-1": flat["theme-spacing-1"],
    "--space-2": flat["theme-spacing-2"],
    "--space-3": flat["theme-spacing-3"],
    "--space-4": flat["theme-spacing-4"],
    "--space-5": flat["theme-spacing-5"],
    "--space-6": flat["theme-spacing-6"],
    "--space-7": flat["theme-spacing-7"],
    "--space-8": flat["theme-spacing-8"],
    "--space-10": flat["theme-spacing-10"],
    "--space-12": flat["theme-spacing-12"],
    "--space-16": flat["theme-spacing-16"],
    "--shadow-sm": flat["theme-shadow-sm"],
    "--shadow-md": flat["theme-shadow-md"],
    "--shadow-lg": flat["theme-shadow-lg"],
  };
}

export function ThemeProvider({ children }) {
  useEffect(() => {
    const root = document.documentElement;
    const variables = buildCssVariables(themeTokens);

    Object.entries(variables).forEach(([key, value]) => {
      root.style.setProperty(key, value);
    });

    root.dataset.theme = "light";
  }, []);

  return children;
}
