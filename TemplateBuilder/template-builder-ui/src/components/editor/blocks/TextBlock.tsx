// src/components/editor/blocks/TextBlock.tsx
// Added: Red underline for unknown {{tokens}} not in registry

import { useRef, useEffect } from 'react';

interface Props {
  content: string;
  onChange: (newContent: string) => void;
  onSelect: () => void;
  knownTokens?: Set<string>; // from placeholder registry
}

export default function TextBlock({ content, onChange, onSelect, knownTokens }: Props) {
  const divRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = divRef.current;
    if (!el) return;
    if (document.activeElement !== el) {
      el.innerHTML = highlight(content, knownTokens);
    }
  }, [content, knownTokens]);

  function handleInput() {
    const el = divRef.current;
    if (!el) return;
    onChange(el.innerText);
  }

  return (
    <div
      ref={divRef}
      contentEditable
      suppressContentEditableWarning
      onInput={handleInput}
      onClick={(e) => {
        e.stopPropagation();
        onSelect();
      }}
      style={{
        ...styles.textArea,
        minHeight: '48px',
      }}
      data-placeholder="Type your text here. Use {{ to insert a placeholder..."
    />
  );
}

function highlight(text: string, knownTokens?: Set<string>): string {
  const escaped = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  return escaped.replace(/\{\{([^}]+)\}\}/g, (_match, token) => {
    const name = token.trim();
    const isKnown = !knownTokens || knownTokens.size === 0 || knownTokens.has(name);

    if (isKnown) {
      // Known token — purple highlight
      return `<span style="
        background:var(--color-primary-50);
        color:var(--color-primary-800);
        font-family:var(--font-family-mono);
        font-size:13px;
        padding:1px 5px;
        border-radius:4px;
        font-weight:500;
      ">{{${name}}}</span>`;
    } else {
      // Unknown token — red underline + red text
      return `<span style="
        background:#fef2f2;
        color:#dc2626;
        font-family:var(--font-family-mono);
        font-size:13px;
        padding:1px 5px;
        border-radius:4px;
        font-weight:500;
        text-decoration:underline wavy #dc2626;
        text-decoration-skip-ink:none;
      " title="Unknown token — '${name}' not found in placeholder registry">{{${name}}}</span>`;
    }
  });
}

const styles: Record<string, React.CSSProperties> = {
  textArea: {
    fontSize: '14px',
    lineHeight: 1.8,
    color: '#334155',
    wordBreak: 'break-word',
    whiteSpace: 'pre-wrap',
    cursor: 'text',
  },
};

const s = document.createElement('style');
s.textContent = `
  [data-placeholder]:empty:before {
    content: attr(data-placeholder);
    color: #cbd5e1;
    font-style: italic;
    pointer-events: none;
  }
`;
document.head.appendChild(s);
