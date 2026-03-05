/**
 * MessageRow — memoized chat message component.
 *
 * - Only re-renders when content/status actually changes
 * - During streaming: renders plain text (fast)
 * - After completion: parses markdown via requestIdleCallback
 */

import React, { memo, useState, useEffect, useRef, useCallback } from 'react';
import {
  SparklesIcon, BoltIcon, CopyIcon, CheckIcon, StarIcon, DownloadIcon,
} from '../Icons';

interface MessageRowProps {
  id: string;
  role: 'user' | 'ai' | 'system';
  content: string;
  timestamp: Date;
  confidence?: number;
  isStreaming?: boolean;
  isPinned?: boolean;
  copiedId?: string | null;
  onCopy?: (id: string, content: string) => void;
  onPin?: (id: string) => void;
  onExport?: () => void;
  onSavePrompt?: (content: string) => void;
  isSavedPrompt?: boolean;
}

const ConfidenceMeter: React.FC<{ confidence: number }> = memo(({ confidence }) => {
  const label = confidence > 85 ? 'High' : confidence > 65 ? 'Medium' : 'Low';
  const color = confidence > 85 ? 'emerald' : confidence > 65 ? 'amber' : 'rose';
  return (
    <div className="flex items-center space-x-1.5">
      <div className="flex space-x-0.5">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className={`w-3 h-1 rounded-full ${
            i < Math.round(confidence / 20) ? `bg-${color}-500` : 'bg-slate-200'
          }`} />
        ))}
      </div>
      <span className={`text-[10px] font-bold text-${color}-600`}>{label} ({confidence}%)</span>
    </div>
  );
});
ConfidenceMeter.displayName = 'ConfidenceMeter';

function renderMarkdownLine(line: string, li: number, totalLines: number) {
  const parts = line.split(/(\*\*[^*]+\*\*)/g);
  return (
    <React.Fragment key={li}>
      {parts.map((part, pi) => {
        if (part.startsWith('**') && part.endsWith('**')) {
          return <strong key={pi} className="font-black">{part.slice(2, -2)}</strong>;
        }
        return <span key={pi}>{part}</span>;
      })}
      {li < totalLines - 1 && <br />}
    </React.Fragment>
  );
}

const MessageRowInner: React.FC<MessageRowProps> = ({
  id, role, content, timestamp, confidence, isStreaming,
  isPinned, copiedId, onCopy, onPin, onExport, onSavePrompt, isSavedPrompt,
}) => {
  const [parsedContent, setParsedContent] = useState<React.ReactNode | null>(null);
  const idleRef = useRef<number>(0);
  const prevContentRef = useRef('');

  // Parse markdown after streaming completes via requestIdleCallback
  useEffect(() => {
    if (isStreaming || role === 'user') {
      setParsedContent(null);
      return;
    }

    if (content === prevContentRef.current && parsedContent) return;
    prevContentRef.current = content;

    if (typeof requestIdleCallback === 'function') {
      idleRef.current = requestIdleCallback(() => {
        const lines = content.split('\n');
        const rendered = lines.map((line, li) => renderMarkdownLine(line, li, lines.length));
        setParsedContent(rendered);
      });
      return () => {
        if (idleRef.current) cancelIdleCallback(idleRef.current);
      };
    } else {
      // Fallback for browsers without requestIdleCallback
      const lines = content.split('\n');
      const rendered = lines.map((line, li) => renderMarkdownLine(line, li, lines.length));
      setParsedContent(rendered);
    }
  }, [content, isStreaming, role, parsedContent]);

  const handleCopy = useCallback(() => {
    onCopy?.(id, content);
  }, [id, content, onCopy]);

  const handlePin = useCallback(() => {
    onPin?.(id);
  }, [id, onPin]);

  // Render content: plain text while streaming, parsed markdown when done
  const displayContent = isStreaming || !parsedContent ? (
    <span className="whitespace-pre-wrap">{content}{isStreaming && <span className="inline-block w-1.5 h-4 bg-indigo-500 animate-pulse ml-0.5 align-text-bottom rounded-sm" />}</span>
  ) : parsedContent;

  return (
    <div className={`flex ${role === 'user' ? 'justify-end' : 'justify-start'}`}>
      <div className="max-w-[85%]">
        {/* Avatar + timestamp */}
        <div className={`flex items-center space-x-2 mb-1 ${role === 'user' ? 'justify-end' : ''}`}>
          {role !== 'user' && (
            <div className={`w-6 h-6 rounded-lg flex items-center justify-center ${
              role === 'ai' ? 'bg-gradient-to-br from-indigo-500 to-violet-500 text-white' : 'bg-slate-200 text-slate-500'
            }`}>
              {role === 'ai' ? <SparklesIcon className="w-3.5 h-3.5" /> : <BoltIcon className="w-3 h-3" />}
            </div>
          )}
          <span className="text-[10px] text-slate-400">
            {role === 'ai' ? 'AuraAI' : role === 'system' ? 'System' : 'You'} &middot; {timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </span>
        </div>

        {/* Message bubble */}
        <div className={`rounded-2xl px-4 py-3 ${
          role === 'user'
            ? 'bg-indigo-600 text-white'
            : role === 'system'
            ? 'bg-amber-50 border border-amber-200 text-amber-700'
            : 'bg-slate-50 border border-slate-100 text-slate-700'
        }`}>
          <div className="text-sm leading-relaxed whitespace-pre-wrap">
            {displayContent}
          </div>
        </div>

        {/* Actions for AI messages */}
        {role === 'ai' && confidence != null && confidence > 0 && !isStreaming && (
          <div className="mt-1.5 ml-1 flex items-center justify-between">
            <ConfidenceMeter confidence={confidence} />
            <div className="flex items-center space-x-1">
              <button onClick={handleCopy} className="p-1 text-slate-300 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-all" title="Copy">
                {copiedId === id ? <CheckIcon className="w-3 h-3 text-emerald-500" /> : <CopyIcon className="w-3 h-3" />}
              </button>
              <button
                onClick={handlePin}
                className={`p-1 rounded-lg transition-all ${isPinned ? 'text-amber-500 bg-amber-50' : 'text-slate-300 hover:text-amber-500 hover:bg-amber-50'}`}
                title="Pin"
              >
                <StarIcon className="w-3 h-3" />
              </button>
              <button onClick={onExport} className="p-1 text-slate-300 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-all" title="Export">
                <DownloadIcon className="w-3 h-3" />
              </button>
            </div>
          </div>
        )}

        {/* Save prompt for user messages */}
        {role === 'user' && onSavePrompt && (
          <div className="mt-1 flex justify-end">
            <button
              onClick={() => onSavePrompt(content)}
              className={`text-[9px] font-bold transition-all ${isSavedPrompt ? 'text-indigo-500' : 'text-slate-300 hover:text-indigo-500'}`}
            >
              {isSavedPrompt ? 'Saved' : 'Save prompt'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

const MessageRow = memo(MessageRowInner, (prev, next) => {
  // Only re-render if these props actually change
  return (
    prev.content === next.content &&
    prev.isStreaming === next.isStreaming &&
    prev.isPinned === next.isPinned &&
    prev.copiedId === next.copiedId
  );
});

(MessageRow as React.NamedExoticComponent).displayName = 'MessageRow';
export default MessageRow;
