import { describe, it, expect } from 'vitest';

describe('LeaderLines height ratchet behavior', () => {
  it('demonstrates that an absolutely positioned child with fixed style.height prevents parent scrollHeight from shrinking', () => {
    // Simulate container with position: relative
    const parent = {
      childrenHeight: 800,
      svgHeight: 2400,
      get scrollHeight() {
        return Math.max(this.childrenHeight, this.svgHeight);
      },
    };

    // When parent was 2400px tall
    let h = parent.scrollHeight;
    expect(h).toBe(2400);

    // Now content shrinks to 800px (e.g. user collapsed notes or switched to a shorter session)
    parent.childrenHeight = 800;

    // But svg still has 2400px from previous drawLines
    h = parent.scrollHeight;
    // IT CANNOT SHRINK because svgHeight is still 2400!
    expect(h).toBe(2400);

    // If we reset svg height before measuring or measure children directly:
    parent.svgHeight = 0;
    h = parent.scrollHeight;
    expect(h).toBe(800); // Now it correctly shrinks to 800!
  });
});
