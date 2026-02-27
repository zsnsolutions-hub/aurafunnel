import React, { useRef, useState, useEffect } from 'react';
import Reveal from './Reveal';

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

const Testimonials: React.FC = () => {
  const stat1 = useCountUp(7, '×');
  const stat2 = useCountUp(3, '.2×');
  const stat3 = useCountUp(94, '%');
  const stat4 = useCountUp(2, '.1B+');

  return (
    <section id="testimonials" className="py-24 lg:py-32">
      <div className="max-w-[1400px] mx-auto px-6">
        <Reveal>
          <h2 className="text-4xl lg:text-5xl font-bold tracking-tight font-heading text-center mb-16">
            Revenue Teams Move Faster With Scaliyo
          </h2>
        </Reveal>

        {/* 4 Metrics */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-10 text-center mb-20">
          {[
            { ...stat1, label: 'Higher reply rates' },
            { ...stat2, label: 'Faster deal cycles' },
            { ...stat3, label: 'Scoring accuracy' },
            { ...stat4, label: 'Pipeline generated' },
          ].map((s) => (
            <div key={s.label} ref={s.ref} className="group">
              <p className="text-4xl lg:text-5xl font-black font-heading text-white group-hover:text-teal-400 transition-colors duration-300">
                {s.display}
              </p>
              <p className="mt-2 text-sm text-slate-500 font-medium">{s.label}</p>
            </div>
          ))}
        </div>

        {/* Single testimonial */}
        <Reveal delay={200}>
          <div className="max-w-2xl mx-auto text-center">
            <p className="text-xl text-slate-300 leading-relaxed mb-6 italic">
              &ldquo;Scaliyo cut our sales cycle by 40%. The AI scoring is scarily accurate
              — we close deals we would have completely missed.&rdquo;
            </p>
            <p className="text-sm text-slate-500 font-medium">
              Sarah Chen &middot; VP of Sales, Stackline
            </p>
          </div>
        </Reveal>
      </div>
    </section>
  );
};

export default Testimonials;
