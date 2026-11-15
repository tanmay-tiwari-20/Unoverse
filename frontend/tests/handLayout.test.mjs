import assert from 'node:assert/strict';
import fs from 'node:fs';
import { test } from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

const source = fs.readFileSync(new URL('../src/lib/cards/handLayout.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS },
}).outputText;
const exports = {};
vm.compileFunction(compiled, ['exports'])(exports);
const { getHandLayout, getCardRevealScroll, createHandGestureGuard } = exports;

const phone = { viewportWidth: 360, isMobile: true, isTablet: false, isTouch: true };

test('a normal phone hand keeps its fan while 40 and 50 cards retain full touch targets', () => {
  const normal = getHandLayout({ ...phone, cardCount: 7 });
  assert.equal(normal.scrollable, false);
  assert.ok(normal.handWidth <= normal.availableWidth);
  for (const cardCount of [40, 50]) {
    for (const viewportWidth of [360, 780]) {
      const layout = getHandLayout({ ...phone, viewportWidth, cardCount });
      assert.equal(layout.scrollable, true);
      assert.ok(layout.availableWidth <= viewportWidth - 32, 'keep the strip inside phone gutters');
      assert.ok(layout.cardWidth >= 44 && layout.cardHeight >= 44, 'retain comfortable touch targets');
      assert.ok(layout.step >= layout.cardWidth, 'every face must be visible without overlap');
      assert.ok(layout.edgePadding >= 8, 'keep the first and last card away from clipped edges');
      assert.equal(layout.cardWidth, normal.cardWidth, 'a penalty must not shrink card text');
    }
  }
});

test('every selected or focused card can be fully revealed in portrait and landscape', () => {
  for (const cardCount of [40, 50]) {
    for (const viewportWidth of [360, 780]) {
      const layout = getHandLayout({ ...phone, viewportWidth, cardCount });
      const scrollWidth = layout.handWidth + layout.edgePadding * 2;
      let scrollLeft = 0;
      // Keyboard arrows, End/Home, and a reverse walk must all expose the face.
      const indices = [cardCount - 1, 0, ...Array.from({ length: cardCount }, (_, i) => i), ...Array.from({ length: cardCount }, (_, i) => cardCount - i - 1)];
      for (const index of indices) {
        const cardLeft = layout.edgePadding + index * layout.step;
        scrollLeft = getCardRevealScroll({
          scrollLeft, scrollWidth, viewportWidth: layout.availableWidth,
          cardLeft, cardWidth: layout.cardWidth, padding: layout.edgePadding,
        });
        assert.ok(scrollLeft >= 0 && scrollLeft <= scrollWidth - layout.availableWidth);
        assert.ok(cardLeft >= scrollLeft + layout.edgePadding, `card ${index} left edge is visible`);
        assert.ok(cardLeft + layout.cardWidth <= scrollLeft + layout.availableWidth - layout.edgePadding, `card ${index} right edge is visible`);
      }
    }
  }
});

test('selection leaves an already visible card in place and clamps after the hand shrinks', () => {
  assert.equal(getCardRevealScroll({ scrollLeft: 200, viewportWidth: 328, scrollWidth: 1000, cardLeft: 250, cardWidth: 68 }), 200);
  assert.equal(getCardRevealScroll({ scrollLeft: 800, viewportWidth: 328, scrollWidth: 180, cardLeft: 12, cardWidth: 68 }), 0);
});

test('swiping, native scroll and pointer cancellation cannot turn into a card play', () => {
  const at = (clientX, clientY = 100) => ({ pointerId: 1, clientX, clientY });
  const guard = createHandGestureGuard();
  guard.start(at(200));
  guard.move(at(140));
  guard.end(at(140));
  assert.equal(guard.suppressClick(1), true, 'a swipe followed by a compatibility click is blocked');
  assert.equal(guard.suppressClick(0), false, 'keyboard activation still works after swiping');

  guard.start(at(100));
  guard.cancel();
  assert.equal(guard.suppressClick(1), true, 'browser takeover of a pan blocks its click');

  guard.start(at(100));
  guard.scroll();
  guard.end(at(100));
  assert.equal(guard.suppressClick(1), true, 'native scrolling without a pointer move is also a drag');

  guard.start(at(100));
  guard.move(at(103, 102));
  guard.end(at(103, 102));
  assert.equal(guard.suppressClick(1), false, 'a fresh tap with slight finger movement can play');
});
