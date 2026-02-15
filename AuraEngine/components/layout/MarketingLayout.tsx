
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
          <div className="grid grid-cols-1 md:grid-cols-12 gap-12 lg:gap-24">
            <div className="md:col-span-5">
              <Link to="/" className="flex items-center space-x-2 mb-6 group">
                <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center transition-transform duration-500 group-hover:rotate-12">
                  <span className="text-white font-black">A</span>
                </div>
                <span className="text-xl font-bold text-slate-900 font-heading group-hover:text-indigo-600 transition-colors duration-300">AuraFunnel</span>
              </Link>
              <p className="text-slate-500 leading-relaxed max-w-sm mb-8">
                Pioneering the future of B2B sales with generative intelligence and behavioral predictive modeling.
              </p>
              <div className="flex space-x-4">
                <a href="#" aria-label="Follow us on X (Twitter)" className="w-10 h-10 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-center hover:bg-indigo-50 hover:border-indigo-100 transition-all duration-300 cursor-pointer text-slate-400 hover:text-indigo-600 font-bold hover:scale-110">𝕏</a>
                <a href="#" aria-label="Follow us on LinkedIn" className="w-10 h-10 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-center hover:bg-indigo-50 hover:border-indigo-100 transition-all duration-300 cursor-pointer text-slate-400 hover:text-indigo-600 font-bold hover:scale-110">in</a>
              </div>
            </div>
            <div className="md:col-span-7 grid grid-cols-2 sm:grid-cols-3 gap-8">
              <div>
                <h4 className="text-xs font-bold text-slate-900 uppercase tracking-widest mb-6">Platform</h4>
                <ul className="space-y-4 text-sm font-medium text-slate-500">
                  <li><Link to="/features" className="hover:text-indigo-600 transition-colors duration-300">Intelligence</Link></li>
                  <li><Link to="/features" className="hover:text-indigo-600 transition-colors duration-300">Content Studio</Link></li>
                  <li><Link to="/pricing" className="hover:text-indigo-600 transition-colors duration-300">Pricing</Link></li>
                  <li><Link to="/blog" className="hover:text-indigo-600 transition-colors duration-300">Blog</Link></li>
                </ul>
              </div>
              <div>
                <h4 className="text-xs font-bold text-slate-900 uppercase tracking-widest mb-6">Company</h4>
                <ul className="space-y-4 text-sm font-medium text-slate-500">
                  <li><Link to="/about" className="hover:text-indigo-600 transition-colors duration-300">Our Vision</Link></li>
                  <li><Link to="/contact" className="hover:text-indigo-600 transition-colors duration-300">Careers</Link></li>
                  <li><Link to="/contact" className="hover:text-indigo-600 transition-colors duration-300">Contact</Link></li>
                </ul>
              </div>
              <div className="col-span-2 sm:col-span-1">
                <h4 className="text-xs font-bold text-slate-900 uppercase tracking-widest mb-6">Legal</h4>
                <ul className="space-y-4 text-sm font-medium text-slate-500">
                  <li className="hover:text-indigo-600 cursor-pointer transition-colors duration-300">Security</li>
                  <li className="hover:text-indigo-600 cursor-pointer transition-colors duration-300">Privacy</li>
                  <li className="hover:text-indigo-600 cursor-pointer transition-colors duration-300">Terms</li>
                </ul>
              </div>
            </div>
          </div>
          <div className="border-t border-slate-100 mt-20 pt-8 flex flex-col md:flex-row justify-between items-center gap-4">
            <p className="text-xs font-bold text-slate-400 tracking-widest uppercase">© {new Date().getFullYear()} AuraFunnel Intelligence Corp.</p>
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
