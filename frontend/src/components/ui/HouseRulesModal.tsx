'use client';

import React, { useMemo, useRef } from 'react';
import { motion } from 'framer-motion';
import * as Icons from 'lucide-react';
import { X, Lock, ScrollText, RotateCcw, Minus, Plus, Eye, LucideIcon } from 'lucide-react';
import { useSettingsStore } from '../../store/useSettingsStore';
import { useGameStore } from '../../store/useGameStore';
import { useSocket } from '../../hooks/useSocket';
import { useDialogA11y } from '../../hooks/useDialogA11y';
import {
  HouseRules,
  DEFAULT_HOUSE_RULES,
  HOUSE_RULE_CATEGORIES,
  RuleFieldDef,
  isRuleActive,
  normalizeHouseRules,
} from '../../lib/houseRules';

// Static accent classes per category. Tailwind v4 scans for literal class strings,
// so dynamic `bg-${accent}-500/10` would never be generated — map them explicitly.
const ACCENT: Record<string, { headerBg: string; icon: string }> = {
  fuchsia: { headerBg: 'bg-fuchsia-500/10', icon: 'text-fuchsia-400' },
  orange: { headerBg: 'bg-orange-500/10', icon: 'text-orange-400' },
  cyan: { headerBg: 'bg-cyan-500/10', icon: 'text-cyan-400' },
  violet: { headerBg: 'bg-violet-500/10', icon: 'text-violet-400' },
  rose: { headerBg: 'bg-rose-500/10', icon: 'text-rose-400' },
  emerald: { headerBg: 'bg-emerald-500/10', icon: 'text-emerald-400' },
  yellow: { headerBg: 'bg-yellow-500/10', icon: 'text-yellow-400' },
  blue: { headerBg: 'bg-blue-500/10', icon: 'text-blue-400' },
};

/**
 * House Rules panel. Renders every rule generically from HOUSE_RULE_CATEGORIES.
 * The host edits; everyone else sees a live, read-only view. Rules lock once the
 * game leaves the lobby. Changes are applied optimistically and pushed to the
 * server, which re-normalizes and broadcasts the authoritative result to all.
 */
