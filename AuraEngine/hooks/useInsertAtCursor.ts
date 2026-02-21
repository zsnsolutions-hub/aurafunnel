// File: AuraEngine/hooks/useInsertAtCursor.ts
import { useRef, useCallback } from 'react';

export function useInsertAtCursor<T extends HTMLTextAreaElement | HTMLInputElement>(
  value: string,
  onChange: (v: string) => void,
) {
  const ref = useRef<T>(null);

  const insert = useCallback((text: string) => {
    const el = ref.current;
    const start = el?.selectionStart ?? value.length;
    const end = el?.selectionEnd ?? value.length;
    const next = value.slice(0, start) + text + value.slice(end);
    onChange(next);
    requestAnimationFrame(() => {
      if (!el) return;
      const pos = start + text.length;
      el.selectionStart = pos;
      el.selectionEnd = pos;
      el.focus();
    });
  }, [value, onChange]);

  return { ref, insert };
}
