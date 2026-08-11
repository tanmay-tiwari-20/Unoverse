/**
 * ============================================================================
 *  Document-level platform tags — WEB. There are none.
 * ============================================================================
 *
 * The web arm of the `@platform-head` alias: a component that renders nothing,
 * so the self-hosted document is byte-for-byte what it was before the CrazyGames
 * target existed — no platform script tag, and no platform SDK URL anywhere in
 * the output.
 *
 * This file being the one the web build resolves is the whole mechanism. See
 * `platformHead.crazygames.tsx` for the other side, and `next.config.ts` for
 * where the choice is made.
 */

import React from 'react';

export const PlatformHead: React.FC = () => null;

export default PlatformHead;
