import { useEffect, useRef } from 'react';

export const FOCUSABLE_SELECTOR =
  'button:not([disabled]), [contenteditable="true"], input:not([disabled]), textarea:not([disabled]), select:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])';

/**
 * Handles Tab and Escape focus cycling within a container element.
 * Returns true if the key event was trapped/handled.
 */
export function trapFocusKeydown(
  e: { key: string; shiftKey?: boolean; preventDefault: () => void },
  container: HTMLElement | null,
  activeEl: HTMLElement | null,
  onEscape?: () => void
): boolean {
  if (e.key === 'Escape' && onEscape) {
    e.preventDefault();
    onEscape();
    return true;
  }

  if (e.key === 'Tab' && container) {
    const focusableElements = Array.from(
      container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)
    ).filter((el) => el.offsetParent !== null);

    if (focusableElements.length === 0) {
      e.preventDefault();
      return true;
    }

    const first = focusableElements[0];
    const last = focusableElements[focusableElements.length - 1];

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

  useEffect(() => {
    if (!isActive) return;

    // Save previously focused element to restore when modal closes
    previousActiveElement.current = document.activeElement as HTMLElement | null;

    const container = containerRef.current;
    if (container) {
      const focusables = Array.from(
        container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)
      ).filter((el) => el.offsetParent !== null);

      if (focusables.length > 0) {
        if (!container.contains(document.activeElement)) {
          focusables[0].focus();
        }
      } else {
        container.focus();
      }
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      trapFocusKeydown(e, containerRef.current, document.activeElement as HTMLElement, onEscape);
    };

    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      // Restore focus
      if (previousActiveElement.current && typeof previousActiveElement.current.focus === 'function') {
        previousActiveElement.current.focus();
      }
    };
  }, [isActive, containerRef, onEscape]);
}
