'use client';

import React, { useRef, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { X } from 'lucide-react';
import { useDialogA11y } from '../../../hooks/useDialogA11y';
import { useMediaQuery } from '../../../hooks/useMediaQuery';

/**
 * The single modal shell every redesigned surface sits in — friends, settings,
 * profile, results, help. It owns everything that used to be re-implemented (and
 * subtly re-invented) per modal:
 *
 *   • the scrim, at one opacity that still lets the 3D arena read through
 *   • viewport-safe sizing (never taller/wider than the visible viewport, always
 *     inside the notch and home bar) via the `.ui-panel` CSS contract
 *   • focus trap + initial focus + focus restore + Escape, via useDialogA11y
 *   • one open/close motion, spring-based and short
 *   • scroll containment, so dragging inside a list never scrolls the page
 *   • a portal to <body>, so `zIndex` means what it says (see below)
 *
 * Compose it explicitly so an unusual surface (the winner screen) can keep a
 * custom header while still inheriting the shell:
 *
 *   <Modal open={open} onClose={close} size="md" labelledBy="settings-title">
 *     <ModalHeader id="settings-title" title="Settings" icon={<Settings />} onClose={close} />
 *     <ModalBody>…</ModalBody>
 *     <ModalFooter>…</ModalFooter>
 *   </Modal>
 */

/** Client-only check with no `setState` in an effect. The server snapshot is
 *  `false`, so the first (hydrating) render matches the server exactly and only
 *  the pass after hydration mounts the portal. */
const NO_SUBSCRIBE = () => () => {};
const useIsClient = () => useSyncExternalStore(NO_SUBSCRIBE, () => true, () => false);

export type ModalSize = 'sm' | 'md' | 'lg' | 'xl';
/** `center` = classic centred dialog. `drawer` = side panel on wide screens,
 *  bottom sheet on phones (used by the friends panel, which stays open while
 *  the player keeps watching the table). */
export type ModalVariant = 'center' | 'drawer';

export interface ModalProps {
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
  size?: ModalSize;
  variant?: ModalVariant;
  /** id of the element naming this dialog (usually the ModalHeader's title). */
  labelledBy?: string;
  describedBy?: string;
  closeOnBackdrop?: boolean;
  closeOnEscape?: boolean;
  /** Focus this on open instead of the first focusable child. */
  initialFocusRef?: React.RefObject<HTMLElement | null>;
  /** Stacking order — the app's layers are already numbered, so callers pass
   *  their own rather than the kit inventing a competing scale. */
  zIndex?: number;
  /** Extra classes on the panel (e.g. a taller cap for one surface). */
  className?: string;
  /** Rendered inside the panel, above everything — confetti, glow, sheen. */
  overlay?: React.ReactNode;
  /**
   * Rendered between the scrim and the panel, full-screen. For effects that
   * belong to the whole viewport rather than the panel — the winner screen's
   * confetti, which should fall past the edges of the card but never over its
   * text.
   */
  underlay?: React.ReactNode;
}

const SIZE_CLASS: Record<ModalSize, string> = {
  sm: 'ui-panel-sm',
  md: 'ui-panel-md',
  lg: 'ui-panel-lg',
  xl: 'ui-panel-xl',
};

export const Modal: React.FC<ModalProps> = ({
  open,
  onClose,
  children,
  size = 'md',
  variant = 'center',
  labelledBy,
  describedBy,
  closeOnBackdrop = true,
  closeOnEscape = true,
  initialFocusRef,
  zIndex = 2000,
  className = '',
  overlay,
  underlay,
}) => {
  const panelRef = useRef<HTMLDivElement>(null);
  useDialogA11y(panelRef, open, onClose, { closeOnEscape, initialFocusRef });
  const isClient = useIsClient();

  // A drawer docks right on anything wider than a phone and rises from the
  // bottom on a phone — two different gestures, not one layout rotated.
  const isWide = useMediaQuery('(min-width: 640px)');
  const dock = variant === 'drawer' && isWide;
  const sheet = variant === 'drawer' && !isWide;

  const enter =
    dock ? { opacity: 0, x: 28 } : sheet ? { opacity: 0, y: 32 } : { opacity: 0, scale: 0.94, y: 12 };
  const rest = dock ? { opacity: 1, x: 0 } : sheet ? { opacity: 1, y: 0 } : { opacity: 1, scale: 1, y: 0 };

  const tree = (
    <AnimatePresence>
      {open && (
        <motion.div
          className={`fixed inset-0 flex ${
            dock
              ? 'items-stretch justify-end'
              : sheet
                ? 'items-end justify-center'
                : 'items-center justify-center'
          }`}
          style={{ zIndex }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.16 }}
        >
          {/* Scrim. Its own layer so the panel's own animation never re-blurs
              the backdrop mid-transition (which is what caused the frame drop
              on modal open). */}
          <div
            className="ui-scrim absolute inset-0"
            onClick={closeOnBackdrop ? onClose : undefined}
            aria-hidden="true"
          />

          {/* Full-viewport effect layer, above the scrim and below the panel. */}
          {underlay && (
            <div className="pointer-events-none absolute inset-0 overflow-hidden">{underlay}</div>
          )}

          {/* Padding ring: keeps the panel clear of the notch/home bar and
              guarantees a gap on tiny screens, so `max-width: 100%` on the
              panel can never produce horizontal overflow. */}
          <div
            className={`relative flex min-h-0 w-full ${
              dock
                ? 'h-full justify-end p-0 sm:pl-2'
                : sheet
                  ? 'items-end justify-center px-2 pt-2'
                  : 'items-center justify-center p-2 sm:p-4 short:p-2'
            }`}
            style={{
              paddingTop: dock || sheet ? undefined : 'max(0.5rem, env(safe-area-inset-top))',
              paddingBottom: sheet ? 0 : 'max(0.5rem, env(safe-area-inset-bottom))',
              paddingLeft: 'max(0.5rem, env(safe-area-inset-left))',
              paddingRight: 'max(0.5rem, env(safe-area-inset-right))',
            }}
          >
            <motion.div
              ref={panelRef}
              role="dialog"
              aria-modal="true"
              aria-labelledby={labelledBy}
              aria-describedby={describedBy}
              tabIndex={-1}
              onClick={(e) => e.stopPropagation()}
              initial={enter}
              animate={rest}
              exit={enter}
              transition={{ type: 'spring', stiffness: 420, damping: 34, mass: 0.7 }}
              className={`ui-panel ${SIZE_CLASS[size]} ${dock ? 'ui-panel-dock' : ''} ${
                sheet ? 'ui-panel-sheet' : ''
              } outline-none ${className}`}
            >
              {children}
              {overlay}
            </motion.div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );

  /**
   * Rendered into <body>, not in place.
   *
   * `position: fixed` and `z-index` are both resolved inside the nearest
   * ancestor stacking context, and this app has several — GameHUD is `z-20`,
   * LobbyHeader is `z-40`. A modal mounted inside GameHUD (the arena picker,
   * house rules) therefore painted UNDER the header's mic/chat/settings cluster
   * no matter how large its own `zIndex` was, which on a small screen put those
   * buttons directly over the modal's close button. Escaping to <body> makes
   * `zIndex` mean what every caller already assumed it meant.
   */
  return isClient ? createPortal(tree, document.body) : tree;
};

export interface ModalHeaderProps {
  id?: string;
  title: React.ReactNode;
  /** Small line under the title — counts, room code, presence. */
  subtitle?: React.ReactNode;
  icon?: React.ReactNode;
  /** Controls between the title and the close button (e.g. a search toggle). */
  actions?: React.ReactNode;
  onClose?: () => void;
  closeLabel?: string;
  className?: string;
}

/** Header bar: icon + title (+ subtitle) + optional actions + close. */
export const ModalHeader: React.FC<ModalHeaderProps> = ({
  id,
  title,
  subtitle,
  icon,
  actions,
  onClose,
  closeLabel = 'Close',
  className = '',
}) => (
  <div className={`ui-bar ui-bar-top ${className}`}>
    {icon && <span className="shrink-0 text-yellow-300 flex items-center">{icon}</span>}
    <div className="min-w-0 flex-1">
      <h2
        id={id}
        className="font-arcade arcade-stroke-sm text-[clamp(0.85rem,0.7rem+0.7vw,1.15rem)] leading-tight tracking-wide text-white truncate"
      >
        {title}
      </h2>
      {subtitle && (
        <p className="font-rounded text-[10px] sm:text-[11px] font-bold text-white/55 truncate leading-tight mt-0.5">
          {subtitle}
        </p>
      )}
    </div>
    {actions}
    {onClose && (
      <button
        onClick={onClose}
        aria-label={closeLabel}
        title={closeLabel}
        className="shrink-0 grid place-items-center rounded-xl border-2 border-white/15 bg-white/5 text-white/70 transition-colors hover:border-white/30 hover:bg-white/10 hover:text-white cursor-pointer"
        style={{ width: 'var(--ui-tap)', height: 'var(--ui-tap)' }}
      >
        <X size={16} strokeWidth={3} aria-hidden="true" />
      </button>
    )}
  </div>
);

/** Scrolling content region. `padded={false}` for full-bleed content. */
export const ModalBody: React.FC<{
  children: React.ReactNode;
  className?: string;
  padded?: boolean;
  id?: string;
}> = ({ children, className = '', padded = true, id }) => (
  <div
    id={id}
    className={`ui-body custom-scrollbar ${padded ? '' : 'ui-body-flush'} ${className}`}
  >
    {children}
  </div>
);

/** Pinned action bar. Never scrolls, always inside the home-bar inset. */
export const ModalFooter: React.FC<{ children: React.ReactNode; className?: string }> = ({
  children,
  className = '',
}) => <div className={`ui-bar ui-bar-bottom ${className}`}>{children}</div>;

export default Modal;
