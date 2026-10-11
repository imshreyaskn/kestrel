import { useEffect, useRef } from 'react';

export const FOCUSABLE_SELECTOR =
  'button:not([disabled]), [contenteditable="true"], input:not([disabled]), textarea:not([disabled]), select:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])';

/**
 * Checks whether an element is genuinely visible and interactive in the document.
 * Unlike naive `offsetParent !== null`, this correctly retains `position: fixed` elements
 * while filtering out `hidden`, `display: none`, and `visibility: hidden` elements.
 */
export function isFocusableVisible(el: HTMLElement): boolean {
  if (el.hidden) return false;
  if (el.hasAttribute && el.hasAttribute('aria-hidden') && el.getAttribute('aria-hidden') === 'true') {
    return false;
  }
  if (typeof window !== 'undefined' && window.getComputedStyle) {
    const style = window.getComputedStyle(el);
    if (style && (style.display === 'none' || style.visibility === 'hidden')) {
      return false;
    }
    if (style && style.position === 'fixed') {
      return true;
    }
  }
  if (el.offsetParent !== null) return true;
  if (typeof el.getClientRects === 'function' && el.getClientRects().length > 0) return true;
  return false;
}

/**
 * Handles Tab and Escape focus cycling within a container element.
 * Returns true if the key event was trapped/handled.
 */
export function trapFocusKeydown(
  e: { key: string; shiftKey?: boolean; preventDefault: () => void; stopPropagation?: () => void },
  container: HTMLElement | null,
  activeEl: HTMLElement | null,
  onEscape?: () => void
): boolean {
  if (e.key === 'Escape' && onEscape) {
    e.preventDefault();
    if (typeof (e as any).stopPropagation === 'function') {
      (e as any).stopPropagation();
    }
    onEscape();
    return true;
  }

  if (e.key === 'Tab' && container) {
    const focusableElements = Array.from(
      container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)
    ).filter(isFocusableVisible);

    if (focusableElements.length === 0) {
      e.preventDefault();
      return true;
    }

    const first = focusableElements[0];
    const last = focusableElements[focusableElements.length - 1];

    if (!activeEl || !container.contains(activeEl)) {
      e.preventDefault();
      if (e.shiftKey) {
        last.focus();
      } else {
        first.focus();
      }
      return true;
    }

    if (e.shiftKey && activeEl === first) {
      e.preventDefault();
      last.focus();
      return true;
    } else if (!e.shiftKey && activeEl === last) {
      e.preventDefault();
      first.focus();
      return true;
    }
  }

  return false;
}

/**
 * Accessible Focus Trap Hook.
 * Traps Tab / Shift+Tab cycling within `containerRef` while `isActive` is true,
 * captures initial focus, and cleanly restores previous focus upon close.
 */
export function useFocusTrap(
  containerRef: React.RefObject<HTMLElement>,
  isActive: boolean,
  onEscape?: () => void
) {
  const previousActiveElement = useRef<HTMLElement | null>(null);
  const onEscapeRef = useRef(onEscape);

  useEffect(() => {
    onEscapeRef.current = onEscape;
  }, [onEscape]);

  useEffect(() => {
    if (!isActive) return;

    // Save previously focused element to restore when modal closes
    previousActiveElement.current = document.activeElement as HTMLElement | null;

    const container = containerRef.current;
    if (container) {
      const focusables = Array.from(
        container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)
      ).filter(isFocusableVisible);

      if (focusables.length > 0) {
        if (!container.contains(document.activeElement)) {
          focusables[0].focus();
        }
      } else {
        container.focus();
      }
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      trapFocusKeydown(e, containerRef.current, document.activeElement as HTMLElement, onEscapeRef.current);
    };

    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      // Restore focus safely if previous element is still attached to the document
      if (
        previousActiveElement.current &&
        previousActiveElement.current.isConnected &&
        typeof previousActiveElement.current.focus === 'function'
      ) {
        previousActiveElement.current.focus();
      }
    };
  }, [isActive, containerRef]);
}
