'use client';

import { useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useSocket } from './useSocket';

/**
 * Leaving the table is a two-step action (tell the server, then navigate home)
 * and it is offered from more than one surface — the HUD exit button and the
 * end-of-round dialog. Sharing it here keeps those in lockstep: if the server
 * ever needs a different farewell, there is one place to change.
 */
export const useExitTable = (): (() => void) => {
  const router = useRouter();
  const { leaveRoom } = useSocket();

  return useCallback(() => {
    leaveRoom();
    router.push('/');
    // `leaveRoom` is recreated on every render of the socket hook but always
    // reads the live socket from the store, so it is safe to leave out.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router]);
};

export default useExitTable;
