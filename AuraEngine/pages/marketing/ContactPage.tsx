import React, { useState } from 'react';

const inputClass =
  'mt-2.5 block w-full rounded-xl border border-[#EAE3D6] bg-white px-3.5 py-2.5 text-[#1C1A17] placeholder-[#B0A798] shadow-sm focus:border-teal-600/50 focus:ring-2 focus:ring-teal-600/20 outline-none transition';

const ContactPage: React.FC = () => {
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
  };

  return (
    <div className="bg-[#FBFAF7] text-[#1C1A17] pt-36 pb-24">
      <div className="mx-auto max-w-[1180px] px-6">
        <div className="mx-auto max-w-2xl text-center">
          <p className="eyebrow text-teal-700 mb-5">Contact</p>
          <h1 className="font-display text-4xl lg:text-[3.25rem] leading-[1.06] font-medium tracking-[-0.02em] text-[#1C1A17]">
            Let’s talk growth
          </h1>
          <p className="mt-4 text-lg leading-8 text-[#6F6860]">
            Questions about the AI, or not sure which plan fits? We’re a small team and we read every message.
          </p>
        </div>

        <div className="mx-auto mt-14 max-w-xl">
          {submitted ? (
            <div className="bg-[#EAF2EF] border border-teal-600/20 p-12 rounded-[1.5rem] text-center">
              <div className="text-5xl mb-4">🎉</div>
              <h3 className="font-display text-2xl font-medium text-teal-800">Message received</h3>
              <p className="text-[#4B7268] mt-2">We’ll get back to you within one business day.</p>
              <button
                onClick={() => setSubmitted(false)}
                className="mt-6 text-teal-700 font-semibold hover:text-teal-800 transition-colors"
              >
                Send another message
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="grid grid-cols-1 gap-x-8 gap-y-6 sm:grid-cols-2">
                <div>
                  <label htmlFor="first-name" className="block text-sm font-semibold text-[#1C1A17]">First name</label>
                  <input type="text" required id="first-name" className={inputClass} />
                </div>
                <div>
                  <label htmlFor="last-name" className="block text-sm font-semibold text-[#1C1A17]">Last name</label>
                  <input type="text" required id="last-name" className={inputClass} />
                </div>
                <div className="sm:col-span-2">
                  <label htmlFor="email" className="block text-sm font-semibold text-[#1C1A17]">Email</label>
                  <input type="email" required id="email" className={inputClass} />
                </div>
                <div className="sm:col-span-2">
                  <label htmlFor="company" className="block text-sm font-semibold text-[#1C1A17]">Company</label>
                  <input type="text" id="company" className={inputClass} />
                </div>
                <div className="sm:col-span-2">
                  <label htmlFor="message" className="block text-sm font-semibold text-[#1C1A17]">Message</label>
                  <textarea id="message" rows={4} className={inputClass}></textarea>
                </div>
              </div>
              <button
                type="submit"
                className="block w-full rounded-full bg-[#1C1A17] px-3.5 py-4 text-center text-[15px] font-semibold text-white shadow-chic hover:bg-black hover:-translate-y-0.5 transition-all"
              >
                Send message
              </button>
              <p className="text-center text-xs text-[#9A9189]">
                Prefer email? Reach us at <a href="mailto:hello@scaliyo.com" className="text-teal-700 font-semibold hover:text-teal-800">hello@scaliyo.com</a>
              </p>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};

export default ContactPage;
