import { flyCardGhost } from './fly-card';

describe('flyCardGhost', () => {
  const to = new DOMRect(500, 50, 100, 30);

  function ghostEl(): HTMLElement | null {
    return document.querySelector('body > div[style*="fixed"][style*="background-image"]');
  }

  afterEach(() => {
    ghostEl()?.remove();
  });

  it('resolves false without creating a ghost when inputs are missing', async () => {
    await expectAsync(flyCardGhost({ from: null, to, imageUrl: 'x.jpg' })).toBeResolvedTo(false);
    await expectAsync(
      flyCardGhost({ from: new DOMRect(0, 0, 40, 40), to: null, imageUrl: 'x.jpg' }),
    ).toBeResolvedTo(false);
    await expectAsync(
      flyCardGhost({ from: new DOMRect(0, 0, 40, 40), to, imageUrl: null }),
    ).toBeResolvedTo(false);
    expect(ghostEl()).toBeNull();
  });

  it('resolves false for a zero-width source rect', async () => {
    await expectAsync(
      flyCardGhost({ from: new DOMRect(10, 10, 0, 60), to, imageUrl: 'x.jpg' }),
    ).toBeResolvedTo(false);
  });

  it('creates a landscape ghost as-is from a landscape (art) source rect', async () => {
    const from = new DOMRect(10, 20, 64, 48);
    const pending = flyCardGhost({ from, to, imageUrl: 'art.jpg' });

    const ghost = ghostEl()!;
    expect(ghost).not.toBeNull();
    expect(ghost.style.width).toBe('64px');
    expect(ghost.style.height).toBe('48px');
    expect(ghost.style.left).toBe('10px');

    ghost.getAnimations().forEach((a) => a.cancel());
    await expectAsync(pending).toBeResolvedTo(false);
    expect(ghostEl()).toBeNull();
  });

  it('shrinks a portrait (whole-card) source rect to its art window', async () => {
    // A 100×140 card-shaped rect: the ghost must carry only the frame's art box.
    const from = new DOMRect(0, 0, 100, 140);
    const pending = flyCardGhost({ from, to, imageUrl: 'art.jpg' });

    const ghost = ghostEl()!;
    expect(ghost).not.toBeNull();
    expect(parseFloat(ghost.style.width)).toBeCloseTo(100 * 0.89, 1);
    expect(parseFloat(ghost.style.height)).toBeCloseTo(140 * 0.43, 1);
    // Landscape result: wider than tall, never the full frame.
    expect(parseFloat(ghost.style.width)).toBeGreaterThan(parseFloat(ghost.style.height));

    ghost.getAnimations().forEach((a) => a.cancel());
    await pending;
  });

  it('resolves true and removes the ghost when the flight finishes', async () => {
    const from = new DOMRect(10, 20, 64, 48);
    const pending = flyCardGhost({ from, to, imageUrl: 'art.jpg' });

    const ghost = ghostEl()!;
    const anim = ghost.getAnimations()[0];
    expect(anim).toBeDefined();
    anim.finish();

    await expectAsync(pending).toBeResolvedTo(true);
    expect(ghostEl()).toBeNull();
  });
});
