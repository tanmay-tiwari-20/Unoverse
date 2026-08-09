'use client';

import React from 'react';
import type { PresetAvatar } from '../../lib/profile/avatars';

interface HumanAvatarSvgProps {
  preset: PresetAvatar;
  size?: number;
  className?: string;
}

/**
 * High-performance, vector SVG character renderer for Unoverse human avatars.
 * Every avatar features custom, lush hairstyles, realistic facial hair, skin tones,
 * facial structures, accessories, and stylish clothing.
 */
export const HumanAvatarSvg: React.FC<HumanAvatarSvgProps> = ({
  preset,
  size = 56,
  className = '',
}) => {
  const { key, skinTone, hairColor, details, gender } = preset;
  const isFemale = gender === 'female';

  return (
    <svg
      viewBox="0 0 100 100"
      width={size}
      height={size}
      className={`w-full h-full object-contain pointer-events-none select-none ${className}`}
      aria-hidden="true"
    >
      <defs>
        {/* Soft shadow under chin & head elements */}
        <filter id={`chin-shadow-${key}`} x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="0" dy="2.5" stdDeviation="1.5" floodColor="#000000" floodOpacity="0.4" />
        </filter>
        {/* Subtle glow for tech/cyan accessories */}
        <filter id={`glow-cyan-${key}`} x="-30%" y="-30%" width="160%" height="160%">
          <feGaussianBlur stdDeviation="1.2" result="blur" />
          <feComposite in="SourceGraphic" in2="blur" operator="over" />
        </filter>
      </defs>

      {/* ------------------------------------------------------------------ */}
      {/* 1. CLOTHING / SHOULDERS (Bottom Layer)                              */}
      {/* ------------------------------------------------------------------ */}
      {/* Base Clothing Fallback for any character */}
      <path d="M 16,88 Q 50,68 84,88 L 92,100 L 8,100 Z" fill={isFemale ? '#1e1b4b' : '#0f172a'} />
      <path d="M 38,72 Q 50,82 62,72 L 66,100 L 34,100 Z" fill={hairColor} opacity="0.45" />

      {/* Specific Clothing Variants */}
      {key === 'm_alex' && (
        <g>
          <path d="M 18,88 Q 50,68 82,88 L 90,100 L 10,100 Z" fill="#d97706" />
          <path d="M 38,72 Q 50,82 62,72 L 66,100 L 34,100 Z" fill="#b45309" />
          <path d="M 46,76 L 46,94 M 54,76 L 54,94" stroke="#fef3c7" strokeWidth="1.5" strokeLinecap="round" />
        </g>
      )}

      {key === 'm_marcus' && (
        <g>
          <path d="M 18,88 Q 50,68 82,88 L 90,100 L 10,100 Z" fill="#0f172a" />
          <path d="M 36,70 Q 50,80 64,70 L 68,100 L 32,100 Z" fill="#1e293b" />
          <path d="M 40,73 Q 50,80 60,73" stroke="#06b6d4" strokeWidth="2" fill="none" />
        </g>
      )}

      {key === 'm_kai' && (
        <g>
          <path d="M 18,86 Q 50,66 82,86 L 90,100 L 10,100 Z" fill="#18181b" />
          <path d="M 34,70 L 44,95 L 56,95 L 66,70 L 60,68 L 50,76 L 40,68 Z" fill="#27272a" stroke="#a855f7" strokeWidth="1.2" />
        </g>
      )}

      {key === 'm_diego' && (
        <g>
          <path d="M 18,88 Q 50,68 82,88 L 90,100 L 10,100 Z" fill="#78350f" />
          <path d="M 35,68 Q 50,78 65,68 L 58,100 L 42,100 Z" fill="#991b1b" />
        </g>
      )}

      {key === 'm_ethan' && (
        <g>
          <path d="M 18,88 Q 50,68 82,88 L 90,100 L 10,100 Z" fill="#1d4ed8" />
          <path d="M 36,70 Q 50,78 64,70 L 66,100 L 34,100 Z" fill="#64748b" />
        </g>
      )}

      {key === 'm_zayn' && (
        <g>
          <path d="M 18,88 Q 50,68 82,88 L 90,100 L 10,100 Z" fill="#065f46" />
          <path d="M 36,72 Q 50,84 64,72 L 50,100 Z" fill="#022c22" />
          <path d="M 42,75 Q 50,84 58,75" stroke="#fbbf24" strokeWidth="2.5" fill="none" />
        </g>
      )}

      {key === 'm_tariq' && (
        <g>
          <path d="M 18,88 Q 50,68 82,88 L 90,100 L 10,100 Z" fill="#be123c" />
          <path d="M 38,70 Q 50,80 62,70 L 64,100 L 36,100 Z" fill="#f8fafc" />
          <text x="50" y="93" fontSize="11" fontWeight="bold" textAnchor="middle" fill="#be123c" fontFamily="sans-serif">99</text>
        </g>
      )}

      {key === 'm_arjun' && (
        <g>
          <path d="M 18,88 Q 50,68 82,88 L 90,100 L 10,100 Z" fill="#0369a1" />
          <path d="M 38,72 Q 50,80 62,72 L 64,100 L 36,100 Z" fill="#0f172a" />
        </g>
      )}

      {key === 'm_carlos' && (
        <g>
          <path d="M 18,88 Q 50,68 82,88 L 90,100 L 10,100 Z" fill="#b45309" />
          <path d="M 38,72 Q 50,80 62,72 L 64,100 L 36,100 Z" fill="#451a03" />
        </g>
      )}

      {key === 'm_hassan' && (
        <g>
          <path d="M 18,88 Q 50,68 82,88 L 90,100 L 10,100 Z" fill="#115e59" />
          <path d="M 38,72 L 50,92 L 62,72 L 64,100 L 36,100 Z" fill="#042f2e" />
        </g>
      )}

      {key === 'f_aisha' && (
        <g>
          <path d="M 16,86 Q 50,66 84,86 L 90,100 L 10,100 Z" fill="#047857" />
          <path d="M 34,66 Q 50,74 66,66 L 66,88 Q 50,94 34,88 Z" fill="#065f46" />
        </g>
      )}

      {key === 'f_maya' && (
        <g>
          <path d="M 18,88 Q 50,68 82,88 L 90,100 L 10,100 Z" fill="#18181b" />
          <path d="M 38,72 Q 50,82 62,72 L 65,100 L 35,100 Z" fill="#ec4899" />
        </g>
      )}

      {key === 'f_sophia' && (
        <g>
          <path d="M 18,88 Q 50,68 82,88 L 90,100 L 10,100 Z" fill="#2dd4bf" />
          <path d="M 38,72 Q 50,82 62,72 L 65,100 L 35,100 Z" fill="#ccfbf1" />
        </g>
      )}

      {key === 'f_zara' && (
        <g>
          <path d="M 18,88 Q 50,68 82,88 L 90,100 L 10,100 Z" fill="#d97706" />
          <path d="M 38,72 Q 50,82 62,72 L 65,100 L 35,100 Z" fill="#78350f" />
        </g>
      )}

      {key === 'f_chloe' && (
        <g>
          <path d="M 18,88 Q 50,68 82,88 L 90,100 L 10,100 Z" fill="#f43f5e" />
          <path d="M 38,72 Q 50,82 62,72 L 65,100 L 35,100 Z" fill="#fef08a" />
        </g>
      )}

      {key === 'f_amara' && (
        <g>
          <path d="M 18,88 Q 50,68 82,88 L 90,100 L 10,100 Z" fill="#ca8a04" />
          <path d="M 38,72 Q 50,82 62,72 L 65,100 L 35,100 Z" fill="#fef08a" />
        </g>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* 2. NECK & HEAD BASE                                                */}
      {/* ------------------------------------------------------------------ */}
      {/* Neck */}
      <rect x="42" y="56" width="16" height="15" rx="4" fill={skinTone} />
      <path d="M 42,63 Q 50,69 58,63" fill="none" stroke="#000000" strokeOpacity="0.12" strokeWidth="2.5" />

      {/* Head Base */}
      <g filter={`url(#chin-shadow-${key})`}>
        {isFemale ? (
          <path
            d="M 29,35 C 29,18 71,18 71,35 C 71,54 63,66 50,66 C 37,66 29,54 29,35 Z"
            fill={skinTone}
          />
        ) : (
          <path
            d="M 27,35 C 27,18 73,18 73,35 C 73,55 64,67 50,67 C 36,67 27,55 27,35 Z"
            fill={skinTone}
          />
        )}
      </g>

      {/* Ears */}
      <circle cx="27" cy="41" r="4.5" fill={skinTone} />
      <circle cx="73" cy="41" r="4.5" fill={skinTone} />

      {/* Earring accessories */}
      {(key === 'f_sophia' || key === 'f_priya' || key === 'f_aisha' || key === 'f_amara' || key === 'f_soraya') && (
        <g>
          <circle cx="26" cy="46" r="3.2" fill="none" stroke="#fbbf24" strokeWidth="1.8" />
          <circle cx="74" cy="46" r="3.2" fill="none" stroke="#fbbf24" strokeWidth="1.8" />
        </g>
      )}
      {(key === 'f_zoe' || key === 'm_kwame') && (
        <circle cx="26" cy="43" r="2" fill="#e2e8f0" />
      )}

      {/* ------------------------------------------------------------------ */}
      {/* 3. EYES, EYEBROWS, NOSE, MOUTH                                     */}
      {/* ------------------------------------------------------------------ */}
      {/* Eyebrows */}
      <path
        d={isFemale ? 'M 34,32 Q 40,29 46,32' : 'M 33,31 Q 40,28 47,31'}
        fill="none"
        stroke={hairColor}
        strokeWidth={isFemale ? '2.2' : '3'}
        strokeLinecap="round"
      />
      <path
        d={isFemale ? 'M 54,32 Q 60,29 66,32' : 'M 53,31 Q 60,28 67,31'}
        fill="none"
        stroke={hairColor}
        strokeWidth={isFemale ? '2.2' : '3'}
        strokeLinecap="round"
      />

      {/* Eyes */}
      <g>
        {/* Left Eye */}
        <ellipse cx="40" cy="39" rx="3.5" ry="4" fill="#ffffff" />
        <circle cx="40.5" cy="39.5" r="2.3" fill="#0f172a" />
        <circle cx="41.5" cy="38.5" r="0.9" fill="#ffffff" />

        {/* Right Eye */}
        <ellipse cx="60" cy="39" rx="3.5" ry="4" fill="#ffffff" />
        <circle cx="59.5" cy="39.5" r="2.3" fill="#0f172a" />
        <circle cx="58.5" cy="38.5" r="0.9" fill="#ffffff" />
      </g>

      {/* Eyeliner / Lashes for females */}
      {isFemale && (
        <g stroke="#09090b" strokeWidth="1.4" fill="none" strokeLinecap="round">
          <path d="M 35.5,38 Q 40,35.5 44.5,38" />
          <path d="M 55.5,38 Q 60,35.5 64.5,38" />
        </g>
      )}

      {/* Nose */}
      <path d="M 50,40 L 48.5,47 Q 50,49.5 51.5,47" fill="none" stroke="#000000" strokeOpacity="0.28" strokeWidth="1.6" strokeLinecap="round" />

      {/* Nose Ring */}
      {key === 'f_fatima' && (
        <circle cx="52.5" cy="48" r="1.5" fill="none" stroke="#fbbf24" strokeWidth="1" />
      )}

      {/* Mouth */}
      {key === 'm_zayn' || key === 'f_zoe' ? (
        <path d="M 44,55 Q 50,58 57,53" fill="none" stroke="#881337" strokeWidth="2.2" strokeLinecap="round" />
      ) : key === 'f_maya' || key === 'f_chloe' || key === 'm_alex' ? (
        <path d="M 43,53 Q 50,61 57,53 Z" fill="#be123c" />
      ) : (
        <path d="M 43,54 Q 50,59 57,54" fill="none" stroke="#881337" strokeWidth="2.2" strokeLinecap="round" />
      )}

      {/* Bindi Accent */}
      {key === 'f_priya' && <circle cx="50" cy="32" r="1.5" fill="#dc2626" />}

      {/* ------------------------------------------------------------------ */}
      {/* 4. REALISTIC, STYLISH FACIAL HAIR & BEARDS                         */}
      {/* ------------------------------------------------------------------ */}
      {/* Light Stubble (Alex, Kiran) */}
      {(details.facialHair === 'light_stubble' || key === 'm_kiran') && (
        <path
          d="M 31,45 C 31,64 69,64 69,45 C 69,60 61,66.5 50,66.5 C 39,66.5 31,60 31,45 Z"
          fill={hairColor}
          opacity="0.35"
        />
      )}

      {/* Heavy 5 O'Clock Stubble (Tariq, Rex) */}
      {details.facialHair === 'heavy_stubble' && (
        <g opacity="0.55">
          <path d="M 30,44 C 30,65 70,65 70,44 C 70,61 61,67 50,67 C 39,67 30,61 30,44 Z" fill={hairColor} />
          <path d="M 42,50 Q 50,53 58,50" fill="none" stroke={skinTone} strokeWidth="2" strokeLinecap="round" />
        </g>
      )}

      {/* Full Trimmed Beard (Marcus, Hassan, Arjun) */}
      {(details.facialHair === 'full_beard' || key === 'm_hassan' || key === 'm_arjun') && (
        <g>
          {/* Main Beard Volume */}
          <path
            d="M 28,42 C 28,68 72,68 72,42 C 72,62 63,69 50,69 C 37,69 28,62 28,42 Z"
            fill={hairColor}
          />
          {/* Mustache arc */}
          <path d="M 40,49 Q 50,54 60,49 Q 50,51 40,49 Z" fill={hairColor} />
          {/* Lip Cutout */}
          <path d="M 43,51 Q 50,56 57,51" fill="none" stroke={skinTone} strokeWidth="2" strokeLinecap="round" />
        </g>
      )}

      {/* Short Boxed Beard (Diego, Kwame) */}
      {(details.facialHair === 'boxed_beard' || key === 'm_kwame') && (
        <g>
          <path d="M 29,44 C 29,66 71,66 71,44 C 71,60 62,68 50,68 C 38,68 29,60 29,44 Z" fill={hairColor} />
          <path d="M 41,50 Q 50,54 59,50" fill="none" stroke={hairColor} strokeWidth="3" strokeLinecap="round" />
          <path d="M 44,52 Q 50,56 56,52" fill="none" stroke={skinTone} strokeWidth="2" strokeLinecap="round" />
        </g>
      )}

      {/* Sculpted Goatee & Mustache (Zayn, Carlos) */}
      {(details.facialHair === 'goatee' || key === 'm_carlos') && (
        <g>
          <path d="M 41,50 Q 50,54 59,50" fill="none" stroke={hairColor} strokeWidth="3.5" strokeLinecap="round" />
          <path d="M 42,54 C 42,67 58,67 58,54 Z" fill={hairColor} />
          <path d="M 46,55 Q 50,58 54,55" fill="none" stroke={skinTone} strokeWidth="1.8" strokeLinecap="round" />
        </g>
      )}

      {/* Long Viking Beard (Viktor) */}
      {details.facialHair === 'long_beard' && (
        <g filter={`url(#chin-shadow-${key})`}>
          <path d="M 28,42 C 28,78 72,78 72,42 C 72,68 63,80 50,80 C 37,80 28,68 28,42 Z" fill={hairColor} />
          <path d="M 40,49 Q 50,54 60,49" fill="none" stroke={hairColor} strokeWidth="4" strokeLinecap="round" />
        </g>
      )}

      {/* Chin Beard & Mustache (Leo) */}
      {details.facialHair === 'chin_beard' && (
        <g>
          <path d="M 41,50 Q 50,54 59,50" fill="none" stroke={hairColor} strokeWidth="3.5" strokeLinecap="round" />
          <path d="M 45,60 L 55,60 L 50,68 Z" fill={hairColor} />
        </g>
      )}

      {/* Mustache & Soul Patch (Kenji, Mateo) */}
      {(details.facialHair === 'mustache_patch' || key === 'm_mateo') && (
        <g>
          <path d="M 41,50 Q 50,54 59,50" fill="none" stroke={hairColor} strokeWidth="3.5" strokeLinecap="round" />
          <rect x="48" y="57" width="4" height="4" rx="1.5" fill={hairColor} />
        </g>
      )}

      {/* Short Beard (Sam, Tomas) */}
      {(details.facialHair === 'short_beard' || key === 'm_tomas') && (
        <path d="M 30,45 C 30,64 70,64 70,45 C 70,59 61,66 50,66 C 39,66 30,59 30,45 Z" fill={hairColor} opacity="0.85" />
      )}

      {/* Scar Accent */}
      {key === 'm_rex' && (
        <line x1="38" y1="34" x2="42" y2="44" stroke="#e11d48" strokeWidth="1.5" strokeLinecap="round" opacity="0.8" />
      )}

      {/* ------------------------------------------------------------------ */}
      {/* 5. LUSH, BEAUTIFUL HAIRSTYLES FOR ALL 40 CHARACTERS                */}
      {/* ------------------------------------------------------------------ */}
      {/* MALE HAIRSTYLES */}
      {key === 'm_alex' && (
        <g>
          <path d="M 23,35 C 23,15 77,15 77,35 C 77,22 66,13 50,13 C 34,13 23,22 23,35 Z" fill={hairColor} />
          <path d="M 23,32 Q 38,18 54,26 Q 36,27 23,32 Z" fill="#44403c" />
        </g>
      )}

      {key === 'm_marcus' && (
        <path d="M 24,35 C 24,14 76,14 76,35 C 76,21 66,12 50,12 C 34,12 24,21 24,35 Z" fill={hairColor} />
      )}

      {key === 'm_kai' && (
        <g>
          <path d="M 22,33 C 22,12 78,12 78,33 C 78,19 66,10 50,10 C 34,10 22,19 22,33 Z" fill={hairColor} />
          <path d="M 28,24 Q 45,10 70,16 Q 50,20 28,24 Z" fill="#f8fafc" />
        </g>
      )}

      {key === 'm_diego' && (
        <g>
          <path d="M 21,38 C 19,14 81,14 79,38 C 79,26 68,12 50,12 C 32,12 21,26 21,38 Z" fill={hairColor} />
          <path d="M 21,30 Q 17,46 23,50 M 79,30 Q 83,46 77,50" fill="none" stroke={hairColor} strokeWidth="5.5" strokeLinecap="round" />
        </g>
      )}

      {key === 'm_ethan' && (
        <path d="M 22,34 Q 28,10 50,11 Q 72,10 78,34 Q 66,20 58,25 Q 50,16 42,25 Q 34,20 22,34 Z" fill={hairColor} />
      )}

      {key === 'm_zayn' && (
        <path d="M 23,35 C 23,8 77,8 77,35 C 77,15 67,6 50,6 C 33,6 23,15 23,35 Z" fill={hairColor} />
      )}

      {key === 'm_viktor' && (
        <path d="M 25,35 C 25,12 75,12 75,35 C 75,17 65,8 50,8 C 35,8 25,17 25,35 Z" fill={hairColor} />
      )}

      {key === 'm_tariq' && (
        <path d="M 25,36 C 25,20 75,20 75,36 C 75,23 65,16 50,16 C 35,16 25,23 25,36 Z" fill={hairColor} />
      )}

      {key === 'm_leo' && (
        <g>
          <path d="M 21,36 C 19,12 81,12 79,36 C 79,50 77,64 74,72 M 21,36 C 21,50 23,64 26,72" fill="none" stroke={hairColor} strokeWidth="6.5" strokeLinecap="round" />
          <path d="M 23,34 C 23,14 77,14 77,34 Z" fill={hairColor} />
          <circle cx="50" cy="8" r="7.5" fill={hairColor} />
        </g>
      )}

      {key === 'm_kenji' && (
        <path d="M 22,35 Q 32,12 52,12 Q 78,14 78,35 Q 63,20 45,20 Q 32,23 22,35 Z" fill={hairColor} />
      )}

      {key === 'm_sam' && (
        <g>
          <path d="M 21,34 C 21,12 79,12 79,34 Z" fill="#ca8a04" />
          <rect x="19" y="30" width="62" height="9" rx="3.5" fill="#a16207" />
        </g>
      )}

      {key === 'm_rex' && (
        <path d="M 25,35 C 25,18 75,18 75,35 C 75,21 65,14 50,14 C 35,14 25,21 25,35 Z" fill={hairColor} />
      )}

      {key === 'm_arjun' && (
        <path d="M 22,35 C 22,10 78,10 78,35 C 78,16 66,7 50,7 C 34,7 22,16 22,35 Z" fill={hairColor} />
      )}

      {key === 'm_carlos' && (
        <path d="M 22,34 C 20,12 80,12 78,34 Q 50,18 22,34 Z" fill={hairColor} stroke={hairColor} strokeWidth="4" />
      )}

      {key === 'm_hassan' && (
        <path d="M 23,35 Q 35,13 55,13 Q 77,15 77,35 Q 62,20 44,20 Q 31,23 23,35 Z" fill={hairColor} />
      )}

      {key === 'm_kwame' && (
        <g>
          <path d="M 20,36 Q 16,58 24,76 M 80,36 Q 84,58 76,76" stroke={hairColor} strokeWidth="7" fill="none" strokeLinecap="round" />
          <path d="M 23,34 C 23,14 77,14 77,34 Q 50,20 23,34 Z" fill={hairColor} />
          <circle cx="50" cy="11" r="7" fill={hairColor} />
        </g>
      )}

      {key === 'm_chen' && (
        <g>
          <path d="M 21,35 Q 35,13 50,15 Q 65,13 79,35 Q 64,22 50,24 Q 36,22 21,35 Z" fill={hairColor} />
          <path d="M 21,35 Q 18,48 24,52 M 79,35 Q 82,48 76,52" fill="none" stroke={hairColor} strokeWidth="4" strokeLinecap="round" />
        </g>
      )}

      {key === 'm_mateo' && (
        <path d="M 22,35 C 22,12 78,12 78,35 C 78,18 66,9 50,9 C 34,9 22,18 22,35 Z" fill={hairColor} />
      )}

      {key === 'm_tomas' && (
        <g>
          <path d="M 23,34 C 23,14 77,14 77,34 Q 50,20 23,34 Z" fill={hairColor} />
          <circle cx="50" cy="9" r="7" fill={hairColor} />
        </g>
      )}

      {key === 'm_kiran' && (
        <path d="M 23,35 C 21,15 79,15 77,35 Q 50,20 23,35 Z" fill={hairColor} stroke={hairColor} strokeWidth="3" />
      )}

      {/* FEMALE HAIRSTYLES */}
      {key === 'f_maya' && (
        <g>
          <path d="M 21,36 C 17,50 15,72 22,82 M 79,36 C 83,50 85,72 78,82" stroke={hairColor} strokeWidth="9.5" fill="none" strokeLinecap="round" />
          <path d="M 24,34 C 24,15 76,15 76,34 Q 50,20 24,34 Z" fill={hairColor} />
          <path d="M 20,45 Q 16,65 22,80" stroke="#c084fc" strokeWidth="3.5" fill="none" />
        </g>
      )}

      {key === 'f_sophia' && (
        <g>
          <path d="M 22,34 L 20,62 C 20,66 28,66 28,62 L 28,34 Z M 78,34 L 80,62 C 80,66 72,66 72,62 L 72,34 Z" fill={hairColor} />
          <path d="M 23,34 C 23,14 77,14 77,34 Q 50,19 23,34 Z" fill={hairColor} />
        </g>
      )}

      {key === 'f_zara' && (
        <g>
          <circle cx="50" cy="10" r="12" fill={hairColor} />
          <path d="M 23,36 C 23,16 77,16 77,36 Q 50,20 23,36 Z" fill={hairColor} />
        </g>
      )}

      {key === 'f_elena' && (
        <g>
          <path d="M 23,34 C 23,15 77,15 77,34 Q 50,20 23,34 Z" fill={hairColor} />
          <path d="M 72,36 Q 82,56 75,78" stroke={hairColor} strokeWidth="8.5" fill="none" strokeLinecap="round" />
        </g>
      )}

      {key === 'f_chloe' && (
        <g>
          <path d="M 72,22 C 86,22 90,44 83,58" stroke={hairColor} strokeWidth="8.5" fill="none" strokeLinecap="round" />
          <path d="M 23,34 C 23,14 77,14 77,34 Q 50,20 23,34 Z" fill={hairColor} />
          <circle cx="72" cy="22" r="4.5" fill="#f43f5e" />
        </g>
      )}

      {key === 'f_yuki' && (
        <g>
          <rect x="19" y="32" width="9" height="36" rx="2.5" fill={hairColor} />
          <rect x="72" y="32" width="9" height="36" rx="2.5" fill={hairColor} />
          <path d="M 22,34 C 22,14 78,14 78,34 L 78,26 L 22,26 Z" fill={hairColor} />
        </g>
      )}

      {key === 'f_nora' && (
        <g>
          <path d="M 72,25 Q 84,48 77,72" stroke={hairColor} strokeWidth="7.5" fill="none" strokeLinecap="round" />
          <path d="M 24,34 C 24,16 76,16 76,36 Z" fill={hairColor} />
          <path d="M 20,29 L 80,29 L 75,24 L 25,24 Z" fill="#0284c7" />
        </g>
      )}

      {key === 'f_aria' && (
        <g>
          <path d="M 20,36 C 16,52 14,74 20,86 M 80,36 C 84,52 86,74 80,86" stroke={hairColor} strokeWidth="9.5" fill="none" strokeLinecap="round" />
          <path d="M 23,34 C 23,14 77,14 77,34 Q 50,20 23,34 Z" fill={hairColor} />
          <path d="M 30,20 A 4 4 0 1 0 34,24 A 3 3 0 1 1 30,20 Z" fill="#fef08a" />
        </g>
      )}

      {key === 'f_priya' && (
        <g>
          <path d="M 20,36 C 16,52 16,74 22,86 M 80,36 C 84,52 84,74 78,86" stroke={hairColor} strokeWidth="9.5" fill="none" strokeLinecap="round" />
          <path d="M 23,34 C 23,14 77,14 77,34 Q 50,19 23,34 Z" fill={hairColor} />
        </g>
      )}

      {key === 'f_zoe' && (
        <g>
          <path d="M 21,34 C 21,14 79,14 79,34 Q 60,16 33,25 Z" fill={hairColor} />
          <path d="M 24,29 Q 38,18 48,31 Q 33,33 24,29 Z" fill="#06b6d4" />
        </g>
      )}

      {key === 'f_leila' && (
        <g>
          <path d="M 20,36 C 14,50 16,66 22,74 M 80,36 C 86,50 84,66 78,74" stroke={hairColor} strokeWidth="10.5" fill="none" strokeLinecap="round" />
          <path d="M 23,34 C 23,14 77,14 77,34 Q 50,19 23,34 Z" fill={hairColor} />
        </g>
      )}

      {key === 'f_nova' && (
        <g>
          <path d="M 23,34 C 23,15 77,15 77,34 Q 50,19 23,34 Z" fill={hairColor} />
          <path d="M 30,23 Q 45,14 58,25" stroke="#f59e0b" strokeWidth="3.5" fill="none" />
        </g>
      )}

      {key === 'f_lin' && (
        <g>
          <path d="M 21,34 L 19,60 C 19,64 27,64 27,60 L 27,34 Z M 79,34 L 81,60 C 81,64 73,64 73,60 L 73,34 Z" fill={hairColor} />
          <path d="M 22,34 C 22,14 78,14 78,34 Q 50,19 22,34 Z" fill={hairColor} />
          <path d="M 19,54 L 27,54 M 73,54 L 81,54" stroke="#c084fc" strokeWidth="4" />
        </g>
      )}

      {key === 'f_amara' && (
        <g>
          <circle cx="50" cy="16" r="21" fill={hairColor} />
          <path d="M 23,35 C 23,17 77,17 77,35 Q 50,21 23,35 Z" fill={hairColor} />
        </g>
      )}

      {key === 'f_fatima' && (
        <g>
          <path d="M 20,36 C 16,52 16,74 22,86 M 80,36 C 84,52 84,74 78,86" stroke={hairColor} strokeWidth="9.5" fill="none" strokeLinecap="round" />
          <path d="M 23,34 C 23,14 77,14 77,34 Q 50,19 23,34 Z" fill={hairColor} />
        </g>
      )}

      {key === 'f_isabella' && (
        <g>
          <path d="M 20,36 C 16,52 16,74 22,86 M 80,36 C 84,52 84,74 78,86" stroke={hairColor} strokeWidth="9.5" fill="none" strokeLinecap="round" />
          <path d="M 23,34 C 23,14 77,14 77,34 Q 50,19 23,34 Z" fill={hairColor} />
          <circle cx="72" cy="24" r="4.5" fill="#f43f5e" />
        </g>
      )}

      {key === 'f_freja' && (
        <g>
          <path d="M 23,34 C 23,14 77,14 77,34 Q 50,19 23,34 Z" fill={hairColor} />
          <path d="M 26,22 Q 50,14 74,22" stroke={hairColor} strokeWidth="4.5" fill="none" />
        </g>
      )}

      {key === 'f_keilani' && (
        <g>
          <path d="M 19,36 C 15,52 15,74 21,86 M 81,36 C 85,52 85,74 79,86" stroke={hairColor} strokeWidth="10" fill="none" strokeLinecap="round" />
          <path d="M 23,34 C 23,14 77,14 77,34 Q 50,19 23,34 Z" fill={hairColor} />
          <circle cx="28" cy="24" r="4.5" fill="#06b6d4" />
        </g>
      )}

      {key === 'f_soraya' && (
        <g>
          <path d="M 19,36 C 13,50 15,66 21,75 M 81,36 C 87,50 85,66 79,75" stroke={hairColor} strokeWidth="11" fill="none" strokeLinecap="round" />
          <path d="M 23,34 C 23,14 77,14 77,34 Q 50,19 23,34 Z" fill={hairColor} />
        </g>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* 6. ACCESSORIES & OVERLAYS (Glasses, Headsets, Visors)               */}
      {/* ------------------------------------------------------------------ */}
      {key === 'f_maya' && (
        <g filter={`url(#glow-cyan-${key})`}>
          <path d="M 24,40 C 24,16 76,16 76,40" fill="none" stroke="#ec4899" strokeWidth="4" />
          <rect x="20" y="36" width="7" height="14" rx="3" fill="#f43f5e" />
          <rect x="73" y="36" width="7" height="14" rx="3" fill="#f43f5e" />
          <polygon points="30,18 38,4 42,20" fill="#ec4899" />
          <polygon points="70,18 62,4 58,20" fill="#ec4899" />
        </g>
      )}

      {key === 'm_marcus' && (
        <g filter={`url(#glow-cyan-${key})`}>
          <path d="M 24,40 C 24,16 76,16 76,40" fill="none" stroke="#06b6d4" strokeWidth="4" />
          <rect x="20" y="35" width="7" height="15" rx="3" fill="#0891b2" />
          <rect x="73" y="35" width="7" height="15" rx="3" fill="#0891b2" />
        </g>
      )}

      {key === 'f_zara' && (
        <g>
          <rect x="32" y="35" width="16" height="10" rx="3" fill="#18181b" stroke="#fbbf24" strokeWidth="1.5" />
          <rect x="52" y="35" width="16" height="10" rx="3" fill="#18181b" stroke="#fbbf24" strokeWidth="1.5" />
          <line x1="48" y1="39" x2="52" y2="39" stroke="#fbbf24" strokeWidth="1.5" />
        </g>
      )}

      {key === 'm_viktor' && (
        <g filter={`url(#glow-cyan-${key})`}>
          <polygon points="30,36 48,36 46,44 32,44" fill="#db2777" opacity="0.88" />
          <polygon points="52,36 70,36 68,44 54,44" fill="#db2777" opacity="0.88" />
          <line x1="48" y1="38" x2="52" y2="38" stroke="#f472b6" strokeWidth="2" />
        </g>
      )}

      {(key === 'm_kenji' || key === 'f_leila' || key === 'm_chen' || key === 'f_lin') && (
        <g>
          <circle cx="39" cy="40" r="6" fill="none" stroke="#475569" strokeWidth="1.8" />
          <circle cx="61" cy="40" r="6" fill="none" stroke="#475569" strokeWidth="1.8" />
          <line x1="45" y1="40" x2="55" y2="40" stroke="#475569" strokeWidth="1.8" />
        </g>
      )}

      {key === 'f_yuki' && (
        <path d="M 28,33 L 72,33 L 68,39 L 32,39 Z" fill="#06b6d4" opacity="0.85" />
      )}

      {key === 'f_nova' && (
        <g>
          <polygon points="54,35 66,35 64,43 56,43" fill="#312e81" stroke="#818cf8" strokeWidth="1.2" />
          <path d="M 24,41 Q 22,57 36,59" fill="none" stroke="#f59e0b" strokeWidth="2" strokeLinecap="round" />
          <circle cx="36" cy="59" r="2.5" fill="#fbbf24" />
        </g>
      )}
    </svg>
  );
};

export default HumanAvatarSvg;
