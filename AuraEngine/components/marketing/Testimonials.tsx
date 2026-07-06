import React, { useRef, useState, useEffect } from 'react';
import Reveal from './Reveal';

function useCountUp(target: number, suffix = '', duration = 1600) {
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

// New-startup framing: honest product facts, not borrowed traction metrics.
const Testimonials: React.FC = () => {
  const stat1 = useCountUp(50, '+');
  const stat2 = useCountUp(5, ' min');
  const stat3 = useCountUp(3, '');
  const stat4 = useCountUp(24, '/7');

  return (
    <section id="why" className="py-24 lg:py-32">
      <div className="max-w-[1180px] mx-auto px-6">
        <Reveal>
          <div className="text-center max-w-2xl mx-auto mb-16">
            <p className="eyebrow text-teal-700 mb-5">Why Scaliyo</p>
            <h2 className="font-display text-4xl lg:text-[3.25rem] leading-[1.06] font-medium tracking-[-0.02em] text-[#1C1A17]">
              Built for teams who&rsquo;d rather sell than search
            </h2>
          </div>
        </Reveal>

        {/* Honest product-fact stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-8 text-center mb-20">
          {[
            { ...stat1, label: 'Buying signals analyzed per lead' },
            { ...stat2, label: 'To connect your stack and go live' },
            { ...stat3, label: 'Steps from signup to first sequence' },
            { ...stat4, label: 'Autonomous follow-up, always on' },
          ].map((s) => (
            <div key={s.label} ref={s.ref} className="group">
              <p className="font-display text-4xl lg:text-5xl font-medium text-[#1C1A17] group-hover:text-teal-700 transition-colors duration-300 tabular-nums">
                {s.display}
              </p>
              <p className="mt-3 text-sm text-[#8A8178] leading-snug max-w-[12rem] mx-auto">{s.label}</p>
            </div>
          ))}
        </div>

        {/* Founder note — authentic for an early-stage brand */}
        <Reveal delay={200}>
          <figure className="max-w-2xl mx-auto text-center">
            <blockquote className="font-display text-2xl lg:text-[1.75rem] leading-[1.4] font-medium text-[#3A342E] italic">
              &ldquo;We started Scaliyo because great salespeople spend half their week
              on research a computer should just do. Give that time back, and small
              teams can outsell much bigger ones.&rdquo;
            </blockquote>
            <figcaption className="mt-7 flex items-center justify-center gap-3">
              <span className="w-10 h-10 rounded-full bg-[#EAF2EF] flex items-center justify-center text-sm font-semibold text-teal-700">SC</span>
              <span className="text-left">
                <span className="block text-sm font-semibold text-[#1C1A17]">The Scaliyo team</span>
                <span className="block text-xs text-[#9A9189]">Founders · building in public, 2026</span>
              </span>
            </figcaption>
          </figure>
        </Reveal>
      </div>
    </section>
  );
};

export default Testimonials;
