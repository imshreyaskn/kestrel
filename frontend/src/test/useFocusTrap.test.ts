import { describe, it, expect, vi } from 'vitest';
import { trapFocusKeydown, FOCUSABLE_SELECTOR } from '../lib/useFocusTrap';

describe('useFocusTrap and trapFocusKeydown', () => {
  it('defines correct selector for focusable elements', () => {
    expect(FOCUSABLE_SELECTOR).toContain('button');
    expect(FOCUSABLE_SELECTOR).toContain('[contenteditable="true"]');
    expect(FOCUSABLE_SELECTOR).toContain('textarea');
  });

  it('cycles focus from last element to first element on Tab', () => {
    const btn1: any = { id: 'btn1', offsetParent: {}, focus: vi.fn() };
    const btn2: any = { id: 'btn2', offsetParent: {}, focus: vi.fn() };
    const container: any = {
      querySelectorAll: vi.fn().mockReturnValue([btn1, btn2]),
    };

    const preventDefault = vi.fn();
    const handled = trapFocusKeydown(
      { key: 'Tab', shiftKey: false, preventDefault },
      container,
      btn2 // Active element is last element
    );

    expect(handled).toBe(true);
    expect(preventDefault).toHaveBeenCalledTimes(1);
    expect(btn1.focus).toHaveBeenCalledTimes(1);
  });

  it('cycles focus from first element to last element on Shift+Tab', () => {
    const btn1: any = { id: 'btn1', offsetParent: {}, focus: vi.fn() };
    const btn2: any = { id: 'btn2', offsetParent: {}, focus: vi.fn() };
    const container: any = {
      querySelectorAll: vi.fn().mockReturnValue([btn1, btn2]),
    };

    const preventDefault = vi.fn();
    const handled = trapFocusKeydown(
      { key: 'Tab', shiftKey: true, preventDefault },
      container,
      btn1 // Active element is first element
    );

    expect(handled).toBe(true);
    expect(preventDefault).toHaveBeenCalledTimes(1);
    expect(btn2.focus).toHaveBeenCalledTimes(1);
  });

  it('triggers onEscape handler when Escape key is pressed', () => {
    const onEscape = vi.fn();
    const preventDefault = vi.fn();

    const handled = trapFocusKeydown(
      { key: 'Escape', preventDefault },
      null,
      null,
      onEscape
    );

    expect(handled).toBe(true);
    expect(preventDefault).toHaveBeenCalledTimes(1);
    expect(onEscape).toHaveBeenCalledTimes(1);
  });

  it('returns false for non-navigation keys', () => {
    const preventDefault = vi.fn();
    const handled = trapFocusKeydown(
      { key: 'Enter', preventDefault },
      null,
      null
    );

    expect(handled).toBe(false);
    expect(preventDefault).not.toHaveBeenCalled();
  });
});
