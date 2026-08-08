'use client';

import React, { useMemo } from 'react';
import * as Icons from 'lucide-react';
import { Eye, Lock, LucideIcon, Minus, Plus, RotateCcw, ScrollText } from 'lucide-react';
import { useSettingsStore } from '../../store/useSettingsStore';
import { useGameStore } from '../../store/useGameStore';
import { useSocket } from '../../hooks/useSocket';
import {
  Button,
  IconButton,
  Modal,
  ModalBody,
  ModalFooter,
  ModalHeader,
  Notice,
  SegmentedControl,
  Toggle,
} from './kit';
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
  fuchsia: { headerBg: 'bg-fuchsia-500/12', icon: 'text-fuchsia-300' },
  orange: { headerBg: 'bg-orange-500/12', icon: 'text-orange-300' },
  cyan: { headerBg: 'bg-cyan-500/12', icon: 'text-cyan-300' },
  violet: { headerBg: 'bg-violet-500/12', icon: 'text-violet-300' },
  rose: { headerBg: 'bg-rose-500/12', icon: 'text-rose-300' },
  emerald: { headerBg: 'bg-emerald-500/12', icon: 'text-emerald-300' },
  yellow: { headerBg: 'bg-yellow-500/12', icon: 'text-yellow-300' },
  blue: { headerBg: 'bg-blue-500/12', icon: 'text-blue-300' },
};

/**
 * House Rules panel. Renders every rule generically from HOUSE_RULE_CATEGORIES.
 * The host edits; everyone else sees a live, read-only view. Rules lock once the
 * game leaves the lobby. Changes are applied optimistically and pushed to the
 * server, which re-normalizes and broadcasts the authoritative result to all.
 *
 * Layout notes, since this is by far the densest surface in the game:
 *
 *  • Categories are cards; the rules INSIDE them are divider-separated rows, not
 *    more cards. The old version nested a bordered box inside a bordered box
 *    inside a bordered panel, which is what made a screen of eight simple
 *    switches read as clutter.
 *  • A dependent rule is marked with an inset accent rail rather than a margin,
 *    so the relationship survives at a 360px width where a 12px indent doesn't.
 *  • Reset now lives in the footer. It used to be `hidden sm:inline-flex` in the
 *    header, i.e. unreachable on exactly the devices where mis-tapping a rule is
 *    most likely.
 */
