import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const frontend = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// Run the real TypeScript modules using the already installed compiler, without
// adding a test framework or writing build output into the source tree.
function moduleLoader() {
  const modules = new Map();
  function load(filename) {
    filename = path.resolve(filename);
    if (modules.has(filename)) return modules.get(filename).exports;
    const loadedModule = { exports: {} };
    modules.set(filename, loadedModule);
    const nativeRequire = createRequire(filename);
    const require = (specifier) => {
      if (specifier.startsWith('.')) {
        const resolved = path.resolve(path.dirname(filename), specifier);
        const source = [resolved, `${resolved}.ts`, `${resolved}.tsx`, path.join(resolved, 'index.ts')]
          .find((candidate) => fs.existsSync(candidate) && fs.statSync(candidate).isFile());
        if (source && /\.tsx?$/.test(source)) return load(source);
      }
      return nativeRequire(specifier);
    };
    const compiled = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
      compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS, esModuleInterop: true },
      fileName: filename,
    }).outputText;
    vm.compileFunction(compiled, ['require', 'module', 'exports'], { filename })(require, loadedModule, loadedModule.exports);
    return loadedModule.exports;
  }
  return load;
}

const load = moduleLoader();
const cards = load(path.join(frontend, 'src/lib/cards/cardEngine.ts'));
const houseRules = load(path.join(frontend, 'src/lib/houseRules.ts'));
const serverRules = load(path.join(frontend, '../backend/src/game/rules.ts'));
const serverHouseRules = load(path.join(frontend, '../backend/src/game/houseRules.ts'));
const card = (color, value) => ({ id: `${color}-${value}`, color, value });

test('client card legality agrees with server stacking and finishing rules', () => {
  const ruleSets = [
    {}, { stacking: false }, { stackDrawTwoOnWildFour: true },
    { allowWinWithWild: false }, { allowWinWithDrawCard: false },
    { allowWinWithActionCard: false }, { numberCardFinishOnly: true },
    { stackDrawTwoOnWildFour: true, allowWinWithDrawCard: false },
  ];
  const values = ['0', '7', 'skip', 'reverse', 'draw_two', 'wild', 'wild_draw_four'];
  const colors = ['red', 'blue', 'green', 'yellow', 'wild'];
  for (const overrides of ruleSets) {
    const rules = houseRules.normalizeHouseRules(overrides);
    const authoritative = serverHouseRules.normalizeHouseRules(overrides);
    for (const pending of [null, 'draw_two', 'wild_draw_four']) {
      for (const top of [card('red', '7'), card('wild', 'wild_draw_four')]) {
        for (const color of colors) for (const value of values) for (const handCount of [1, 2]) {
          const candidate = card(color, value);
          const expected = serverRules.isValidMove(candidate, top, 'blue', pending, authoritative) &&
            (handCount > 1 || serverHouseRules.canFinishWithCard(authoritative, color, value));
          assert.equal(cards.canPlayCard(candidate, top, 'blue', pending, rules, handCount), expected,
            JSON.stringify({ overrides, pending, top, candidate, handCount }));
        }
      }
    }
  }
});

test('jump-in respects finishing restrictions and forced-draw phases', () => {
  const top = card('red', 'skip');
  const rules = houseRules.normalizeHouseRules({ jumpIn: true, allowWinWithActionCard: false });
  assert.equal(cards.canJumpInWithCard(top, top, null, rules, 1), false);
  assert.equal(cards.canJumpInWithCard(top, top, null, rules, 2), true);
  assert.equal(cards.canJumpInWithCard(top, top, 'draw_two', rules, 2), false);
  assert.equal(cards.canJumpInWithCard(card('wild', 'wild'), card('wild', 'wild'), null, rules, 2), false);
});

test('draw-stack prompts describe the active stacking matrix and actual penalty', () => {
  assert.equal(cards.drawStackPrompt('wild_draw_four', 12, houseRules.normalizeHouseRules({})), 'Stack a +4 or draw 12!');
  assert.equal(cards.drawStackPrompt('wild_draw_four', 12, houseRules.normalizeHouseRules({ stackDrawTwoOnWildFour: true })), 'Stack a +2 / +4 or draw 12!');
  assert.equal(cards.drawStackPrompt('wild_draw_four', 12, houseRules.normalizeHouseRules({ stackToEat: false })), 'Stack a +4 or draw 4!');
  assert.equal(cards.drawStackPrompt('draw_two', 6, houseRules.normalizeHouseRules({ stacking: false })), 'Draw 6 cards!');
});

function browserStorage(initial = {}) {
  const data = new Map(Object.entries(initial));
  return { data, getItem: (name) => data.get(name) ?? null, setItem: (name, value) => data.set(name, value), removeItem: (name) => data.delete(name) };
}

