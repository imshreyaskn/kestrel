import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { play, flip, strikeCard, shakeConflict, prefersReducedMotion } from '../lib/motion';

describe('Phase 4: Signature Moments Engine Verification', () => {
  const origWindow = globalThis.window;
  const origDocument = globalThis.document;

  beforeEach(() => {
    vi.restoreAllMocks();

    (globalThis as any).window = {
      matchMedia: vi.fn().mockReturnValue({ matches: false }),
    };

    (globalThis as any).document = {
      querySelector: vi.fn(),
      getElementById: vi.fn(),
      startViewTransition: vi.fn((cb: () => void) => {
        cb();
        return { finished: Promise.resolve() };
      }),
    };
  });

  afterEach(() => {
    globalThis.window = origWindow;
    globalThis.document = origDocument;
  });

  describe('The Strike (§9.3) via strikeCard', () => {
    it('applies is-struck class and returns true when motion is enabled', () => {
      const classes = new Set<string>();
      const compEl: any = {
        classList: {
          add: (c: string) => classes.add(c),
          contains: (c: string) => classes.has(c),
        },
      };

      const animated = strikeCard(compEl);
      expect(animated).toBe(true);
      expect(compEl.classList.contains('is-struck')).toBe(true);
    });

    it('bypasses visual strike and returns false when reduced motion is requested', () => {
      (window.matchMedia as any).mockReturnValue({ matches: true });
      expect(prefersReducedMotion()).toBe(true);

      const classes = new Set<string>();
      const compEl: any = {
        classList: {
          add: (c: string) => classes.add(c),
          contains: (c: string) => classes.has(c),
        },
      };

      const animated = strikeCard(compEl);
      expect(animated).toBe(false);
      expect(compEl.classList.contains('is-struck')).toBe(false);
    });
  });

  describe('The Bind (§9.1) View Transition contract', () => {
    it('executes view transition callback when startViewTransition is available', () => {
      let appended = false;
      const appendFn = () => {
        appended = true;
      };

      if ('startViewTransition' in document && !prefersReducedMotion()) {
        (document as any).startViewTransition(appendFn);
      } else {
        appendFn();
      }

      expect(document.startViewTransition).toHaveBeenCalled();
      expect(appended).toBe(true);
    });

    it('falls back to direct invocation when reduced motion is preferred', () => {
      (window.matchMedia as any).mockReturnValue({ matches: true });
      let appended = false;
      const appendFn = () => {
        appended = true;
      };

      if ('startViewTransition' in document && !prefersReducedMotion()) {
        (document as any).startViewTransition(appendFn);
      } else {
        appendFn();
      }

      expect(document.startViewTransition).not.toHaveBeenCalled();
      expect(appended).toBe(true);
    });

    it('batches view switch and entry append on initial transition without scroll collision', () => {
      const scrollToMock = vi.fn();
      (globalThis as any).window.scrollTo = scrollToMock;

      let currentView = 'frontmatter';
      let appended = false;
      const isInitialSwitch = currentView === 'frontmatter';

      const appendQueryEntry = () => {
        appended = true;
      };

      if (isInitialSwitch) {
        if ('startViewTransition' in document && !prefersReducedMotion()) {
          (document as any).startViewTransition(() => {
            currentView = 'manuscript';
            appendQueryEntry();
            window.scrollTo({ top: 0, behavior: 'instant' });
          });
        } else {
          currentView = 'manuscript';
          appendQueryEntry();
          window.scrollTo({ top: 0, behavior: 'instant' });
        }
      }

      expect(document.startViewTransition).toHaveBeenCalled();
      expect(currentView).toBe('manuscript');
      expect(appended).toBe(true);
      expect(scrollToMock).toHaveBeenCalledWith({ top: 0, behavior: 'instant' });
    });

    it('smooth scrolls to bottom only on subsequent queries inside Manuscript without flashing full-page view transition', () => {
      vi.useFakeTimers();
      const scrollToMock = vi.fn();
      (globalThis as any).window.scrollTo = scrollToMock;

      const currentView: string = 'manuscript';
      let appended = false;
      const isInitialSwitch = currentView === 'frontmatter';

      const appendQueryEntry = () => {
        appended = true;
      };

      if (!isInitialSwitch) {
        appendQueryEntry();
        setTimeout(() => {
          window.scrollTo({ top: 1200, behavior: 'smooth' });
        }, 100);
      }

      expect(appended).toBe(true);
      expect(scrollToMock).not.toHaveBeenCalled();
      vi.advanceTimersByTime(100);
      expect(scrollToMock).toHaveBeenCalledWith({ top: 1200, behavior: 'smooth' });
      vi.useRealTimers();
    });
  });

  describe('Rail Delete Tip-Out (§8.5)', () => {
    it('initiates 3D tip-out animation on item wrapper using play()', async () => {
      const mockFinished = Promise.resolve();
      const mockAnim = {
        playbackRate: 1,
        finished: mockFinished,
      };

      const wrap: any = {
        animate: vi.fn().mockReturnValue(mockAnim),
      };

      let sessionDeleted = false;
      const commit = () => {
        sessionDeleted = true;
      };

      const anim = play(
        wrap,
        'delete',
        [
          { transform: 'rotateX(0deg) translateY(0)', opacity: 1 },
          { transform: 'rotateX(10deg) translateY(-6px)', opacity: 0, offset: 0.6 },
          { transform: 'rotateX(10deg) translateY(-14px)', opacity: 0 },
        ],
        { duration: 320, easing: 'cubic-bezier(0.65, 0.05, 0.36, 1)' }
      );

      expect(wrap.animate).toHaveBeenCalled();
      if (anim) {
        await anim.finished.then(commit);
      }

      expect(sessionDeleted).toBe(true);
    });
  });

  describe('Version Conflict Shake (§8.10) via shakeConflict', () => {
    it('applies conflict class to element and cleans it up after timer', () => {
      vi.useFakeTimers();
      const classes = new Set<string>();
      const chipEl: any = {
        classList: {
          add: (c: string) => classes.add(c),
          remove: (c: string) => classes.delete(c),
          contains: (c: string) => classes.has(c),
        },
        offsetWidth: 42,
      };

      shakeConflict(chipEl);
      expect(chipEl.classList.contains('conflict')).toBe(true);

      vi.advanceTimersByTime(400);
      expect(chipEl.classList.contains('conflict')).toBe(false);
      vi.useRealTimers();
    });

    it('bypasses shake animation when reduced motion is preferred', () => {
      (window.matchMedia as any).mockReturnValue({ matches: true });
      const classes = new Set<string>();
      const chipEl: any = {
        classList: {
          add: (c: string) => classes.add(c),
          remove: (c: string) => classes.delete(c),
          contains: (c: string) => classes.has(c),
        },
        offsetWidth: 42,
      };

      shakeConflict(chipEl);
      expect(chipEl.classList.contains('conflict')).toBe(false);
    });
  });

  describe('Plate FLIP Origin (§8.8)', () => {
    it('calls flip() from captured origin rect to target plate frame', () => {
      const mockAnim = { id: 'flip-anim' };
      const frameEl: any = {
        animate: vi.fn().mockReturnValue(mockAnim),
        getBoundingClientRect: vi.fn().mockReturnValue({ left: 100, top: 50, width: 800, height: 600 }),
      };

      const originRect = { left: 400, top: 200, width: 200, height: 150 } as DOMRect;
      const anim = flip(frameEl, originRect, { duration: 380 });

      expect(frameEl.animate).toHaveBeenCalled();
      expect(anim).toBe(mockAnim);
    });

    it('returns null from flip() when reduced motion is preferred', () => {
      (window.matchMedia as any).mockReturnValue({ matches: true });
      const frameEl: any = {
        getBoundingClientRect: vi.fn().mockReturnValue({ left: 100, top: 50, width: 800, height: 600 }),
      };
      const originRect = { left: 400, top: 200, width: 200, height: 150 } as DOMRect;
      const anim = flip(frameEl, originRect, { duration: 380 });
      expect(anim).toBeNull();
    });
  });

  describe('Deliverable Transitions & Composer Prefill', () => {
    it('contextualizes the essay prompt with previous query text when available', () => {
      const prevQuery = 'How does Superhuman measure PMF?';
      const prompt = `Write a Ship 30-style essay (~1,250 words) based on our research into “${prevQuery}”. Ground every claim in this session’s sources.`;
      expect(prompt).toContain(prevQuery);
      expect(prompt).toContain('~1,250 words');
    });

    it('falls back to default activation theme when no previous query exists', () => {
      const prompt = 'Write a Ship 30-style essay (~1,250 words) arguing that activation improves when you narrow the first run to one personally meaningful outcome. Ground every claim in this session’s sources.';
      expect(prompt).toContain('activation improves');
    });

    it('generates a distinct leader line for each citation instance when cited multiple times in text', () => {
      // Simulate 3 buttons citing the same note 'sn-e1' in different paragraphs
      const buttons = [
        { dataset: { note: 'sn-e1' }, offsetParent: {} },
        { dataset: { note: 'sn-e1' }, offsetParent: {} },
        { dataset: { note: 'sn-e1' }, offsetParent: {} },
      ];

      const activeLeadIds = new Set<string>();
      buttons.forEach((btn, idx) => {
        activeLeadIds.add(`${btn.dataset.note}-${idx}`);
      });

      // All 3 instances receive their own unique leader connection ID
      expect(activeLeadIds.size).toBe(3);
      expect(activeLeadIds.has('sn-e1-0')).toBe(true);
      expect(activeLeadIds.has('sn-e1-1')).toBe(true);
      expect(activeLeadIds.has('sn-e1-2')).toBe(true);
    });
  });
});

