'use client';

import React from 'react';

export const CardBack: React.FC<{ className?: string }> = ({ className = '' }) => {
  return (
    <div className={`w-[124px] h-[184px] bg-blue-600 rounded-2xl p-2 flex flex-col justify-between items-center relative overflow-hidden select-none shadow-[0_10px_20px_rgba(0,0,0,0.35)] border border-blue-400/30 ${className}`}>
      {/* Playful Royal Blue Gradient Background */}
      <div className="absolute inset-0 bg-radial-gradient from-blue-500 via-blue-700 to-indigo-950" />

      {/* Polka Dot Micro Texture */}
      <div 
        className="absolute inset-0 opacity-[0.08] pointer-events-none"
        style={{
          backgroundImage: `radial-gradient(#ffffff 2px, transparent 2px)`,
          backgroundSize: '12px 12px'
        }}
      />

      {/* Double Borders: Crisp White + Golden Yellow */}
      <div className="absolute inset-1.5 rounded-xl border-[2px] border-white pointer-events-none" />
      <div className="absolute inset-2.5 rounded-lg border-[1.5px] border-yellow-300 pointer-events-none" />

      {/* Corner Playful Golden Stars */}
      <div className="w-full flex justify-between px-1 pt-0.5 relative z-10">
        <svg viewBox="0 0 24 24" className="w-2.5 h-2.5 text-yellow-300 fill-current">
          <path d="M12 2 C12 7, 7 12, 2 12 C7 12, 12 17, 12 22 C12 17, 17 12, 22 12 C17 12, 12 7, 12 2 Z" />
        </svg>
        <svg viewBox="0 0 24 24" className="w-2.5 h-2.5 text-yellow-300 fill-current">
          <path d="M12 2 C12 7, 7 12, 2 12 C7 12, 12 17, 12 22 C12 17, 17 12, 22 12 C17 12, 12 7, 12 2 Z" />
        </svg>
      </div>

      {/* Center Tilted Badge with 4-Color Unoverse Emblem */}
      <div className="flex flex-col items-center justify-center relative z-10 my-auto -rotate-12">
        {/* Golden outer badge shadow */}
        <div className="w-16 h-12 rounded-[100%] bg-amber-500 p-0.5 flex items-center justify-center shadow-md">
          {/* White badge base */}
          <div className="w-full h-full rounded-[100%] bg-white p-1 flex items-center justify-center relative overflow-hidden">
            {/* 4-Color Quadrant Core */}
            <div className="w-10 h-10 rounded-full relative overflow-hidden flex flex-wrap border-2 border-white shadow-inner">
              <div className="w-1/2 h-1/2 bg-red-500" />
              <div className="w-1/2 h-1/2 bg-blue-500" />
              <div className="w-1/2 h-1/2 bg-yellow-500" />
              <div className="w-1/2 h-1/2 bg-green-500" />
            </div>

            {/* Central White Starburst */}
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <svg viewBox="0 0 24 24" className="w-6 h-6 text-white fill-current drop-shadow-sm">
                <path d="M12 2 C12 7, 7 12, 2 12 C7 12, 12 17, 12 22 C12 17, 17 12, 22 12 C17 12, 12 7, 12 2 Z" />
              </svg>
              <div className="w-1.5 h-1.5 rounded-full bg-yellow-300 absolute inset-1/2 -translate-x-1/2 -translate-y-1/2" />
            </div>
          </div>
        </div>
      </div>

      {/* Bottom Corner Playful Golden Stars */}
      <div className="w-full flex justify-between px-1 pb-0.5 relative z-10">
        <svg viewBox="0 0 24 24" className="w-2.5 h-2.5 text-yellow-300 fill-current">
          <path d="M12 2 C12 7, 7 12, 2 12 C7 12, 12 17, 12 22 C12 17, 17 12, 22 12 C17 12, 12 7, 12 2 Z" />
        </svg>
        <svg viewBox="0 0 24 24" className="w-2.5 h-2.5 text-yellow-300 fill-current">
          <path d="M12 2 C12 7, 7 12, 2 12 C7 12, 12 17, 12 22 C12 17, 17 12, 22 12 C17 12, 12 7, 12 2 Z" />
        </svg>
      </div>
    </div>
  );
};

export default CardBack;


