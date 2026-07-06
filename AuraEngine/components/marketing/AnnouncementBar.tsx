import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';

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
      className={`fixed top-0 left-0 right-0 z-[60] h-10 bg-[#1C1A17] flex items-center justify-center px-10 transition-transform duration-300 ${
        hidden ? '-translate-y-full' : 'translate-y-0'
      }`}
    >
      <Link
        to="/signup"
        className="group flex items-center gap-2 text-[13px] font-medium text-[#F5F1EA] hover:text-white transition-colors"
      >
        <span className="text-teal-300">✦</span>
        <span>Scaliyo is now in early access — join the first cohort</span>
        <span className="transition-transform duration-300 group-hover:translate-x-0.5">→</span>
      </Link>
      <button
        onClick={handleDismiss}
        className="absolute right-4 text-white/50 hover:text-white transition-colors"
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
