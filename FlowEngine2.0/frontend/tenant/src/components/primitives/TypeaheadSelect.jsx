import { useMemo, useRef, useState } from "react";
import { Tooltip } from "./Tooltip";

export function TypeaheadSelect({
  value,
  onInputChange,
  options,
  getKey,
  getLabel,
  getDetail,
  onSelect,
  placeholder = "Type to search...",
  emptyText = "No matches found.",
  startText = "Start typing to search.",
  inputStyle,
  disabled = false,
  minQueryLength = 1,
  selectOnFocus = false,
}) {
  const inputRef = useRef(null);
  const [focused, setFocused] = useState(false);
  const query = String(value || "").trim().toLowerCase();
  const showOptions = focused && query.length >= minQueryLength;

  function selectInputText(event) {
    if (selectOnFocus && value) {
      window.requestAnimationFrame(() => event.target.select());
    }
  }

  const visibleOptions = useMemo(() => {
    if (query.length < minQueryLength) return [];

    return (options || []).filter((option) => {
      const text = `${getLabel(option)} ${getDetail?.(option) || ""}`.toLowerCase();
      return text.includes(query);
    });
  }, [getDetail, getLabel, minQueryLength, options, query]);

  return (
    <div data-typeahead style={{ position: "relative" }}>
      <input
        ref={inputRef}
        value={value}
        disabled={disabled}
        onChange={(event) => onInputChange(event.target.value)}
        onFocus={(event) => {
          setFocused(true);
          selectInputText(event);
        }}
        onClick={(event) => {
          setFocused(true);
          selectInputText(event);
        }}
        onBlur={() => window.setTimeout(() => setFocused(false), 120)}
        placeholder={placeholder}
        style={inputStyle}
      />
      {focused ? (
        <div
          className="typeahead-menu"
          style={{
            display: "grid",
            gap: "2px",
            marginTop: "var(--space-2)",
            maxHeight: "240px",
            overflowY: "auto",
            padding: "var(--space-1)",
            borderRadius: "12px",
            border: "1px solid var(--color-border-soft)",
            background: "var(--color-bg-surface)",
            boxShadow: showOptions ? "var(--shadow-md)" : "none",
          }}
        >
          {!showOptions ? (
            <div style={{ padding: "9px 10px", color: "var(--color-text-muted)", fontSize: "var(--font-size-xs)" }}>
              {startText}
            </div>
          ) : visibleOptions.length === 0 ? (
            <div style={{ padding: "9px 10px", color: "var(--color-text-muted)", fontSize: "var(--font-size-xs)" }}>
              {emptyText}
            </div>
          ) : (
            visibleOptions.map((option) => (
              <Tooltip key={getKey(option)} fullWidth content={`Select ${getLabel(option)}`}>
                <button
                  type="button"
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => {
                    onSelect(option);
                    setFocused(false);
                    inputRef.current?.blur();
                  }}
                  style={{
                    width: "100%",
                    border: "none",
                    borderRadius: "8px",
                    background: "transparent",
                    padding: "7px 9px",
                    textAlign: "left",
                    cursor: "pointer",
                  }}
                >
                  <div style={{ fontWeight: "var(--font-weight-semibold)", color: "var(--color-text-strong)", fontSize: "var(--font-size-xs)" }}>
                    {getLabel(option)}
                  </div>
                  {getDetail ? (
                    <div style={{ color: "var(--color-text-muted)", fontSize: "11px", marginTop: "1px" }}>
                      {getDetail(option)}
                    </div>
                  ) : null}
                </button>
              </Tooltip>
            ))
          )}
        </div>
      ) : null}
    </div>
  );
}
