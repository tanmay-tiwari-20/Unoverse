'use client';

import { useGameStore } from '../store/useGameStore';
import { usePlatformDisablesChat } from '../lib/platform/usePlatformSettings';

/**
 * Table Chat is a host-configurable house rule. When it is off we hide the chat
 * button and never mount the panel (the server also rejects chat messages);
 * reactions and voice stay available.
 *
 * The authoritative room copy of the rules wins, with the standalone
 * `houseRules` slice as the fallback for the brief window before the first room
 * snapshot lands. Shared so the toggle button and the panel can never disagree.
 *
 * A platform may also forbid chat outright — a player-level preference set in
 * the portal, independent of the table. It is ANDed in here rather than checked
 * at each call site for the same reason the house rule is: this hook is the one
 * chokepoint, feeding both the toggle button and the panel mount, so the two can
 * never disagree about whether chat exists. Always `false` on web.
 */
export const useChatEnabled = (): boolean => {
  const roomHouseRules = useGameStore((s) => s.room?.houseRules);
  const houseRules = useGameStore((s) => s.houseRules);
  const platformDisablesChat = usePlatformDisablesChat();
  if (platformDisablesChat) return false;
  return (roomHouseRules ?? houseRules)?.enableChat !== false;
};

export default useChatEnabled;
