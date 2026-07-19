import { describe, it, expect, beforeEach } from 'vitest';
import { roomManager } from './roomManager';
import { MemoryRoomStore } from './roomStore';
import { DEFAULT_HOUSE_RULES } from '../game/houseRules';

/**
 * House-rules authority + locking + snapshot behavior at the RoomManager layer.
 */
describe('RoomManager — house rules', () => {
  beforeEach(() => {
    roomManager.setStore(new MemoryRoomStore());
  });

  function setup() {
    const room = roomManager.createRoom();
    roomManager.joinRoom(room.code, 'Alice', 'a1'); // host
    roomManager.joinRoom(room.code, 'Bob', 'b1');
    return room.code;
  }

  it('new rooms start with default house rules', () => {
    const room = roomManager.createRoom();
    expect(room.houseRules).toEqual(DEFAULT_HOUSE_RULES);
  });

  it('the host can update rules and they are normalized', () => {
    const code = setup();
    const room = roomManager.updateHouseRules(code, 'a1', { jumpIn: true, stacking: false, stackDrawTwoOnWildFour: true });
    expect(room.houseRules.jumpIn).toBe(true);
    expect(room.houseRules.stacking).toBe(false);
    // dependency enforced: child reset because parent (stacking) is off
    expect(room.houseRules.stackDrawTwoOnWildFour).toBe(DEFAULT_HOUSE_RULES.stackDrawTwoOnWildFour);
  });

  it('non-hosts cannot update rules', () => {
    const code = setup();
    expect(() => roomManager.updateHouseRules(code, 'b1', { jumpIn: true })).toThrow(/only the host/i);
  });

  it('rules are locked once the game starts', () => {
    const code = setup();
    roomManager.startGame(code, 'a1');
    expect(() => roomManager.updateHouseRules(code, 'a1', { jumpIn: true })).toThrow(/locked/i);
  });

  it('merges partial updates onto the existing rules', () => {
    const code = setup();
    roomManager.updateHouseRules(code, 'a1', { jumpIn: true });
    const room = roomManager.updateHouseRules(code, 'a1', { sevenSwap: true });
    expect(room.houseRules.jumpIn).toBe(true); // preserved
    expect(room.houseRules.sevenSwap).toBe(true);
  });

  it('snapshots the rules into the game state on start (and uses targetScore)', () => {
    const code = setup();
    roomManager.updateHouseRules(code, 'a1', { jumpIn: true, targetScore: 300 });
    const room = roomManager.startGame(code, 'a1');
    expect(room.game!.rules.jumpIn).toBe(true);
    expect(room.match!.targetScore).toBe(300);
  });

  describe('spectator limit (maxSpectators)', () => {
    function fullRoom(maxSpectators: number) {
      const room = roomManager.createRoom();
      roomManager.joinRoom(room.code, 'Alice', 'a1'); // host
      roomManager.joinRoom(room.code, 'Bob', 'b1');
      roomManager.updateHouseRules(room.code, 'a1', { maxPlayers: 2, maxSpectators });
      return room.code;
    }

    it('overflow joins spectate until the spectator cap is reached', () => {
      const code = fullRoom(2);
      expect(roomManager.joinRoom(code, 'Spec1', 's1').isSpectator).toBe(true);
      expect(roomManager.joinRoom(code, 'Spec2', 's2').isSpectator).toBe(true);
      expect(() => roomManager.joinRoom(code, 'Spec3', 's3')).toThrow(/completely full/i);
    });

    it('maxSpectators: 0 rejects any spectator', () => {
      const code = fullRoom(0);
      expect(() => roomManager.joinRoom(code, 'Spec1', 's1')).toThrow(/completely full/i);
    });

    it('an existing spectator can still reconnect when slots are full', () => {
      const code = fullRoom(1);
      const { spectator } = roomManager.joinRoom(code, 'Spec1', 's1');
      // Reconnect by name+secret with a new socket id — must not be rejected.
      const rejoined = roomManager.joinRoom(code, 'Spec1', 's1-new', spectator!.secret);
      expect(rejoined.isSpectator).toBe(true);
      expect(rejoined.spectator!.id).toBe('s1-new');
      expect(roomManager.getRoom(code)!.spectators!.length).toBe(1);
    });

    it('a slot freed by a leaving spectator can be re-taken', () => {
      // Unique socket ids: roomManager is a module singleton and leaveRoom scans
      // every room, so ids reused by earlier tests would resolve elsewhere.
      const code = fullRoom(1);
      roomManager.joinRoom(code, 'SpecLeave', 'spec-leave-1');
      roomManager.leaveRoom('spec-leave-1');
      expect(roomManager.joinRoom(code, 'SpecNext', 'spec-leave-2').isSpectator).toBe(true);
    });

    it('maxSpectators is clamped to its bounds and normalized', () => {
      const code = setup();
      const room = roomManager.updateHouseRules(code, 'a1', { maxSpectators: 500 } as any);
      expect(room.houseRules.maxSpectators).toBe(50);
      // Child of spectatorMode: turning spectating off resets the cap to default.
      const room2 = roomManager.updateHouseRules(code, 'a1', { spectatorMode: false, maxSpectators: 5 });
      expect(room2.houseRules.maxSpectators).toBe(DEFAULT_HOUSE_RULES.maxSpectators);
    });
  });
});
