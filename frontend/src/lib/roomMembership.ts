type Lease = { key: string; leave: () => void };

/**
 * The route owns the seat. A one-task delay lets React replay effects in Strict
 * Mode without deleting the room, while a real navigation releases it.
 */
export function createRoomMembershipLifecycle(
  schedule: (callback: () => void) => ReturnType<typeof setTimeout> = (callback) => setTimeout(callback, 0),
  cancel: (timer: ReturnType<typeof setTimeout>) => void = clearTimeout,
) {
  let current: Lease | null = null;
  let pendingLeave: ReturnType<typeof setTimeout> | null = null;

  return {
    reset(): void {
      if (pendingLeave !== null) cancel(pendingLeave);
      pendingLeave = null;
      current = null;
    },
    acquire(key: string, join: () => void, leave: () => void): () => void {
      if (pendingLeave !== null) {
        cancel(pendingLeave);
        pendingLeave = null;
      }
      if (current && current.key !== key) current.leave();
      const lease = { key, leave };
      current = lease;
      join();

      return () => {
        if (current !== lease) return;
        if (pendingLeave !== null) cancel(pendingLeave);
        pendingLeave = schedule(() => {
          pendingLeave = null;
          if (current !== lease) return;
          current = null;
          leave();
        });
      };
    },
  };
}

export const roomMembershipLifecycle = createRoomMembershipLifecycle();
