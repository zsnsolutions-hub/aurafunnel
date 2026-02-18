
import React from 'react';
import { Outlet, Link } from 'react-router-dom';

const MarketingLayout: React.FC = () => {
  return (
    <div className="min-h-screen flex flex-col">
      <a href="#main-content" className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-[100] focus:bg-indigo-600 focus:text-white focus:px-4 focus:py-2 focus:rounded-lg focus:text-sm focus:font-bold">Skip to main content</a>
      <nav className="fixed top-0 left-0 right-0 z-50 px-6 py-4" aria-label="Main navigation">
        <div className="max-w-7xl mx-auto">
          <div className="glass border border-white/20 rounded-2xl px-6 h-16 flex items-center justify-between shadow-sm transition-all duration-300 hover:shadow-md">
            <Link to="/" className="flex items-center space-x-2 group" aria-label="AuraFunnel home">
              <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center group-hover:rotate-12 group-hover:scale-110 transition-all duration-500 ease-out">
                <span className="text-white font-black">A</span>
              </div>
              <span className="text-xl font-bold text-slate-900 tracking-tight font-heading transition-colors duration-300 group-hover:text-indigo-600">
                AuraFunnel
              </span>
            </Link>
            
            <div className="hidden lg:flex items-center space-x-8">
              {['Features', 'Pricing', 'Blog', 'About', 'Contact'].map((item) => (
                <Link 
                  key={item}
                  to={`/${item.toLowerCase()}`} 
                  className="relative text-sm font-bold text-slate-500 hover:text-indigo-600 transition-colors duration-300 uppercase tracking-widest group"
                >
                  {item}
                  <span className="absolute -bottom-1 left-0 w-0 h-0.5 bg-indigo-600 transition-all duration-300 group-hover:w-full"></span>
                </Link>
              ))}
            </div>

            <div className="flex items-center space-x-2">
              <Link to="/auth" className="hidden sm:block text-sm font-bold text-slate-600 px-4 py-2 hover:text-indigo-600 transition-colors duration-300">Log in</Link>
              <Link to="/auth" className="bg-slate-900 text-white px-5 py-2.5 rounded-xl text-sm font-bold hover:bg-indigo-600 hover:scale-105 transition-all duration-300 shadow-lg active:scale-95">
                Get Started
              </Link>
            </div>
          </div>
        </div>
      </nav>
      
      <main id="main-content" className="flex-grow" role="main">
        <Outlet />
      </main>

      <footer className="bg-white border-t border-slate-100 py-20" role="contentinfo">
        <div className="max-w-7xl mx-auto px-6 lg:px-8">
          {/* Tagline Banner */}
          <div className="text-center mb-16">
            <p className="text-2xl md:text-3xl font-black text-slate-900 font-heading tracking-tight">
              Smarter Leads. Faster Deals. <span className="text-indigo-600">Powered by AI.</span>
            </p>
            <p className="text-sm text-slate-400 mt-3 font-medium">Join thousands of B2B teams closing more with AuraFunnel.</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-12 gap-12 lg:gap-16">
            {/* Brand + Contact Info */}
            <div className="md:col-span-4">
              <Link to="/" className="flex items-center space-x-2 mb-6 group">
                <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center transition-transform duration-500 group-hover:rotate-12">
                  <span className="text-white font-black">A</span>
                </div>
                <span className="text-xl font-bold text-slate-900 font-heading group-hover:text-indigo-600 transition-colors duration-300">AuraFunnel</span>
              </Link>
              <p className="text-slate-500 leading-relaxed max-w-sm mb-6 text-sm">
                Pioneering the future of B2B sales with generative intelligence and behavioral predictive modeling.
              </p>

              {/* Contact Details */}
              <div className="space-y-3 mb-8">
                <a href="mailto:hello@aurafunnel.com" className="flex items-center space-x-2.5 text-sm text-slate-500 hover:text-indigo-600 transition-colors duration-300">
                  <svg className="w-4 h-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                  </svg>
                  <span>hello@aurafunnel.com</span>
                </a>
                <a href="tel:+18005551234" className="flex items-center space-x-2.5 text-sm text-slate-500 hover:text-indigo-600 transition-colors duration-300">
                  <svg className="w-4 h-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                  </svg>
                  <span>+1 (800) 555-1234</span>
                </a>
                <div className="flex items-start space-x-2.5 text-sm text-slate-500">
                  <svg className="w-4 h-4 text-slate-400 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                  <span>123 Innovation Drive, Suite 400<br />San Francisco, CA 94105</span>
                </div>
              </div>

              {/* Social Links */}
              <div className="flex space-x-3">
                <a href="#" aria-label="Follow us on X (Twitter)" className="w-9 h-9 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-center hover:bg-indigo-50 hover:border-indigo-100 transition-all duration-300 text-slate-400 hover:text-indigo-600 font-bold hover:scale-110">
                  <span className="text-sm">𝕏</span>
                </a>
                <a href="#" aria-label="Follow us on LinkedIn" className="w-9 h-9 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-center hover:bg-indigo-50 hover:border-indigo-100 transition-all duration-300 text-slate-400 hover:text-indigo-600 font-bold hover:scale-110">
                  <span className="text-sm">in</span>
                </a>
                <a href="#" aria-label="Follow us on Instagram" className="w-9 h-9 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-center hover:bg-indigo-50 hover:border-indigo-100 transition-all duration-300 text-slate-400 hover:text-indigo-600 hover:scale-110">
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z"/></svg>
                </a>
                <a href="#" aria-label="Follow us on Facebook" className="w-9 h-9 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-center hover:bg-indigo-50 hover:border-indigo-100 transition-all duration-300 text-slate-400 hover:text-indigo-600 hover:scale-110">
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>
                </a>
                <a href="#" aria-label="Follow us on YouTube" className="w-9 h-9 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-center hover:bg-indigo-50 hover:border-indigo-100 transition-all duration-300 text-slate-400 hover:text-indigo-600 hover:scale-110">
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M23.498 6.186a3.016 3.016 0 00-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 00.502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 002.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 002.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/></svg>
                </a>
                <a href="#" aria-label="Follow us on GitHub" className="w-9 h-9 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-center hover:bg-indigo-50 hover:border-indigo-100 transition-all duration-300 text-slate-400 hover:text-indigo-600 hover:scale-110">
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12"/></svg>
                </a>
              </div>
            </div>

            {/* Navigation Columns */}
            <div className="md:col-span-8 grid grid-cols-2 sm:grid-cols-4 gap-8">
              <div>
                <h4 className="text-xs font-bold text-slate-900 uppercase tracking-widest mb-6">Platform</h4>
                <ul className="space-y-4 text-sm font-medium text-slate-500">
                  <li><Link to="/features" className="hover:text-indigo-600 transition-colors duration-300">Intelligence</Link></li>
                  <li><Link to="/features" className="hover:text-indigo-600 transition-colors duration-300">Content Studio</Link></li>
                  <li><Link to="/features" className="hover:text-indigo-600 transition-colors duration-300">Lead Scoring</Link></li>
                  <li><Link to="/features" className="hover:text-indigo-600 transition-colors duration-300">Automations</Link></li>
                  <li><Link to="/pricing" className="hover:text-indigo-600 transition-colors duration-300">Pricing</Link></li>
                </ul>
              </div>
              <div>
                <h4 className="text-xs font-bold text-slate-900 uppercase tracking-widest mb-6">Resources</h4>
                <ul className="space-y-4 text-sm font-medium text-slate-500">
                  <li><Link to="/blog" className="hover:text-indigo-600 transition-colors duration-300">Blog</Link></li>
                  <li><Link to="/features" className="hover:text-indigo-600 transition-colors duration-300">Documentation</Link></li>
                  <li><Link to="/features" className="hover:text-indigo-600 transition-colors duration-300">API Reference</Link></li>
                  <li><Link to="/contact" className="hover:text-indigo-600 transition-colors duration-300">Help Center</Link></li>
                </ul>
              </div>
              <div>
                <h4 className="text-xs font-bold text-slate-900 uppercase tracking-widest mb-6">Company</h4>
                <ul className="space-y-4 text-sm font-medium text-slate-500">
                  <li><Link to="/about" className="hover:text-indigo-600 transition-colors duration-300">About Us</Link></li>
                  <li><Link to="/about" className="hover:text-indigo-600 transition-colors duration-300">Our Vision</Link></li>
                  <li><Link to="/contact" className="hover:text-indigo-600 transition-colors duration-300">Careers</Link></li>
                  <li><Link to="/contact" className="hover:text-indigo-600 transition-colors duration-300">Contact</Link></li>
                </ul>
              </div>
              <div>
                <h4 className="text-xs font-bold text-slate-900 uppercase tracking-widest mb-6">Legal</h4>
                <ul className="space-y-4 text-sm font-medium text-slate-500">
                  <li className="hover:text-indigo-600 cursor-pointer transition-colors duration-300">Privacy Policy</li>
                  <li className="hover:text-indigo-600 cursor-pointer transition-colors duration-300">Terms of Service</li>
                  <li className="hover:text-indigo-600 cursor-pointer transition-colors duration-300">Security</li>
                  <li className="hover:text-indigo-600 cursor-pointer transition-colors duration-300">Cookie Policy</li>
                </ul>
              </div>
            </div>
          </div>

          {/* Bottom Bar */}
          <div className="border-t border-slate-100 mt-16 pt-8 flex flex-col md:flex-row justify-between items-center gap-4">
            <p className="text-xs font-bold text-slate-400 tracking-widest uppercase">&copy; {new Date().getFullYear()} AuraFunnel Intelligence Corp. All rights reserved.</p>
            <div className="flex items-center space-x-6">
              <span className="flex items-center space-x-2 group cursor-default">
                <span className="w-2 h-2 bg-emerald-500 rounded-full group-hover:scale-150 transition-transform duration-300"></span>
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Systems Operational</span>
              </span>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default MarketingLayout;
