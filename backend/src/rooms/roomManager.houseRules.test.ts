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
});
