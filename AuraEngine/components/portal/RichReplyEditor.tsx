// AuraEngine/components/portal/RichReplyEditor.tsx
//
// Lightweight contentEditable rich-text editor for inbox replies. Uncontrolled
// (React never rewrites innerHTML after mount, so the caret is never reset); the
// parent reads the HTML via the imperative handle on send.

import React, { forwardRef, useImperativeHandle, useRef } from 'react';
import { Bold, Italic, Link2, List } from 'lucide-react';

export interface RichReplyHandle {
  getHtml: () => string;
  isEmpty: () => boolean;
  clear: () => void;
}

interface Props {
  placeholder?: string;
  onInput?: () => void;
}

const RichReplyEditor = forwardRef<RichReplyHandle, Props>(({ placeholder, onInput }, ref) => {
  const el = useRef<HTMLDivElement>(null);

  useImperativeHandle(ref, () => ({
    getHtml: () => el.current?.innerHTML ?? '',
    isEmpty: () => !(el.current?.textContent ?? '').trim(),
    clear: () => { if (el.current) el.current.innerHTML = ''; },
  }));

  const exec = (cmd: string, val?: string) => {
    el.current?.focus();
    document.execCommand(cmd, false, val);
    onInput?.();
  };
  const addLink = () => {
    const url = window.prompt('Link URL');
    if (url) exec('createLink', /^https?:\/\//i.test(url) ? url : `https://${url}`);
  };

  const btn = 'p-1.5 rounded-md text-slate-500 hover:text-slate-800 hover:bg-slate-100 transition-colors';

  return (
    <div className="border border-slate-200 rounded-xl bg-white overflow-hidden focus-within:border-indigo-300 transition-colors">
      <div className="flex items-center gap-0.5 px-2 py-1 border-b border-slate-100">
        <button type="button" onMouseDown={e => { e.preventDefault(); exec('bold'); }} className={btn} title="Bold"><Bold className="w-3.5 h-3.5" /></button>
        <button type="button" onMouseDown={e => { e.preventDefault(); exec('italic'); }} className={btn} title="Italic"><Italic className="w-3.5 h-3.5" /></button>
        <button type="button" onMouseDown={e => { e.preventDefault(); exec('insertUnorderedList'); }} className={btn} title="Bulleted list"><List className="w-3.5 h-3.5" /></button>
        <button type="button" onMouseDown={e => { e.preventDefault(); addLink(); }} className={btn} title="Insert link"><Link2 className="w-3.5 h-3.5" /></button>
      </div>
      <div
        ref={el}
        contentEditable
        role="textbox"
        aria-multiline="true"
        data-placeholder={placeholder ?? 'Write a reply…'}
        onInput={() => onInput?.()}
        className="rich-reply min-h-[7rem] max-h-72 overflow-y-auto px-3 py-2 text-sm text-slate-800 outline-none [&_a]:text-indigo-600 [&_a]:underline [&_ul]:list-disc [&_ul]:pl-5"
        suppressContentEditableWarning
      />
      <style>{`.rich-reply:empty:before{content:attr(data-placeholder);color:#94a3b8;pointer-events:none;}`}</style>
    </div>
  );
});

RichReplyEditor.displayName = 'RichReplyEditor';
export default RichReplyEditor;
