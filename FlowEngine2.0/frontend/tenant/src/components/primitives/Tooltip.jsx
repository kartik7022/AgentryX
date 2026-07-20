import { cloneElement, useId, useRef, useState } from "react";
import { tooltipTokens } from "../../theme/tooltip-tokens";

export function Tooltip({ content, children, fullWidth = false }) {
  const [visible, setVisible] = useState(false);
  const timeoutRef = useRef(null);
  const tooltipId = useId();

  const show = () => {
    timeoutRef.current = window.setTimeout(() => {
      setVisible(true);
    }, tooltipTokens.delayMs);
  };

  const hide = () => {
    window.clearTimeout(timeoutRef.current);
    setVisible(false);
  };

  const child = cloneElement(children, {
    "aria-describedby": tooltipId,
  });

  return (
    <span
      style={{
        position: "relative",
        display: fullWidth ? "flex" : "inline-flex",
        width: fullWidth ? "100%" : undefined,
      }}
      onMouseEnter={show}
      onMouseLeave={hide}
      onFocus={show}
      onBlur={hide}
    >
      {child}
      {visible && (
        <span
          id={tooltipId}
          role="tooltip"
          style={{
            position: "absolute",
            left: "50%",
            bottom: `calc(100% + ${tooltipTokens.offset}px)`,
            transform: "translateX(-50%)",
            maxWidth: tooltipTokens.maxWidth,
            padding: tooltipTokens.padding,
            borderRadius: tooltipTokens.radius,
            background: "var(--color-overlay-tooltip)",
            color: "var(--color-text-inverse)",
            fontFamily: tooltipTokens.fontFamily,
            fontSize: tooltipTokens.fontSize,
            fontWeight: tooltipTokens.fontWeight,
            lineHeight: tooltipTokens.lineHeight,
            whiteSpace: "normal",
            boxShadow: tooltipTokens.shadow,
            zIndex: 30,
          }}
        >
          {content}
        </span>
      )}
    </span>
  );
}