export const HouseRulesModal: React.FC = () => {
  const { isHouseRulesOpen, setIsHouseRulesOpen } = useSettingsStore();
  const houseRules = useGameStore((state) => state.houseRules);
  const player = useGameStore((state) => state.player);
  const gameStatus = useGameStore((state) => state.gameStatus);
  const addToast = useGameStore((state) => state.addToast);
  const { updateHouseRules } = useSocket();
  const modalRef = useRef<HTMLDivElement>(null);

  // Focus trap + initial focus + focus restore + Escape-to-close. Called before
  // the early return so hook order stays stable.
  useDialogA11y(modalRef, isHouseRulesOpen, () => setIsHouseRulesOpen(false));

  const rules = useMemo(() => normalizeHouseRules(houseRules), [houseRules]);
  const isHost = !!player?.isHost;
  const locked = gameStatus !== 'lobby';
  const canEdit = isHost && !locked;

  if (!isHouseRulesOpen) return null;

  const commit = (next: HouseRules) => {
    const normalized = normalizeHouseRules(next);
    // Optimistic local update so the host's UI feels instant; server confirms.
    useGameStore.getState().setHouseRules(normalized);
    updateHouseRules(normalized);
  };

  const setField = (key: keyof HouseRules, value: boolean | number | string) => {
    if (!canEdit) return;
    commit({ ...rules, [key]: value } as HouseRules);
  };

  const resetDefaults = () => {
    if (!canEdit) return;
    commit({ ...DEFAULT_HOUSE_RULES });
    addToast('House rules reset to defaults', 'info');
  };

  // A finish-restriction toggle is greyed out while "number card finish only" is on.
  const fieldDisabled = (f: RuleFieldDef): boolean => {
    if (!canEdit) return true;
    if (f.dependsOn === 'numberCardFinishOnly') return rules.numberCardFinishOnly;
    if (f.dependsOn) return !isRuleActive(rules, f.key);
    return false;
  };

  const handleOutside = (e: React.MouseEvent) => {
    if (modalRef.current && !modalRef.current.contains(e.target as Node)) {
      setIsHouseRulesOpen(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[1100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-3 sm:p-6"
      onClick={handleOutside}
    >
      <motion.div
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="house-rules-title"
        tabIndex={-1}
        initial={{ opacity: 0, scale: 0.95, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ type: 'spring', damping: 25, stiffness: 300 }}
        className="w-full max-w-5xl bg-gradient-to-b from-neutral-900/97 to-black/97 backdrop-blur-xl panel-arcade overflow-hidden flex flex-col max-h-[92dvh]"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 sm:px-6 py-4 border-b-2 border-white/15 bg-fuchsia-600/15">
          <h2 id="house-rules-title" className="font-arcade text-lg sm:text-xl uppercase tracking-wide text-yellow-400 arcade-stroke-uno-sm flex items-center gap-2">
            <ScrollText size={20} className="text-white" /> House Rules
          </h2>
          <div className="flex items-center gap-2">
            {canEdit && (
              <button
                onClick={resetDefaults}
                className="chip-arcade h-9 px-3 hidden sm:inline-flex items-center gap-1.5 text-white bg-gradient-to-b from-neutral-700 to-neutral-900 text-[10px] font-bold uppercase tracking-wider cursor-pointer"
                title="Reset to defaults"
                aria-label="Reset house rules to defaults"
              >
                <RotateCcw size={13} /> Reset
              </button>
            )}
            <button
              onClick={() => setIsHouseRulesOpen(false)}
              className="chip-arcade w-9 h-9 flex items-center justify-center text-white bg-gradient-to-b from-rose-500 to-red-700 cursor-pointer"
              aria-label="Close house rules"
            >
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Status banner */}
        <div
          className={`px-5 sm:px-6 py-2.5 flex items-center gap-2 text-[11px] font-rounded font-bold uppercase tracking-wider border-b border-white/10 ${
            locked
              ? 'bg-amber-500/10 text-amber-300'
              : isHost
                ? 'bg-lime-500/10 text-lime-300'
                : 'bg-blue-500/10 text-blue-300'
          }`}
        >
          {locked ? (
            <>
              <Lock size={13} /> Rules are locked while the game is in progress
            </>
          ) : isHost ? (
            <>
              <ScrollText size={13} /> You are the host — changes sync to everyone instantly
            </>
          ) : (
            <>
              <Eye size={13} /> Only the host can change the rules — view only
            </>
          )}
        </div>

        {/* Body */}
        <div className="p-4 sm:p-6 overflow-y-auto flex-1 custom-scrollbar">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-5">
            {HOUSE_RULE_CATEGORIES.map((cat) => {
              const CatIcon = ((Icons as unknown as Record<string, LucideIcon>)[cat.icon]) ?? Icons.Circle;
              const accent = ACCENT[cat.accent] ?? ACCENT.blue;
              return (
                <div
                  key={cat.id}
                  className="rounded-2xl border border-slate-800 bg-slate-900/40 overflow-hidden"
                >
                  <div className={`flex items-center gap-2 px-4 py-2.5 border-b border-slate-800 ${accent.headerBg}`}>
                    <CatIcon size={14} className={accent.icon} />
                    <h3 className="text-[11px] font-black uppercase tracking-widest text-slate-200">
                      {cat.title}
                    </h3>
                  </div>
                  <div className="p-3 space-y-2">
                    {cat.fields.map((f) => (
                      <RuleRow
                        key={f.key}
                        field={f}
                        rules={rules}
                        disabled={fieldDisabled(f)}
                        onToggle={(v) => setField(f.key, v)}
                        onNumber={(v) => setField(f.key, v)}
                        onSegment={(v) => setField(f.key, v)}
                      />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </motion.div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// A single rule row — renders the control declared by the field's metadata.
// ---------------------------------------------------------------------------
const RuleRow: React.FC<{
  field: RuleFieldDef;
  rules: HouseRules;
  disabled: boolean;
  onToggle: (v: boolean) => void;
  onNumber: (v: number) => void;
  onSegment: (v: string) => void;
}> = ({ field, rules, disabled, onToggle, onNumber, onSegment }) => {
  const value = rules[field.key];

  return (
    <div
      className={`flex items-center justify-between gap-3 rounded-xl px-3 py-2 border transition-opacity ${
        field.indent ? 'ml-3 border-slate-800/70 bg-slate-950/40' : 'border-slate-800 bg-slate-900/40'
      } ${disabled ? 'opacity-40' : ''}`}
    >
      <div className="min-w-0">
        <div className="text-[11px] font-bold uppercase tracking-wider text-slate-200 truncate">
          {field.label}
        </div>
        <div className="text-[10px] font-rounded text-slate-500 leading-tight mt-0.5">
          {field.description}
        </div>
      </div>

      <div className="shrink-0">
        {field.control.type === 'toggle' && (
          <Toggle checked={!!value} disabled={disabled} onChange={onToggle} label={field.label} />
        )}
        {field.control.type === 'segment' && (
          <Segment
            options={field.control.options}
            value={String(value)}
            disabled={disabled}
            onChange={onSegment}
            label={field.label}
          />
        )}
        {field.control.type === 'stepper' && (
          <Stepper
            value={Number(value)}
            min={field.control.min}
            max={field.control.max}
            step={field.control.step}
            unit={field.control.unit}
            disabled={disabled}
            onChange={onNumber}
            label={field.label}
          />
        )}
      </div>
    </div>
  );
};

const Toggle: React.FC<{ checked: boolean; disabled: boolean; onChange: (v: boolean) => void; label: string }> = ({
  checked,
  disabled,
  onChange,
  label,
}) => (
  <button
    onClick={() => !disabled && onChange(!checked)}
    disabled={disabled}
    role="switch"
    aria-checked={checked}
    aria-label={label}
    className={`w-11 h-6 rounded-full relative transition-colors ${disabled ? 'cursor-not-allowed' : 'cursor-pointer'} ${
      checked ? 'bg-lime-600' : 'bg-slate-700'
    }`}
  >
    <motion.div
      layout
      className="w-[18px] h-[18px] bg-white rounded-full absolute top-[3px] shadow-sm"
      animate={{ left: checked ? 'calc(100% - 21px)' : '3px' }}
      transition={{ type: 'spring', stiffness: 500, damping: 30 }}
    />
  </button>
);

const Segment: React.FC<{
  options: { value: string; label: string }[];
  value: string;
  disabled: boolean;
  onChange: (v: string) => void;
  label: string;
}> = ({ options, value, disabled, onChange, label }) => (
  <div className="flex gap-1 bg-slate-950/60 rounded-lg p-0.5 border border-slate-800" role="radiogroup" aria-label={label}>
    {options.map((o) => (
      <button
        key={o.value}
        onClick={() => !disabled && onChange(o.value)}
        disabled={disabled}
        role="radio"
        aria-checked={value === o.value}
        aria-label={`${label}: ${o.label}`}
        className={`px-2.5 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider transition-colors ${
          value === o.value ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-slate-200'
        } ${disabled ? 'cursor-not-allowed' : 'cursor-pointer'}`}
      >
        {o.label}
      </button>
    ))}
  </div>
);

const Stepper: React.FC<{
  value: number;
  min: number;
  max: number;
  step: number;
  unit?: string;
  disabled: boolean;
  onChange: (v: number) => void;
  label: string;
}> = ({ value, min, max, step, unit, disabled, onChange, label }) => {
  const clamp = (v: number) => Math.min(max, Math.max(min, v));
  return (
    <div className="flex items-center gap-1.5" role="group" aria-label={label}>
      <button
        onClick={() => !disabled && onChange(clamp(value - step))}
        disabled={disabled || value <= min}
        aria-label={`Decrease ${label}`}
        className="chip-arcade w-7 h-7 flex items-center justify-center text-white bg-gradient-to-b from-neutral-700 to-neutral-900 disabled:opacity-40 disabled:cursor-not-allowed"
      >
        <Minus size={12} />
      </button>
      <span
        className="min-w-[52px] text-center text-[11px] font-arcade text-yellow-300 tabular-nums"
        aria-live="polite"
        aria-label={`${label}: ${value}${unit ? ' ' + unit : ''}`}
      >
        {value}
        {unit ? <span className="text-[8px] text-slate-400 ml-0.5">{unit}</span> : null}
      </span>
      <button
        onClick={() => !disabled && onChange(clamp(value + step))}
        disabled={disabled || value >= max}
        aria-label={`Increase ${label}`}
        className="chip-arcade w-7 h-7 flex items-center justify-center text-white bg-gradient-to-b from-neutral-700 to-neutral-900 disabled:opacity-40 disabled:cursor-not-allowed"
      >
        <Plus size={12} />
      </button>
    </div>
  );
};
