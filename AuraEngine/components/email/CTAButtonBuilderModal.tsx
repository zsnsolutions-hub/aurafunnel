import React, { useState, useEffect, useCallback } from 'react';
import { XIcon, CheckIcon, LinkIcon, CursorClickIcon } from '../Icons';
import {
  buildEmailCtaButtonHTML,
  getCtaPresets,
  saveCtaPreset,
  deleteCtaPreset,
  type CtaVariant,
  type CtaAlign,
  type CtaPreset,
} from '../../lib/emailCtaButton';

interface CTAButtonBuilderModalProps {
  open: boolean;
  onClose: () => void;
  onInsert: (html: string) => void;
}

const VARIANT_OPTIONS: { value: CtaVariant; label: string; desc: string }[] = [
  { value: 'primary', label: 'Primary', desc: 'Filled button' },
  { value: 'secondary', label: 'Secondary', desc: 'Outline button' },
  { value: 'minimal', label: 'Minimal', desc: 'Link style' },
];

const ALIGN_OPTIONS: { value: CtaAlign; label: string }[] = [
  { value: 'left', label: 'Left' },
  { value: 'center', label: 'Center' },
  { value: 'right', label: 'Right' },
];

const CTAButtonBuilderModal: React.FC<CTAButtonBuilderModalProps> = ({ open, onClose, onInsert }) => {
  const [text, setText] = useState('Book a Call');
  const [url, setUrl] = useState('');
  const [variant, setVariant] = useState<CtaVariant>('primary');
  const [align, setAlign] = useState<CtaAlign>('center');
  const [presets, setPresets] = useState<CtaPreset[]>([]);
  const [showLibrary, setShowLibrary] = useState(false);

  useEffect(() => {
    if (open) {
      setPresets(getCtaPresets());
    }
  }, [open]);

  const handleInsert = useCallback(() => {
    if (!text.trim() || !url.trim()) return;
    const html = buildEmailCtaButtonHTML({ text: text.trim(), url: url.trim(), variant, align });
    saveCtaPreset({ text: text.trim(), url: url.trim(), variant, align });
    onInsert(html);
    onClose();
  }, [text, url, variant, align, onInsert, onClose]);

  const handleLoadPreset = useCallback((preset: CtaPreset) => {
    setText(preset.text);
    setUrl(preset.url);
    setVariant(preset.variant);
    setAlign(preset.align);
    setShowLibrary(false);
  }, []);

  const handleDeletePreset = useCallback((id: string) => {
    deleteCtaPreset(id);
    setPresets(getCtaPresets());
  }, []);

  if (!open) return null;

  const previewHtml = text.trim() && url.trim()
    ? buildEmailCtaButtonHTML({ text: text.trim(), url: url.trim(), variant, align })
    : '';

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div
        className="bg-white rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden animate-in fade-in zoom-in-95 duration-200"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 pt-5 pb-4 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <CursorClickIcon className="w-5 h-5 text-indigo-600" />
            <span className="text-sm font-black text-slate-900">Insert CTA Button</span>
          </div>
          <div className="flex items-center space-x-2">
            {presets.length > 0 && (
              <button
                onClick={() => setShowLibrary(!showLibrary)}
                className={`px-2.5 py-1.5 rounded-lg text-[10px] font-bold transition-all border ${
                  showLibrary
                    ? 'bg-indigo-50 border-indigo-200 text-indigo-600'
                    : 'bg-slate-50 border-slate-200 text-slate-500 hover:bg-slate-100'
                }`}
              >
                Library ({presets.length})
              </button>
            )}
            <button onClick={onClose} className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-xl transition-all">
              <XIcon className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* CTA Library */}
        {showLibrary && presets.length > 0 && (
          <div className="px-6 py-3 bg-slate-50 border-b border-slate-100">
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Recent CTAs</p>
            <div className="space-y-1.5 max-h-32 overflow-y-auto">
              {presets.map(p => (
                <div key={p.id} className="flex items-center justify-between p-2 bg-white rounded-lg border border-slate-100 group">
                  <button
                    onClick={() => handleLoadPreset(p)}
                    className="flex items-center space-x-2 text-left flex-1 min-w-0"
                  >
                    <span className={`w-2 h-2 rounded-full shrink-0 ${
                      p.variant === 'primary' ? 'bg-indigo-600' : p.variant === 'secondary' ? 'border-2 border-indigo-600' : 'bg-slate-400'
                    }`} />
                    <span className="text-xs font-bold text-slate-700 truncate">{p.text}</span>
                    <span className="text-[10px] text-slate-400 truncate">{p.url}</span>
                  </button>
                  <button
                    onClick={() => handleDeletePreset(p.id)}
                    className="p-1 text-slate-300 hover:text-rose-500 opacity-0 group-hover:opacity-100 transition-all shrink-0"
                  >
                    <XIcon className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Body */}
        <div className="px-6 py-5 space-y-4">
          {/* Button Text */}
          <div>
            <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1.5">Button Text</label>
            <input
              type="text"
              value={text}
              onChange={e => setText(e.target.value)}
              placeholder="Book a Call"
              className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400 outline-none transition-all"
              autoFocus
            />
          </div>

          {/* URL */}
          <div>
            <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1.5">
              <span className="flex items-center space-x-1">
                <LinkIcon className="w-3 h-3" />
                <span>URL</span>
              </span>
            </label>
            <input
              type="url"
              value={url}
              onChange={e => setUrl(e.target.value)}
              placeholder="https://calendly.com/your-link"
              className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-mono focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400 outline-none transition-all"
            />
          </div>

          {/* Style Variant */}
          <div>
            <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1.5">Style</label>
            <div className="flex items-center space-x-2">
              {VARIANT_OPTIONS.map(v => (
                <button
                  key={v.value}
                  onClick={() => setVariant(v.value)}
                  className={`flex-1 px-3 py-2.5 rounded-xl text-xs font-bold transition-all border ${
                    variant === v.value
                      ? 'bg-indigo-50 border-indigo-200 text-indigo-700 shadow-sm'
                      : 'bg-white border-slate-200 text-slate-500 hover:bg-slate-50'
                  }`}
                >
                  <span className="block">{v.label}</span>
                  <span className="block text-[9px] font-medium mt-0.5 opacity-60">{v.desc}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Alignment */}
          <div>
            <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1.5">Alignment</label>
            <div className="flex items-center space-x-2">
              {ALIGN_OPTIONS.map(a => (
                <button
                  key={a.value}
                  onClick={() => setAlign(a.value)}
                  className={`px-4 py-2 rounded-xl text-xs font-bold transition-all border ${
                    align === a.value
                      ? 'bg-indigo-50 border-indigo-200 text-indigo-700'
                      : 'bg-white border-slate-200 text-slate-500 hover:bg-slate-50'
                  }`}
                >
                  {a.label}
                </button>
              ))}
            </div>
          </div>

          {/* Live Preview */}
          {previewHtml && (
            <div>
              <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1.5">Preview</label>
              <div
                className="p-4 bg-slate-50 border border-slate-200 rounded-xl"
                dangerouslySetInnerHTML={{ __html: previewHtml }}
              />
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-100 flex items-center justify-end space-x-2">
          <button
            onClick={onClose}
            className="px-4 py-2.5 text-slate-500 text-xs font-bold hover:text-slate-700 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleInsert}
            disabled={!text.trim() || !url.trim()}
            className="flex items-center space-x-2 px-5 py-2.5 bg-indigo-600 text-white rounded-xl text-xs font-bold hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-200 disabled:opacity-50"
          >
            <CheckIcon className="w-3.5 h-3.5" />
            <span>Insert CTA</span>
          </button>
        </div>
      </div>
    </div>
  );
};

export default CTAButtonBuilderModal;
