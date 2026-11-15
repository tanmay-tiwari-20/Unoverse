export interface HandLayoutOptions {
  cardCount: number;
  viewportWidth: number;
  isMobile: boolean;
  isTablet: boolean;
  isTouch: boolean;
}

/** Keep a small hand fanned; browse a large hand without shrinking its cards. */
export function getHandLayout({ cardCount, viewportWidth, isMobile, isTablet, isTouch }: HandLayoutOptions) {
  const cardWidth = isMobile ? 68 : isTablet ? 78 : 84;
  const availableWidth = Math.max(1, (viewportWidth || 360) - (isMobile ? 32 : 64));
  const idealStep = cardWidth * (isTouch ? 0.72 : 0.66);
  const fittedStep = cardCount > 1
    ? Math.min(idealStep, (availableWidth - cardWidth) / (cardCount - 1))
    : idealStep;
  // The usual seven-card fan still fits a phone. Beyond this overlap limit,
  // every card gets its entire face and hit area in the scrollable strip.
  const scrollable = cardCount > 1 && fittedStep < (isTouch ? 36 : 28);
  const step = scrollable ? cardWidth + 10 : fittedStep;
  return {
    cardWidth,
    cardHeight: cardWidth * 1.5,
    availableWidth,
    step,
    scrollable,
    handWidth: cardCount ? cardWidth + (cardCount - 1) * step : 0,
    edgePadding: scrollable ? 12 : 0,
  };
}

/** Reveal just enough of the strip to show the entire focused/selected card. */
export function getCardRevealScroll({
  scrollLeft, viewportWidth, scrollWidth, cardLeft, cardWidth, padding = 12,
}: {
  scrollLeft: number;
  viewportWidth: number;
  scrollWidth: number;
  cardLeft: number;
  cardWidth: number;
  padding?: number;
}): number {
  let next = scrollLeft;
  if (cardLeft - padding < scrollLeft) next = cardLeft - padding;
  else if (cardLeft + cardWidth + padding > scrollLeft + viewportWidth) {
    next = cardLeft + cardWidth + padding - viewportWidth;
  }
  return Math.max(0, Math.min(Math.max(0, scrollWidth - viewportWidth), next));
}

type PointerPosition = { pointerId: number; clientX: number; clientY: number };

/** A swipe must never become a play when a browser also dispatches a click. */
export function createHandGestureGuard() {
  let start: PointerPosition | null = null;
  let dragged = false;
  const move = (event: PointerPosition) => {
    if (start?.pointerId === event.pointerId &&
      Math.hypot(event.clientX - start.clientX, event.clientY - start.clientY) > 8) {
      dragged = true;
    }
  };
  return {
    start(event: PointerPosition) {
      start = { pointerId: event.pointerId, clientX: event.clientX, clientY: event.clientY };
      dragged = false;
    },
    move,
    end(event: PointerPosition) { move(event); start = null; },
    cancel() { dragged = true; start = null; },
    scroll() { if (start) dragged = true; },
    suppressClick(detail: number) { return detail !== 0 && dragged; },
  };
}
