
import React, { useState } from 'react';

const ContactPage: React.FC = () => {
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
  };

  return (
    <div className="bg-white py-24 sm:py-32">
      <div className="mx-auto max-w-7xl px-6 lg:px-8">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">Let's Talk Growth</h2>
          <p className="mt-2 text-lg leading-8 text-slate-600">
            Have questions about our AI models or need a custom enterprise quote? We're here to help.
          </p>
        </div>

        <div className="mx-auto mt-16 max-w-xl sm:mt-20">
          {submitted ? (
            <div className="bg-emerald-50 border border-emerald-100 p-12 rounded-3xl text-center">
              <div className="text-5xl mb-4">🎉</div>
              <h3 className="text-2xl font-bold text-emerald-800">Message Received!</h3>
              <p className="text-emerald-600 mt-2">One of our sales specialists will reach out to you within 2 hours.</p>
              <button 
                onClick={() => setSubmitted(false)}
                className="mt-6 text-indigo-600 font-bold hover:underline"
              >
                Send another message
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="grid grid-cols-1 gap-x-8 gap-y-6 sm:grid-cols-2">
                <div>
                  <label htmlFor="first-name" className="block text-sm font-semibold leading-6 text-slate-900">First name</label>
                  <input type="text" required id="first-name" className="mt-2.5 block w-full rounded-xl border border-slate-200 px-3.5 py-2 text-slate-900 shadow-sm ring-1 ring-inset ring-slate-300 focus:ring-2 focus:ring-inset focus:ring-indigo-600 outline-none" />
                </div>
                <div>
                  <label htmlFor="last-name" className="block text-sm font-semibold leading-6 text-slate-900">Last name</label>
                  <input type="text" required id="last-name" className="mt-2.5 block w-full rounded-xl border border-slate-200 px-3.5 py-2 text-slate-900 shadow-sm ring-1 ring-inset ring-slate-300 focus:ring-2 focus:ring-inset focus:ring-indigo-600 outline-none" />
                </div>
                <div className="sm:col-span-2">
                  <label htmlFor="email" className="block text-sm font-semibold leading-6 text-slate-900">Email</label>
                  <input type="email" required id="email" className="mt-2.5 block w-full rounded-xl border border-slate-200 px-3.5 py-2 text-slate-900 shadow-sm ring-1 ring-inset ring-slate-300 focus:ring-2 focus:ring-inset focus:ring-indigo-600 outline-none" />
                </div>
                <div className="sm:col-span-2">
                  <label htmlFor="company" className="block text-sm font-semibold leading-6 text-slate-900">Company</label>
                  <input type="text" id="company" className="mt-2.5 block w-full rounded-xl border border-slate-200 px-3.5 py-2 text-slate-900 shadow-sm ring-1 ring-inset ring-slate-300 focus:ring-2 focus:ring-inset focus:ring-indigo-600 outline-none" />
                </div>
                <div className="sm:col-span-2">
                  <label htmlFor="message" className="block text-sm font-semibold leading-6 text-slate-900">Message</label>
                  <textarea id="message" rows={4} className="mt-2.5 block w-full rounded-xl border border-slate-200 px-3.5 py-2 text-slate-900 shadow-sm ring-1 ring-inset ring-slate-300 focus:ring-2 focus:ring-inset focus:ring-indigo-600 outline-none"></textarea>
                </div>
              </div>
              <button type="submit" className="block w-full rounded-xl bg-indigo-600 px-3.5 py-4 text-center text-lg font-bold text-white shadow-xl shadow-indigo-100 hover:bg-indigo-500 transition-all">
                Send Message
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};

export default ContactPage;
