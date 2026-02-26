
import React, { useState, useEffect } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import PrefetchLink from '../PrefetchLink';
import { track } from '../../lib/analytics';

/** Pages that have a white/light background at the top. */
const LIGHT_BG_PAGES = ['/features', '/blog', '/about', '/contact'];

const MarketingLayout: React.FC = () => {
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const location = useLocation();

  const isLightPage = LIGHT_BG_PAGES.includes(location.pathname);
  // On light pages: use coloured logo until user scrolls (nav turns dark)
  // On dark pages: always use the dark-bg logo
  const logoSrc = isLightPage && !scrolled
    ? '/scaliyo-logo-light.png'
    : '/scaliyo-logo-dark.png';

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 60);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <div className="min-h-screen flex flex-col bg-[#0A1628]">
      <a href="#main-content" className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-[100] focus:bg-teal-600 focus:text-white focus:px-4 focus:py-2 focus:rounded-lg focus:text-sm focus:font-bold">Skip to main content</a>

      {/* ── Sticky Nav ── */}
      <nav
        className={`fixed top-0 left-0 right-0 z-50 px-6 transition-all duration-300 ${scrolled ? 'py-2' : 'py-4'}`}
        aria-label="Main navigation"
      >
        <div className="max-w-[1200px] mx-auto">
          <div className={`border rounded-2xl px-6 flex items-center justify-between transition-all duration-300 ${
            scrolled
              ? 'h-14 bg-[#0A1628]/90 backdrop-blur-xl border-slate-700/50 shadow-lg shadow-black/20'
              : isLightPage
                ? 'h-16 bg-white/80 backdrop-blur-md border-slate-200'
                : 'h-16 bg-white/5 backdrop-blur-md border-white/10'
          }`}>
            <PrefetchLink to="/" className="flex items-center group" aria-label="Scaliyo home">
              <img src={logoSrc} alt="Scaliyo" className="h-8 w-auto group-hover:scale-105 transition-transform duration-300" />
            </PrefetchLink>

            <div className="hidden lg:flex items-center space-x-8">
              {['Features', 'Pricing', 'Blog', 'About', 'Contact'].map((item) => (
                <PrefetchLink
                  key={item}
                  to={`/${item.toLowerCase()}`}
                  className={`relative text-sm font-semibold transition-colors duration-300 group ${
                    isLightPage && !scrolled
                      ? 'text-slate-600 hover:text-slate-900'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  {item}
                  <span className="absolute -bottom-1 left-0 w-0 h-0.5 bg-teal-500 transition-all duration-300 group-hover:w-full" />
                </PrefetchLink>
              ))}
            </div>

            <div className="flex items-center space-x-3">
              <PrefetchLink to="/auth" className={`hidden sm:block text-sm font-semibold px-4 py-2 transition-colors duration-300 ${
                isLightPage && !scrolled ? 'text-slate-600 hover:text-slate-900' : 'text-slate-400 hover:text-white'
              }`}>Log in</PrefetchLink>
              <PrefetchLink
                to="/signup"
                onClick={() => track('cta_click', { location: 'navbar', label: 'start_free_trial' })}
                className="bg-teal-500 text-white px-5 py-2.5 rounded-xl text-sm font-bold hover:bg-teal-400 hover:scale-105 transition-all duration-300 shadow-lg shadow-teal-500/20 active:scale-95"
              >
                Start Free Trial
              </PrefetchLink>
              {/* Mobile hamburger */}
              <button
                onClick={() => setMobileOpen(!mobileOpen)}
                className="lg:hidden w-10 h-10 flex items-center justify-center text-slate-400 hover:text-white"
                aria-label="Toggle menu"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  {mobileOpen ? (
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  ) : (
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
                  )}
                </svg>
              </button>
            </div>
          </div>

          {/* Mobile menu */}
          {mobileOpen && (
            <div className="lg:hidden mt-2 bg-[#0F1D32]/95 backdrop-blur-xl border border-slate-700/50 rounded-2xl p-6 shadow-2xl">
              <div className="space-y-4">
                {['Features', 'Pricing', 'Blog', 'About', 'Contact'].map((item) => (
                  <PrefetchLink
                    key={item}
                    to={`/${item.toLowerCase()}`}
                    onClick={() => setMobileOpen(false)}
                    className="block text-lg font-semibold text-slate-300 hover:text-teal-400 transition-colors"
                  >
                    {item}
                  </PrefetchLink>
                ))}
                <hr className="border-slate-700/50" />
                <PrefetchLink to="/auth" onClick={() => setMobileOpen(false)} className="block text-lg font-semibold text-slate-400">Log in</PrefetchLink>
                <PrefetchLink
                  to="/signup"
                  onClick={() => { setMobileOpen(false); track('cta_click', { location: 'navbar_mobile', label: 'start_free_trial' }); }}
                  className="block text-center bg-teal-500 text-white px-5 py-3 rounded-xl text-base font-bold hover:bg-teal-400 transition-all"
                >
                  Start Free Trial
                </PrefetchLink>
              </div>
            </div>
          )}
        </div>
      </nav>

      <main id="main-content" className="flex-grow" role="main">
        <Outlet />
      </main>

      {/* ── Footer (Dark) ── */}
      <footer className="bg-[#070E1A] border-t border-slate-800/60 py-20" role="contentinfo">
        <div className="max-w-[1200px] mx-auto px-6">
          {/* Tagline */}
          <div className="text-center mb-16">
            <p className="text-2xl md:text-3xl font-black text-white font-heading tracking-tight">
              Smarter Leads. Faster Deals. <span className="text-teal-400">Powered by AI.</span>
            </p>
            <p className="text-sm text-slate-500 mt-3 font-medium">Join thousands of B2B teams closing more with Scaliyo.</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-12 gap-12 lg:gap-16">
            {/* Brand + Contact */}
            <div className="md:col-span-4">
              <PrefetchLink to="/" className="flex items-center mb-6 group">
                <img src="/scaliyo-logo-dark.png" alt="Scaliyo" className="h-8 w-auto group-hover:scale-105 transition-transform duration-300" />
              </PrefetchLink>
              <p className="text-slate-500 leading-relaxed max-w-sm mb-6 text-sm">
                The AI-powered outbound growth platform that finds leads, enriches your pipeline, and closes deals automatically.
              </p>

              <div className="space-y-3 mb-8">
                <a href="mailto:hello@scaliyo.com" className="flex items-center space-x-2.5 text-sm text-slate-500 hover:text-teal-400 transition-colors duration-300">
                  <svg className="w-4 h-4 text-slate-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                  </svg>
                  <span>hello@scaliyo.com</span>
                </a>
              </div>

              {/* Social */}
              <div className="flex space-x-3">
                {[
                  { label: 'X', content: <span className="text-sm font-bold">𝕏</span> },
                  { label: 'LinkedIn', content: <span className="text-sm font-bold">in</span> },
                  { label: 'GitHub', content: (
                    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12"/></svg>
                  )},
                ].map((s) => (
                  <a key={s.label} href="#" aria-label={`Follow us on ${s.label}`} className="w-9 h-9 rounded-xl bg-slate-800/60 border border-slate-700/50 flex items-center justify-center hover:bg-teal-500/10 hover:border-teal-500/30 transition-all duration-300 text-slate-500 hover:text-teal-400 hover:scale-110">
                    {s.content}
                  </a>
                ))}
              </div>
            </div>

            {/* Nav Columns */}
            <div className="md:col-span-8 grid grid-cols-2 sm:grid-cols-4 gap-8">
              <div>
                <h4 className="text-xs font-bold text-white uppercase tracking-widest mb-6">Platform</h4>
                <ul className="space-y-4 text-sm font-medium text-slate-500">
                  <li><PrefetchLink to="/features" className="hover:text-teal-400 transition-colors duration-300">Intelligence</PrefetchLink></li>
                  <li><PrefetchLink to="/features" className="hover:text-teal-400 transition-colors duration-300">Lead Scoring</PrefetchLink></li>
                  <li><PrefetchLink to="/features" className="hover:text-teal-400 transition-colors duration-300">Automations</PrefetchLink></li>
                  <li><PrefetchLink to="/features" className="hover:text-teal-400 transition-colors duration-300">Content Studio</PrefetchLink></li>
                  <li><PrefetchLink to="/pricing" className="hover:text-teal-400 transition-colors duration-300">Pricing</PrefetchLink></li>
                </ul>
              </div>
              <div>
                <h4 className="text-xs font-bold text-white uppercase tracking-widest mb-6">Resources</h4>
                <ul className="space-y-4 text-sm font-medium text-slate-500">
                  <li><PrefetchLink to="/blog" className="hover:text-teal-400 transition-colors duration-300">Blog</PrefetchLink></li>
                  <li><PrefetchLink to="/features" className="hover:text-teal-400 transition-colors duration-300">Documentation</PrefetchLink></li>
                  <li><PrefetchLink to="/features" className="hover:text-teal-400 transition-colors duration-300">API Reference</PrefetchLink></li>
                  <li><PrefetchLink to="/contact" className="hover:text-teal-400 transition-colors duration-300">Help Center</PrefetchLink></li>
                </ul>
              </div>
              <div>
                <h4 className="text-xs font-bold text-white uppercase tracking-widest mb-6">Company</h4>
                <ul className="space-y-4 text-sm font-medium text-slate-500">
                  <li><PrefetchLink to="/about" className="hover:text-teal-400 transition-colors duration-300">About Us</PrefetchLink></li>
                  <li><PrefetchLink to="/about" className="hover:text-teal-400 transition-colors duration-300">Our Vision</PrefetchLink></li>
                  <li><PrefetchLink to="/contact" className="hover:text-teal-400 transition-colors duration-300">Careers</PrefetchLink></li>
                  <li><PrefetchLink to="/contact" className="hover:text-teal-400 transition-colors duration-300">Contact</PrefetchLink></li>
                  {/* Book a demo — secondary, footer-only */}
                  <li><PrefetchLink to="/contact" className="hover:text-teal-400 transition-colors duration-300">Book a Demo</PrefetchLink></li>
                </ul>
              </div>
              <div>
                <h4 className="text-xs font-bold text-white uppercase tracking-widest mb-6">Legal</h4>
                <ul className="space-y-4 text-sm font-medium text-slate-500">
                  <li className="hover:text-teal-400 cursor-pointer transition-colors duration-300">Privacy Policy</li>
                  <li className="hover:text-teal-400 cursor-pointer transition-colors duration-300">Terms of Service</li>
                  <li className="hover:text-teal-400 cursor-pointer transition-colors duration-300">Security</li>
                  <li className="hover:text-teal-400 cursor-pointer transition-colors duration-300">Cookie Policy</li>
                </ul>
              </div>
            </div>
          </div>

          {/* Bottom Bar */}
          <div className="border-t border-slate-800/60 mt-16 pt-8 flex flex-col md:flex-row justify-between items-center gap-4">
            <p className="text-xs font-bold text-slate-600 tracking-widest uppercase">&copy; {new Date().getFullYear()} Scaliyo Inc. All rights reserved.</p>
            <div className="flex items-center space-x-6">
              <span className="flex items-center space-x-2 group cursor-default">
                <span className="w-2 h-2 bg-emerald-500 rounded-full group-hover:scale-150 transition-transform duration-300" />
                <span className="text-[10px] font-bold text-slate-600 uppercase tracking-widest">Systems Operational</span>
              </span>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default MarketingLayout;
