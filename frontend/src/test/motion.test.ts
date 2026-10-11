import { describe, it, expect, beforeEach, vi, afterAll } from 'vitest';
import {
  prefersReducedMotion,
  stampPress,
  bloomEndmark,
  applyStagger,
  settleEntry,
  flip,
  play,
  SPRING_SNAPPY,
  SPRING_GENTLE,
  SPRING_HEAVY,
  EASE_OUT_EXPO,
} from '../lib/motion';

describe('motion system', () => {
  const origWindow = globalThis.window;
  const origDocument = globalThis.document;

  beforeEach(() => {
    vi.restoreAllMocks();

    // Mock minimal DOM for Node environment
    (globalThis as any).window = {
      matchMedia: vi.fn().mockReturnValue({ matches: false }),
    };

    const elementsById = new Map<string, any>();
    (globalThis as any).document = {
      getElementById: vi.fn((id: string) => elementsById.get(id) || null),
      createElement: vi.fn((tag: string) => {
        const classes = new Set<string>();
        const styles = new Map<string, string>();
        return {
          tagName: tag.toUpperCase(),
          classList: {
            add: (c: string) => classes.add(c),
            remove: (c: string) => classes.delete(c),
            contains: (c: string) => classes.has(c),
          },
          style: {
            setProperty: (k: string, v: string) => styles.set(k, v),
            getAttribute: () => Array.from(styles.entries()).map(([k, v]) => `${k}: ${v}`).join('; '),
          },
          getAttribute: (name: string) => {
            if (name === 'style') {
              return Array.from(styles.entries()).map(([k, v]) => `${k}: ${v}`).join('; ');
            }
            return null;
          },
          offsetWidth: 100,
        };
      }),
    };
    (globalThis as any).requestAnimationFrame = (cb: FrameRequestCallback) => setTimeout(cb, 0);
  });

  afterAll(() => {
    globalThis.window = origWindow;
    globalThis.document = origDocument;
  });

  describe('tokens', () => {
    it('exports standard spring and easing definitions', () => {
      expect(SPRING_SNAPPY).toContain('linear(');
      expect(SPRING_GENTLE).toContain('linear(');
      expect(SPRING_HEAVY).toContain('linear(');
      expect(EASE_OUT_EXPO).toBe('cubic-bezier(0.16, 1, 0.3, 1)');
    });
  });

  describe('prefersReducedMotion', () => {
    it('returns false when matchMedia returns false', () => {
      window.matchMedia = vi.fn().mockReturnValue({ matches: false });
      expect(prefersReducedMotion()).toBe(false);
    });

    it('returns true when user requests reduced motion', () => {
      window.matchMedia = vi.fn().mockImplementation((query) => ({
        matches: query === '(prefers-reduced-motion: reduce)',
      }));
      expect(prefersReducedMotion()).toBe(true);
    });
  });

  describe('stampPress', () => {
    it('adds is-stamped class to element and cleans it up', () => {
      vi.useFakeTimers();
      const classes = new Set<string>();
      const btn: any = {
        classList: {
          add: (c: string) => classes.add(c),
          remove: (c: string) => classes.delete(c),
          contains: (c: string) => classes.has(c),
        },
        offsetWidth: 100,
      };

      stampPress(btn);
      expect(btn.classList.contains('is-stamped')).toBe(true);

      vi.advanceTimersByTime(750);
      expect(btn.classList.contains('is-stamped')).toBe(false);
      vi.useRealTimers();
    });
  });

  describe('bloomEndmark', () => {
    it('triggers bloom class on the endmark element', () => {
      const classes = new Set<string>();
      const endmark: any = {
        classList: {
          add: (c: string) => classes.add(c),
          remove: (c: string) => classes.delete(c),
          contains: (c: string) => classes.has(c),
        },
        offsetWidth: 20,
      };
      (document.getElementById as any).mockReturnValue(endmark);

      bloomEndmark();
      expect(endmark.classList.contains('bloom')).toBe(true);
    });

    it('handles gracefully when endmark element is absent', () => {
      (document.getElementById as any).mockReturnValue(null);
      expect(() => bloomEndmark()).not.toThrow();
    });
  });

  describe('applyStagger', () => {
    it('sets --i CSS custom property capped at 5', () => {
      const items: any[] = [];
      for (let i = 0; i < 8; i++) {
        const styles = new Map<string, string>();
        items.push({
          style: {
            setProperty: (k: string, v: string) => styles.set(k, v),
          },
          getProp: (k: string) => styles.get(k),
        });
      }

      const container: any = {
        querySelectorAll: vi.fn().mockReturnValue(items),
      };

      applyStagger(container, '.entry');

      expect(items[0].getProp('--i')).toBe('0');
      expect(items[3].getProp('--i')).toBe('3');
      expect(items[5].getProp('--i')).toBe('5');
      // items beyond 5 should be capped at 5 per spec §5.4
      expect(items[6].getProp('--i')).toBe('5');
      expect(items[7].getProp('--i')).toBe('5');
    });
  });

  describe('settleEntry', () => {
    it('adds is-arrived class on next animation frame', async () => {
      window.matchMedia = vi.fn().mockReturnValue({ matches: false });
      const classes = new Set<string>();
      const entry: any = {
        classList: {
          add: (c: string) => classes.add(c),
          contains: (c: string) => classes.has(c),
        },
      };

      settleEntry(entry);
      await new Promise((resolve) => setTimeout(resolve, 10));
      expect(entry.classList.contains('is-arrived')).toBe(true);
    });

    it('does not add is-arrived when reduced-motion is preferred', async () => {
      window.matchMedia = vi.fn().mockImplementation((query) => ({
        matches: query === '(prefers-reduced-motion: reduce)',
      }));
      const classes = new Set<string>();
      const entry: any = {
        classList: {
          add: (c: string) => classes.add(c),
          contains: (c: string) => classes.has(c),
        },
      };

      settleEntry(entry);
      await new Promise((resolve) => setTimeout(resolve, 10));
      expect(entry.classList.contains('is-arrived')).toBe(false);
    });
  });

  describe('flip', () => {
    it('returns null when reduced motion is preferred', () => {
      window.matchMedia = vi.fn().mockReturnValue({ matches: true });
      const el: any = {};
      const from = { left: 0, top: 0, width: 100, height: 100 } as DOMRect;
      expect(flip(el, from)).toBeNull();
    });

    it('creates animation when animate is available', () => {
      window.matchMedia = vi.fn().mockReturnValue({ matches: false });
      const mockAnimate = vi.fn().mockReturnValue({ id: 'test-anim' });
      const el: any = {
        animate: mockAnimate,
        getBoundingClientRect: vi.fn().mockReturnValue({ left: 10, top: 20, width: 100, height: 100 }),
      };

      const from = { left: 0, top: 0, width: 100, height: 100 } as DOMRect;
      const res = flip(el, from);
      expect(mockAnimate).toHaveBeenCalled();
      expect(res).toBeDefined();
    });
  });

  describe('play', () => {
    it('sets inline style directly when reduced motion is active', () => {
      window.matchMedia = vi.fn().mockReturnValue({ matches: true });
      const el: any = {
        style: {},
        animate: vi.fn().mockReturnValue({}),
      };

      play(el, 'fade', [{ opacity: '0' }, { opacity: '1' }], { duration: 200 });
      expect(el.style.opacity).toBe('1');
    });

    it('initiates animation and supports reversal on interrupt', () => {
      window.matchMedia = vi.fn().mockReturnValue({ matches: false });
      const reverseMock = vi.fn();
      const finishedPromise = new Promise<void>(() => {});

      const mockAnim = {
        playbackRate: 1,
        reverse: reverseMock,
        finished: finishedPromise,
      };
      const el: any = {
        animate: vi.fn().mockReturnValue(mockAnim),
      };

      // First play starts animation
      const anim1 = play(el, 'fade', [{ opacity: '0' }, { opacity: '1' }], { duration: 200 });
      expect(anim1).toBe(mockAnim);

      // Second play with same name before finish reverses current animation (interruption law)
      const anim2 = play(el, 'fade', [{ opacity: '0' }, { opacity: '1' }], { duration: 200 });
      expect(reverseMock).toHaveBeenCalled();
      expect(anim2).toBe(mockAnim);
    });
  });
});
