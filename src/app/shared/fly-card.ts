/**
 * Where an add-to-deck flight starts: captured by the component that owns the clicked
 * button (a search row, a suggestion row, the card modal) and carried on the add event,
 * so the component that owns the destination can run the flight.
 */
export interface FlightSource {
  from: DOMRect;
  imageUrl: string | null;
}

/**
 * The art window inside a standard card frame, as a sub-rect of the frame. One source
 * of truth for the ghost normalization below and CardModalComponent.artRect().
 */
export function cardArtWindow(frame: DOMRect): DOMRect {
  return new DOMRect(
    frame.left + frame.width * 0.055,
    frame.top + frame.height * 0.11,
    frame.width * 0.89,
    frame.height * 0.43,
  );
}

/**
 * Flies a small ghost of a card image from one on-screen rect to another, then removes it.
 *
 * Used when a card is added to the deck from somewhere about to disappear (the card modal):
 * the ghost carries the card visually into the deck counter, so the add reads as motion
 * toward the deck rather than the modal simply vanishing.
 *
 * Resolves true when the flight ran to completion, false when it was skipped (missing
 * geometry or image, reduced-motion preference) or cancelled — so callers can gate a
 * follow-up flourish, like bumping the counter, on the ghost actually landing.
 */
export function flyCardGhost(opts: {
  from: DOMRect | null;
  to: DOMRect | null;
  imageUrl: string | null;
}): Promise<boolean> {
  let { from } = opts;
  const { to, imageUrl } = opts;
  if (!from || !to || !imageUrl || from.width === 0) return Promise.resolve(false);
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    return Promise.resolve(false);
  }

  // A portrait, card-shaped source (a row's full-card thumbnail) would fly the whole frame.
  // Shrink such rects to the frame's art window so every ghost is the artwork alone.
  if (from.height > from.width) {
    from = cardArtWindow(from);
  }

  const ghost = document.createElement('div');
  ghost.style.cssText = [
    'position: fixed',
    `left: ${from.left}px`,
    `top: ${from.top}px`,
    `width: ${from.width}px`,
    `height: ${from.height}px`,
    `background-image: url("${imageUrl}")`,
    'background-size: cover',
    'background-position: center',
    // A real card's corner radius scales with its width.
    `border-radius: ${from.width * 0.048}px`,
    'box-shadow: 0 12px 40px rgba(0, 0, 0, 0.55)',
    'pointer-events: none',
    // Above the card modal (z-index 301) so the ghost escapes it as it closes.
    'z-index: 320',
  ].join(';');
  document.body.appendChild(ghost);

  const dx = to.left + to.width / 2 - (from.left + from.width / 2);
  const dy = to.top + to.height / 2 - (from.top + from.height / 2);
  const scale = 44 / from.width;

  return new Promise((resolve) => {
    const flight = ghost.animate(
      [
        { transform: 'translate(0, 0) scale(1)', opacity: 1 },
        // Stay near-opaque for most of the flight — an early fade made the ghost easy to miss —
        // and only dissolve on the final approach into the counter.
        {
          transform: `translate(${dx * 0.72}px, ${dy * 0.72}px) scale(${0.28 + scale})`,
          opacity: 0.95,
          offset: 0.72,
        },
        { transform: `translate(${dx}px, ${dy}px) scale(${scale})`, opacity: 0.2 },
      ],
      { duration: 680, easing: 'cubic-bezier(0.22, 1, 0.36, 1)', fill: 'forwards' },
    );
    flight.onfinish = () => {
      ghost.remove();
      resolve(true);
    };
    flight.oncancel = () => {
      ghost.remove();
      resolve(false);
    };
  });
}
