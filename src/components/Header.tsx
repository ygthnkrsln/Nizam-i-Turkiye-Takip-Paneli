import React from 'react';

export const Header: React.FC = () => {
  return (
    <header id="main-header" className="border-b border-[#3282B8]/20 bg-[#1B262C]/90 backdrop-blur-md sticky top-0 z-30 shadow-[0_4px_24px_-4px_rgba(0,0,0,0.5)]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3">
        <div className="flex items-center gap-3">
          {/* Brand Emblem & Title */}
          <div className="relative group">
            <div className="absolute -inset-0.5 rounded-full bg-gradient-to-r from-[#0F4C75] via-[#3282B8] to-[#BBE1FA] opacity-50 blur-[2px] group-hover:opacity-80 transition duration-300" />
            <img
              src="/favicon.svg"
              alt="War Era Donation Tracker"
              className="relative w-9 h-9 rounded-full object-contain shrink-0 bg-[#1B262C] border border-[#3282B8]/40"
            />
          </div>

          <div className="text-left">
            <div className="text-sm font-black tracking-widest uppercase text-white font-mono leading-tight">
              War Era
            </div>
            <div className="text-[11px] text-[#BBE1FA] font-medium tracking-tight">
              Donation Tracker
            </div>
          </div>
        </div>
      </div>
    </header>
  );
};
