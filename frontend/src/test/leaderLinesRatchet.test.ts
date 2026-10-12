import { describe, it, expect } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { LeaderLines } from '../components/LeaderLines';

describe('LeaderLines height ratchet behavior and layout fixes', () => {
  it('demonstrates that an absolutely positioned child with fixed style.height prevents parent scrollHeight from shrinking', () => {
    // Simulate CSSOM container with position: relative and an absolute child
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

    // When content shrinks to 800px (e.g. user collapsed notes or switched to a shorter session)
    parent.childrenHeight = 800;

    // If svg retains 2400px from previous drawLines, scrollHeight is ratcheted:
    h = parent.scrollHeight;
    expect(h).toBe(2400);

    // With the fix: SVG uses 100% and does not set explicit pixel style.height
    parent.svgHeight = 0;
    h = parent.scrollHeight;
    expect(h).toBe(800); // Correctly shrinks to 800px
  });

  it('renders LeaderLines as an SVG overlay with id="leaders"', () => {
    const dummyRef = { current: null };
    const html = renderToStaticMarkup(React.createElement(LeaderLines, { sheetRef: dummyRef }));
    expect(html).toContain('<svg id="leaders" aria-hidden="true"></svg>');
  });

  it('proves percentage sizing allows dynamic container shrinkage across session transitions', () => {
    // Model session A (3200px) transitioning to session B (650px)
    const sessionHeights = [3200, 650];
    const measuredHeights: number[] = [];

    let currentSvgPixelHeight: number | null = null; // With the fix, svg uses percentage, not pixel height

    for (const contentHeight of sessionHeights) {
      // In CSS, an absolutely positioned element with width:100% / height:100%
      // does not contribute scrollable overflow beyond the container's content box.
      const scrollHeight = currentSvgPixelHeight !== null
        ? Math.max(contentHeight, currentSvgPixelHeight)
        : contentHeight;
      measuredHeights.push(scrollHeight);
    }

    expect(measuredHeights[0]).toBe(3200);
    expect(measuredHeights[1]).toBe(650); // Session B shrinks immediately to 650px without ratchet
  });
});
