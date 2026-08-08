/**
 * Shared UI kit — the one design system behind the scoreboard, friends panel,
 * settings, profile and results screen.
 *
 * Structure and materials live in globals.css (`.ui-*` classes); these are the
 * thin React wrappers over them. Import from here, not from the files directly,
 * so the surface stays swappable.
 */

export { Modal, ModalHeader, ModalBody, ModalFooter } from './Modal';
export type { ModalProps, ModalHeaderProps, ModalSize, ModalVariant } from './Modal';

export { Button, IconButton } from './Button';
export type { ButtonProps, ButtonTone, ButtonSize } from './Button';

export { Field, Toggle, Slider, SegmentedControl } from './controls';
export type { SegmentOption } from './controls';

export {
  TabBar,
  StatTile,
  SectionLabel,
  Badge,
  Notice,
  EmptyState,
  Skeleton,
  SkeletonList,
} from './display';
export type { TabItem, StatTone, BadgeTone, NoticeTone } from './display';
