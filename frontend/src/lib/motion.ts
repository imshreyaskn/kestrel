/**
 * Kestrel Motion Helper — §5.7 / §5.8
 *
 * play()  — runs a named WAAPI animation on an element, reversing from
 *            its current visual state if the animation is already running.
 *            This implements the entire "Apple interruption" law in one function.
 *
 * flip()  — First-Last-Invert-Play for shared-element transitions.
 *            Capture the first rect BEFORE the DOM mutation, then call
 *            flip() AFTER the mutation to animate from old to new position.
 *
 * useMotion() — React hook that reads the user's reduced-motion preference.
 *
 * Spring constants are exported for WAAPI easing strings.
 */

// Baked spring linear() easings — generated offline, used verbatim.
// Fallback to cubic-bezier for browsers that don't support linear().
export const SPRING_SNAPPY =
  'linear(0, 0.411 7.5%, 0.918 17.5%, 1.024 25%, 1.008 32.5%, 1)';
export const SPRING_GENTLE =
  'linear(0, 0.32 10%, 0.86 22.5%, 1.03 35%, 0.995 47.5%, 1)';
export const SPRING_HEAVY =
  'linear(0, 0.24 12.5%, 0.71 30%, 0.97 50%, 1.01 70%, 1)';

export const EASE_OUT_EXPO = 'cubic-bezier(0.16, 1, 0.3, 1)';
export const EASE_SHEET    = 'cubic-bezier(0.32, 0.72, 0, 1)';
export const EASE_SPRING   = 'cubic-bezier(0.34, 1.56, 0.64, 1)';

// Is the user's OS requesting reduced motion?
export function prefersReducedMotion(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

// Per-element animation slot registry.
const slots = new WeakMap<HTMLElement, Map<string, Animation>>();

/**
 * Play a named WAAPI animation on `el`.
 * If the animation is already running, reverse it from its current state.
 * Returns the Animation so callers can chain .finished if needed.
 */
export function play(
  el: HTMLElement,
  name: string,
  keyframes: Keyframe[],
  options: KeyframeAnimationOptions
): Animation {
  // Reduced-motion: instant set to final state.
  if (prefersReducedMotion()) {
    const last = keyframes[keyframes.length - 1];
    Object.assign(el.style, last);
    const noop = el.animate([], { duration: 0 });
    return noop;
  }

  let m = slots.get(el);
  if (!m) slots.set(el, (m = new Map()));

  const prev = m.get(name);
  if (prev) {
    // Invert from wherever we are right now — Apple interruption law.
    prev.reverse();
    return prev;
  }

  const anim = el.animate(keyframes, { fill: 'both', ...options });
  m.set(name, anim);
  anim.finished
    .then(() => { if (anim.playbackRate > 0) m!.delete(name); })
    .catch(() => m!.delete(name));
  return anim;
}

/**
 * FLIP — First-Last-Invert-Play.
 *
 * Usage:
 *   const first = el.getBoundingClientRect();   // capture BEFORE mutation
 *   doTheDOMMutation();
 *   flip(el, first);                            // call AFTER mutation
 */
export function flip(
  el: HTMLElement,
  from: DOMRect,
  options: { duration?: number; easing?: string } = {}
): Animation | null {
  if (prefersReducedMotion()) return null;

  const { duration = 400, easing = EASE_OUT_EXPO } = options;
  const to = el.getBoundingClientRect();
  const dx = from.left - to.left;
  const dy = from.top  - to.top;
  const sx = from.width  / (to.width  || 1);
  const sy = from.height / (to.height || 1);

  return el.animate(
    [
      { transform: `translate(${dx}px, ${dy}px) scale(${sx}, ${sy})`, transformOrigin: 'top left' },
      { transform: 'translate(0, 0) scale(1, 1)',                      transformOrigin: 'top left' },
    ],
    { duration, easing, fill: 'both' }
  );
}

/**
 * Stamp press — the ink-stamp interaction for primary buttons (§8.3).
 * Call on the button's click event; adds `.is-stamped` class that drives the CSS animation.
 */
export function stampPress(el: HTMLElement): void {
  el.classList.remove('is-stamped');
  // Force reflow so the class removal takes effect before re-adding.
  void el.offsetWidth;
  el.classList.add('is-stamped');
  setTimeout(() => el.classList.remove('is-stamped'), 700);
}

/**
 * §9.4 Endmark bloom — trigger the gold diamond animation once.
 */
export function bloomEndmark(): void {
  const el = document.getElementById('endmark');
  if (!el) return;
  el.classList.remove('bloom');
  void el.offsetWidth;
  el.classList.add('bloom');
}

/**
 * §5.4 Stagger — sets CSS --i custom property for stagger delays,
 * capped at 6 items (240ms max) per the spec.
 */
export function applyStagger(parent: HTMLElement, selector = '.entry'): void {
  const items = parent.querySelectorAll<HTMLElement>(selector);
  items.forEach((el, i) => {
    el.style.setProperty('--i', String(Math.min(i, 5)));
  });
}

/**
 * §5.6 Type settle — adds `.is-arrived` to entry elements so the Fraunces
 * SOFT axis relaxes (30→0), reading as ink pressing into paper.
 */
export function settleEntry(entryEl: HTMLElement): void {
  if (prefersReducedMotion()) return;
  requestAnimationFrame(() => {
    entryEl.classList.add('is-arrived');
  });
}
