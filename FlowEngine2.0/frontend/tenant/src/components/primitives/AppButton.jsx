import { forwardRef } from "react";
import { buttonTokens } from "../../theme/button-tokens";
import { Tooltip } from "./Tooltip";

const variants = {
  primary: {
    background: "var(--color-primary-700)",
    color: "var(--color-text-strong)",
    border: "1px solid var(--color-primary-700)",
  },
  secondary: {
    background: "var(--color-bg-surface)",
    color: "var(--color-text-strong)",
    border: "1px solid var(--color-border-base)",
  },
  ghost: {
    background: "transparent",
    color: "var(--color-text-base)",
    border: "1px solid transparent",
  },
};

export const AppButton = forwardRef(function AppButton(
  {
    variant = "primary",
    size = "md",
    tooltip,
    fullWidth = false,
    disabled = false,
    loading = false,
    children,
    style,
    ...props
  },
  ref,
) {
  const variantStyle = variants[variant];
  const inferredLoading = typeof children === "string" && /\b\w+ing\.\.\.$/.test(children);
  const isLoading = loading || inferredLoading;
  const hoverStyles =
    variant === "primary"
      ? {
          background: "var(--color-primary-800)",
          borderColor: "var(--color-primary-800)",
        }
      : variant === "secondary"
        ? {
            background: "var(--color-bg-elevated)",
            borderColor: "var(--color-primary-200)",
          }
        : {
            background: "var(--color-primary-50)",
            color: "var(--color-primary-800)",
          };
  const fontSize =
    size === "sm"
      ? buttonTokens.font.sizeSm
      : size === "lg"
        ? buttonTokens.font.sizeLg
        : buttonTokens.font.sizeMd;

  const button = (
    <button
      ref={ref}
      disabled={disabled || isLoading}
      aria-busy={isLoading}
      {...props}
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        gap: buttonTokens.gap,
        width: fullWidth ? "100%" : "auto",
        minHeight: buttonTokens.height[size],
        padding: buttonTokens.padding[size],
        borderRadius: buttonTokens.radius,
        fontFamily: buttonTokens.font.family,
        fontSize,
        fontWeight: buttonTokens.font.weight,
        lineHeight: buttonTokens.font.lineHeight,
        letterSpacing: buttonTokens.font.letterSpacing,
        transition: "transform 120ms ease, background 120ms ease, border-color 120ms ease, opacity 120ms ease",
        boxShadow: variant === "primary" ? "var(--shadow-sm)" : "none",
        opacity: disabled ? 0.55 : 1,
        outline: "none",
        ...variantStyle,
        ...style,
      }}
      onMouseEnter={(event) => {
        props.onMouseEnter?.(event);
        if (disabled) return;
        Object.assign(event.currentTarget.style, hoverStyles);
      }}
      onMouseLeave={(event) => {
        props.onMouseLeave?.(event);
        Object.assign(event.currentTarget.style, {
          background: variantStyle.background,
          borderColor: variantStyle.border.replace("1px solid ", ""),
          color: variantStyle.color,
        });
      }}
      onMouseDown={(event) => {
        props.onMouseDown?.(event);
        if (disabled) return;
        event.currentTarget.style.transform = "translateY(1px)";
      }}
      onMouseUp={(event) => {
        props.onMouseUp?.(event);
        event.currentTarget.style.transform = "translateY(0)";
      }}
      onBlur={(event) => {
        props.onBlur?.(event);
        event.currentTarget.style.transform = "translateY(0)";
      }}
    >
      {isLoading ? <span className="button-spinner" aria-hidden="true" /> : null}
      {children}
    </button>
  );

  if (!tooltip) {
    return button;
  }

  return <Tooltip content={tooltip}>{button}</Tooltip>;
});
