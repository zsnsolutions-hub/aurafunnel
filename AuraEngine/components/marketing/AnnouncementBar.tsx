import React, { useState, useEffect } from 'react';

const STORAGE_KEY = 'scaliyo_announcement_dismissed';

const AnnouncementBar: React.FC = () => {
  const [dismissed, setDismissed] = useState(() => {
    try { return localStorage.getItem(STORAGE_KEY) === '1'; } catch { return false; }
  });
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    const onScroll = () => setHidden(window.scrollY > 80);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  if (dismissed) return null;

  const handleDismiss = () => {
    setDismissed(true);
    try { localStorage.setItem(STORAGE_KEY, '1'); } catch { /* noop */ }
  };

  return (
    <div
      className={`fixed top-0 left-0 right-0 z-[60] h-10 bg-gradient-to-r from-teal-600 to-cyan-600 flex items-center justify-center transition-transform duration-300 ${
        hidden ? '-translate-y-full' : 'translate-y-0'
      }`}
    >
      <a
        href="#deep-research"
        className="text-sm font-semibold text-white hover:text-white/90 transition-colors"
      >
        New: AI Deep Research is here — See how it works →
      </a>
      <button
        onClick={handleDismiss}
        className="absolute right-4 text-white/70 hover:text-white transition-colors"
        aria-label="Dismiss announcement"
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
  );
};

export default AnnouncementBar;