function withBrowser(storage, run) {
  const previous = globalThis.window;
  globalThis.window = { localStorage: storage, matchMedia: () => ({ matches: false }) };
  try { run(moduleLoader()); }
  finally {
    if (previous === undefined) delete globalThis.window;
    else globalThis.window = previous;
  }
}

test('blocked browser storage settles profile hydration and permits settings changes', () => {
  const blocked = { getItem() { throw new Error('storage blocked'); }, setItem() { throw new Error('storage blocked'); }, removeItem() { throw new Error('storage blocked'); } };
  withBrowser(blocked, (read) => {
    const { useProfileStore } = read(path.join(frontend, 'src/store/useProfileStore.ts'));
    const { useSettingsStore } = read(path.join(frontend, 'src/store/useSettingsStore.ts'));
    assert.equal(useProfileStore.getState().hydrated, true);
    assert.doesNotThrow(() => useProfileStore.setState({ profileId: '123', profileSecret: 'private' }));
    assert.equal(useProfileStore.getState().profileId, '123');
    assert.doesNotThrow(() => useSettingsStore.getState().setMasterVolume(25));
    assert.equal(useSettingsStore.getState().masterVolume, 25);
  });
});

test('corrupt profile/settings saves are discarded without removing unrelated storage', () => {
  const storage = browserStorage({ 'unoverse:profile': '{broken', 'uno-real-settings': JSON.stringify({ state: [] }), unrelated: 'keep' });
  withBrowser(storage, (read) => {
    const { useProfileStore } = read(path.join(frontend, 'src/store/useProfileStore.ts'));
    const { useSettingsStore } = read(path.join(frontend, 'src/store/useSettingsStore.ts'));
    assert.equal(useProfileStore.getState().hydrated, true);
    assert.equal(useProfileStore.getState().profileId, null);
    assert.equal(useSettingsStore.getState().masterVolume, 100);
    assert.equal(storage.getItem('unrelated'), 'keep');
  });
});

test('valid saved profile credentials and settings still hydrate synchronously', () => {
  const storage = browserStorage({
    'unoverse:profile': JSON.stringify({ state: { profileId: '123', profileSecret: 'private', displayName: 'Player' }, version: 0 }),
    'uno-real-settings': JSON.stringify({ state: { masterVolume: 35 }, version: 0 }),
  });
  withBrowser(storage, (read) => {
    const { useProfileStore } = read(path.join(frontend, 'src/store/useProfileStore.ts'));
    const { useSettingsStore } = read(path.join(frontend, 'src/store/useSettingsStore.ts'));
    assert.equal(useProfileStore.getState().hydrated, true);
    assert.equal(useProfileStore.getState().profileSecret, 'private');
    assert.equal(useSettingsStore.getState().masterVolume, 35);
  });
});

test('storage falling back after a quota error preserves the latest session save', () => {
  const { createSafeLocalStorage } = load(path.join(frontend, 'src/lib/safeStorage.ts'));
  const underlying = browserStorage({ save: 'old' });
  underlying.setItem = () => { throw new Error('quota'); };
  const storage = createSafeLocalStorage(() => underlying);
  assert.equal(storage.getItem('save'), 'old');
  storage.setItem('save', 'new');
  assert.equal(storage.getItem('save'), 'new');
  storage.removeItem('save');
  assert.equal(storage.getItem('save'), null);
});

test('gameplay shortcuts yield to visible dialogs, focused controls and handled events', () => {
  const previous = globalThis.Element;
  class ElementFixture {
    constructor(interactive) { this.interactive = interactive; }
    closest() { return this.interactive ? this : null; }
  }
  globalThis.Element = ElementFixture;
  try {
    const { shouldIgnoreGameplayKey } = load(path.join(frontend, 'src/lib/keyboardGuards.ts'));
    const noDialogs = { querySelectorAll: () => [] };
    const event = { defaultPrevented: false, ctrlKey: false, altKey: false, metaKey: false, target: new ElementFixture(false) };
    assert.equal(shouldIgnoreGameplayKey(event, noDialogs), false);
    assert.equal(shouldIgnoreGameplayKey({ ...event, target: new ElementFixture(true) }, noDialogs), true);
    assert.equal(shouldIgnoreGameplayKey({ ...event, defaultPrevented: true }, noDialogs), true);
    assert.equal(shouldIgnoreGameplayKey(event, { querySelectorAll: () => [{ getClientRects: () => [{}] }] }), true);
    assert.equal(shouldIgnoreGameplayKey(event, { querySelectorAll: () => [{ getClientRects: () => [] }] }), false);
  } finally {
    if (previous === undefined) delete globalThis.Element;
    else globalThis.Element = previous;
  }
});
