'use client';

import { useGameStore } from '../store/useGameStore';

/**
 * Table Chat is a host-configurable house rule. When it is off we hide the chat
 * button and never mount the panel (the server also rejects chat messages);
 * reactions and voice stay available.
 *
 * The authoritative room copy of the rules wins, with the standalone
 * `houseRules` slice as the fallback for the brief window before the first room
 * snapshot lands. Shared so the toggle button and the panel can never disagree.
 */
export const useChatEnabled = (): boolean => {
  const roomHouseRules = useGameStore((s) => s.room?.houseRules);
  const houseRules = useGameStore((s) => s.houseRules);
  return (roomHouseRules ?? houseRules)?.enableChat !== false;
};

export default useChatEnabled;
