// File: AuraEngine/components/EmojiPickerPopover.tsx
import React, { useState, useRef, useEffect } from 'react';

const EMOJI_CATEGORIES = [
  {
    name: 'Smileys',
    icon: '😊',
    emojis: [
      '😀','😃','😄','😁','😆','😅','🤣','😂','🙂','😊',
      '😇','🥰','😍','🤩','😘','😋','😛','😜','🤪','😎',
      '🤗','🤭','😏','🥱','😴','🤮','🥴','🤯','🤠','🥳',
      '😤','😡','🥺','😢','😭','😱','😨','😰','😥','🫡',
    ],
  },
  {
    name: 'Hands',
    icon: '👋',
    emojis: [
      '👋','🤚','🖐','✋','🖖','👌','🤌','🤏','✌️','🤞',
      '🤟','🤘','🤙','👈','👉','👆','👇','☝️','👍','👎',
      '✊','👊','🤛','🤜','👏','🙌','👐','🤲','🤝','🙏',
      '💪','🫶','✍️','💅','🤳','🫰',
    ],
  },
  {
    name: 'Hearts',
    icon: '❤️',
    emojis: [
      '❤️','🧡','💛','💚','💙','💜','🖤','🤍','🤎','💔',
      '❣️','💕','💞','💓','💗','💖','💘','💝','💟','♥️',
    ],
  },
  {
    name: 'Objects',
    icon: '🔥',
    emojis: [
      '🔥','⭐','🌟','✨','⚡','💥','🎯','🏆','🥇','🎉',
      '🎊','🎈','📌','🔗','✏️','📝','📊','📈','📉','💼',
      '📧','📱','💻','🖥','📷','🎬','🔔','📢','💡','🔑',
      '🔒','⚙️','🚀','✅','❌','⚠️','💯','♻️','🌍','🕐',
    ],
  },
];

interface EmojiPickerPopoverProps {
  onSelect: (emoji: string) => void;
}

const EmojiPickerPopover: React.FC<EmojiPickerPopoverProps> = ({ onSelect }) => {
  const [open, setOpen] = useState(false);
  const [activeCategory, setActiveCategory] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handleClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', handleClick);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('keydown', handleKey);
    };
  }, [open]);

  return (
    <div ref={containerRef} className="relative inline-flex">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-all"
        title="Insert emoji"
        aria-label="Insert emoji"
      >
        <span className="text-base leading-none">😊</span>
      </button>
      {open && (
        <div className="absolute bottom-full left-0 mb-1 w-[280px] bg-white rounded-xl shadow-xl border border-slate-200 z-50 overflow-hidden">
          {/* Category tabs */}
          <div className="flex items-center gap-0.5 px-2 pt-2 pb-1 border-b border-slate-100">
            {EMOJI_CATEGORIES.map((cat, i) => (
              <button
                key={cat.name}
                type="button"
                onClick={() => setActiveCategory(i)}
                className={`px-2 py-1 text-sm rounded-lg transition-colors ${
                  activeCategory === i
                    ? 'bg-indigo-50 text-indigo-600'
                    : 'text-slate-400 hover:bg-slate-50 hover:text-slate-600'
                }`}
                title={cat.name}
              >
                {cat.icon}
              </button>
            ))}
            <span className="ml-auto text-[9px] font-bold text-slate-300 uppercase tracking-wider">
              {EMOJI_CATEGORIES[activeCategory].name}
            </span>
          </div>
          {/* Emoji grid */}
          <div className="grid grid-cols-8 gap-0.5 p-2 max-h-[200px] overflow-y-auto">
            {EMOJI_CATEGORIES[activeCategory].emojis.map((emoji) => (
              <button
                key={emoji}
                type="button"
                onClick={() => {
                  onSelect(emoji);
                  setOpen(false);
                }}
                className="w-8 h-8 flex items-center justify-center text-lg rounded-lg hover:bg-indigo-50 transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-300"
                tabIndex={0}
              >
                {emoji}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default EmojiPickerPopover;