export const HouseRulesModal: React.FC = () => {
  const { isHouseRulesOpen, setIsHouseRulesOpen } = useSettingsStore();
  const houseRules = useGameStore((state) => state.houseRules);
  const player = useGameStore((state) => state.player);
  const gameStatus = useGameStore((state) => state.gameStatus);
  const addToast = useGameStore((state) => state.addToast);
  const { updateHouseRules } = useSocket();

  const rules = useMemo(() => normalizeHouseRules(houseRules), [houseRules]);
  const isHost = !!player?.isHost;
  const locked = gameStatus !== 'lobby';
  const canEdit = isHost && !locked;

  const close = () => setIsHouseRulesOpen(false);

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

  return (
    <Modal
      open={isHouseRulesOpen}
      onClose={close}
      size="xl"
      labelledBy="house-rules-title"
      /* Unchanged stacking height: Settings and the help modals still layer
         above this one. */
      zIndex={1100}
    >
      <ModalHeader
        id="house-rules-title"
        title="House Rules"
        subtitle={canEdit ? 'Changes apply to everyone instantly' : 'The live rules for this table'}
        icon={<ScrollText size={18} aria-hidden="true" />}
        onClose={close}
        closeLabel="Close house rules"
      />

      <ModalBody>
        {locked ? (
          <Notice tone="warn" icon={<Lock size={13} aria-hidden="true" />}>
            Rules are locked while the game is in progress.
          </Notice>
        ) : isHost ? (
          <Notice tone="good" icon={<ScrollText size={13} aria-hidden="true" />}>
            You are the host — every change syncs to the table instantly.
          </Notice>
        ) : (
          <Notice tone="info" icon={<Eye size={13} aria-hidden="true" />}>
            Only the host can change the rules. This is a live, view-only list.
          </Notice>
        )}

        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {HOUSE_RULE_CATEGORIES.map((cat) => {
            const CatIcon = (Icons as unknown as Record<string, LucideIcon>)[cat.icon] ?? Icons.Circle;
            const accent = ACCENT[cat.accent] ?? ACCENT.blue;
            return (
              <section key={cat.id} className="ui-card overflow-hidden">
                <h3
                  className={`flex items-center gap-2 border-b-2 border-white/10 px-3 py-2 ${accent.headerBg}`}
                >
                  <CatIcon size={14} className={accent.icon} aria-hidden="true" />
                  <span className="font-arcade text-[10px] uppercase tracking-widest text-white/85">
                    {cat.title}
                  </span>
                </h3>
                <div>
                  {cat.fields.map((f, i) => (
                    <RuleRow
                      key={f.key}
                      field={f}
                      rules={rules}
                      first={i === 0}
                      disabled={fieldDisabled(f)}
                      onToggle={(v) => setField(f.key, v)}
                      onNumber={(v) => setField(f.key, v)}
                      onSegment={(v) => setField(f.key, v)}
                    />
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      </ModalBody>

      <ModalFooter>
        {canEdit && (
          <Button
            tone="neutral"
            onClick={resetDefaults}
            icon={<RotateCcw size={14} aria-hidden="true" />}
            title="Reset to defaults"
          >
            Reset
          </Button>
        )}
        <span className="flex-1" />
        <Button tone="primary" onClick={close}>
          Done
        </Button>
      </ModalFooter>
    </Modal>
  );
};

// ---------------------------------------------------------------------------
// A single rule row — renders the control declared by the field's metadata.
// ---------------------------------------------------------------------------
const RuleRow: React.FC<{
  field: RuleFieldDef;
  rules: HouseRules;
  first: boolean;
  disabled: boolean;
  onToggle: (v: boolean) => void;
  onNumber: (v: number) => void;
  onSegment: (v: string) => void;
}> = ({ field, rules, first, disabled, onToggle, onNumber, onSegment }) => {
  const value = rules[field.key];

  return (
    <div
      className={`flex items-center justify-between gap-3 px-3 py-2 transition-opacity ${
        first ? '' : 'border-t border-white/[0.07]'
      } ${field.indent ? 'bg-black/25' : ''} ${disabled ? 'opacity-40' : ''}`}
    >
      {/* The rail marks "this only matters while its parent is on" without
          spending horizontal space a phone doesn't have. */}
      {field.indent && (
        <span className="-my-2 -ml-3 -mr-1.5 w-[3px] self-stretch bg-white/15" aria-hidden="true" />
      )}

      <div className="min-w-0 flex-1">
        <div className="font-rounded truncate text-[11px] font-bold text-white">{field.label}</div>
        <div className="font-rounded mt-0.5 text-[10px] leading-tight text-white/45">
          {field.description}
        </div>
      </div>

      <div className="shrink-0">
        {field.control.type === 'toggle' && (
          <Toggle checked={!!value} disabled={disabled} onChange={onToggle} label={field.label} />
        )}
        {field.control.type === 'segment' && (
          <SegmentedControl
            className="w-[8.5rem]"
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

/** −/value/+ triple. Sized off `--ui-tap` so it shrinks with everything else on
 *  a landscape phone instead of keeping a hard-coded 28px. */
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
  const box = { width: 'calc(var(--ui-tap) - 12px)', height: 'calc(var(--ui-tap) - 12px)' };
  return (
    <div className="flex items-center gap-1" role="group" aria-label={label}>
      <IconButton
        label={`Decrease ${label}`}
        onClick={() => !disabled && onChange(clamp(value - step))}
        disabled={disabled || value <= min}
        style={box}
      >
        <Minus size={12} />
      </IconButton>
      <span
        className="font-arcade min-w-[3.25rem] text-center text-[11px] tabular-nums text-yellow-300"
        aria-live="polite"
        aria-label={`${label}: ${value}${unit ? ' ' + unit : ''}`}
      >
        {value}
        {unit ? <span className="ml-0.5 text-[8px] text-white/40">{unit}</span> : null}
      </span>
      <IconButton
        label={`Increase ${label}`}
        onClick={() => !disabled && onChange(clamp(value + step))}
        disabled={disabled || value >= max}
        style={box}
      >
        <Plus size={12} />
      </IconButton>
    </div>
  );
};
