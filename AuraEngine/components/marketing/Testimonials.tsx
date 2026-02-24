import React, { useRef, useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import Reveal from './Reveal';
import { track } from '../../lib/analytics';

/* ── Animated counter ── */
function useCountUp(target: number, suffix = '', duration = 1800) {
  const [value, setValue] = useState(0);
  const ref = useRef<HTMLDivElement>(null);
  const started = useRef(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !started.current) {
          started.current = true;
          const start = performance.now();
          const step = (now: number) => {
            const progress = Math.min((now - start) / duration, 1);
            const eased = 1 - Math.pow(1 - progress, 3);
            setValue(Math.floor(eased * target));
            if (progress < 1) requestAnimationFrame(step);
          };
          requestAnimationFrame(step);
        }
      },
      { threshold: 0.3 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [target, duration]);

  return { ref, display: `${value.toLocaleString()}${suffix}` };
}

const testimonials = [
  {
    quote:
      'Scaliyo cut our sales cycle by 40%. The AI scoring is scarily accurate — we close deals we would have completely missed.',
    name: 'Sarah Chen',
    title: 'VP of Sales',
    company: 'Stackline',
    initials: 'SC',
  },
  {
    quote:
      'We replaced three separate tools with Scaliyo. The personalized outreach alone is worth 10x the price.',
    name: 'Marcus Rivera',
    title: 'Head of Growth',
    company: 'Nuvio',
    initials: 'MR',
  },
  {
    quote:
      'Pipeline visibility went from guesswork to science. Our forecasting accuracy jumped from 60% to over 90%.',
    name: 'Priya Sharma',
    title: 'CRO',
    company: 'Meridian SaaS',
    initials: 'PS',
  },
];

const Testimonials: React.FC = () => {
  const stat1 = useCountUp(2400, '+');
  const stat2 = useCountUp(94, '%');
  const stat3 = useCountUp(3, '.2x');
  const stat4 = useCountUp(50, 'M+');

  return (
    <section className="py-24 lg:py-32 border-y border-slate-800/60">
      <div className="max-w-[1200px] mx-auto px-6">
        {/* Metrics */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-10 text-center mb-24">
          {[
            { ...stat1, label: 'Teams worldwide' },
            { ...stat2, label: 'Scoring accuracy' },
            { ...stat3, label: 'Faster close rate' },
            { ...stat4, label: 'Leads scored' },
          ].map((stat) => (
            <div key={stat.label} ref={stat.ref} className="group">
              <p className="text-4xl lg:text-5xl font-black font-heading tracking-tight text-white group-hover:text-teal-400 transition-colors duration-300">
                {stat.display}
              </p>
              <p className="mt-2 text-sm text-slate-500 font-medium uppercase tracking-wider">
                {stat.label}
              </p>
            </div>
          ))}
        </div>

        {/* Testimonials */}
        <Reveal>
          <div className="text-center mb-16">
            <h2 className="text-4xl lg:text-5xl font-bold tracking-tight font-heading mb-4">
              Loved by revenue teams
            </h2>
            <p className="text-lg text-slate-400">
              See why thousands of teams trust Scaliyo to close more deals.
            </p>
          </div>
        </Reveal>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {testimonials.map((t, i) => (
            <Reveal key={t.name} delay={i * 150}>
              <div className="bg-[#0F1D32] rounded-2xl border border-slate-800 p-8 flex flex-col justify-between relative overflow-hidden group hover:border-teal-500/20 transition-all duration-500 h-full">
                <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-teal-500 via-cyan-500 to-teal-500 opacity-50" />
                {/* Stars */}
                <div className="flex gap-1 mb-5">
                  {[1, 2, 3, 4, 5].map((n) => (
                    <svg
                      key={n}
                      className="w-4 h-4 text-teal-400"
                      fill="currentColor"
                      viewBox="0 0 20 20"
                    >
                      <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                    </svg>
                  ))}
                </div>
                <p className="text-slate-300 leading-relaxed mb-8 text-[17px]">
                  &ldquo;{t.quote}&rdquo;
                </p>
                <div className="flex items-center gap-4 mt-auto">
                  <div className="w-11 h-11 rounded-full bg-teal-500/15 flex items-center justify-center text-sm font-bold text-teal-300 border border-teal-500/20">
                    {t.initials}
                  </div>
                  <div>
                    <p className="font-semibold text-white">{t.name}</p>
                    <p className="text-sm text-slate-500">
                      {t.title}, {t.company}
                    </p>
                  </div>
                </div>
              </div>
            </Reveal>
          ))}
        </div>

        <Reveal delay={500}>
          <div className="text-center mt-12">
            <Link
              to="/signup"
              onClick={() => track('cta_click', { location: 'testimonials', label: 'start_free_trial' })}
              className="text-sm font-bold text-teal-400 hover:text-teal-300 transition-colors"
            >
              Join 2,400+ teams &rarr;
            </Link>
          </div>
        </Reveal>
      </div>
    </section>
  );
};

export default Testimonials;
