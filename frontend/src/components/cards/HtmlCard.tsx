import React from 'react';
import { CardBack } from './CardBack';
import { COLOR_IDENTITIES } from '../../lib/cards/colorIdentity';

export interface HtmlCardProps {
  color: 'red' | 'blue' | 'green' | 'yellow' | 'wild';
  value: string;
  className?: string;
  isFaceUp?: boolean;
}

export const HtmlCard: React.FC<HtmlCardProps> = ({ color, value, className = '', isFaceUp = true }) => {
  if (!isFaceUp) {
    return <CardBack className={`!w-full !h-full ${className}`} />;
  }

  const colorMap: Record<string, string> = {
    red: 'bg-red-500',
    blue: 'bg-blue-500',
    green: 'bg-green-500',
    yellow: 'bg-yellow-500',
    wild: 'bg-neutral-900',
  };
  
  const bgColor = colorMap[color] || 'bg-white';
  const identity = COLOR_IDENTITIES[color];
  const textColorMap: Record<string, string> = {
    red: 'text-red-700',
    blue: 'text-blue-700',
    green: 'text-green-700',
    yellow: 'text-yellow-700',
    wild: 'text-black',
  };
  const textColor = color === 'wild' ? 'text-black' : textColorMap[color] || 'text-black';

  let displayVal = value;
  if (displayVal === 'draw_two') displayVal = '+2';
  if (displayVal === 'wild_draw_four') displayVal = '+4';
  if (displayVal === 'skip') displayVal = '⊘';
  if (displayVal === 'reverse') displayVal = '⇄';
  if (displayVal === 'wild') displayVal = 'W';

  return (
    <div className={`w-full h-full bg-white rounded-lg sm:rounded-xl shadow-xl flex items-center justify-center p-1 border border-gray-200 [container-type:inline-size] ${className}`}>
      <div className={`w-full h-full rounded sm:rounded-lg ${bgColor} relative flex flex-col items-center justify-center border border-black/10`}>
        <div className="absolute top-1 left-1.5 text-white font-bold text-xs sm:text-sm drop-shadow-md">
          {displayVal}
          <span aria-hidden="true" className="block text-white leading-none mt-0.5">{identity.symbol}</span>
        </div>
        <div className="absolute bottom-1 right-1.5 text-white font-bold text-xs sm:text-sm drop-shadow-md rotate-180">
          {displayVal}
        </div>
        <div className="w-[85%] h-[52%] bg-white rounded-full shadow-inner flex items-center justify-center -rotate-12 border-2 sm:border-4 border-black/5">
          <span className={`font-black text-xl sm:text-2xl md:text-3xl ${textColor} drop-shadow-sm`}>
            {displayVal}
          </span>
        </div>
        <span
          className="absolute bottom-[16%] rounded-full bg-white px-1 py-0.5 font-black leading-none text-neutral-950 uppercase whitespace-nowrap"
          style={{ fontSize: 'clamp(6px, 11cqw, 10px)' }}
        >
          <span aria-hidden="true">{identity.symbol} </span>{identity.name}
        </span>
      </div>
    </div>
  );
};

