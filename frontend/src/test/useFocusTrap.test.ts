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
      contains: vi.fn().mockReturnValue(true),
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
      contains: vi.fn().mockReturnValue(true),
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

  it('redirects out-of-container focus back into modal on Tab', () => {
    const btn1: any = { id: 'btn1', offsetParent: {}, focus: vi.fn() };
    const btn2: any = { id: 'btn2', offsetParent: {}, focus: vi.fn() };
    const container: any = {
      querySelectorAll: vi.fn().mockReturnValue([btn1, btn2]),
      contains: vi.fn().mockReturnValue(false), // focus is outside!
    };

    const preventDefault = vi.fn();
    const handled = trapFocusKeydown(
      { key: 'Tab', shiftKey: false, preventDefault },
      container,
      null // No active element or outside
    );

    expect(handled).toBe(true);
    expect(preventDefault).toHaveBeenCalled();
    expect(btn1.focus).toHaveBeenCalled();
  });

  it('redirects out-of-container focus to last element on Shift+Tab', () => {
    const btn1: any = { id: 'btn1', offsetParent: {}, focus: vi.fn() };
    const btn2: any = { id: 'btn2', offsetParent: {}, focus: vi.fn() };
    const container: any = {
      querySelectorAll: vi.fn().mockReturnValue([btn1, btn2]),
      contains: vi.fn().mockReturnValue(false),
    };

    const preventDefault = vi.fn();
    const handled = trapFocusKeydown(
      { key: 'Tab', shiftKey: true, preventDefault },
      container,
      null
    );

    expect(handled).toBe(true);
    expect(preventDefault).toHaveBeenCalled();
    expect(btn2.focus).toHaveBeenCalled();
  });

  it('stops propagation when Escape is handled', () => {
    const onEscape = vi.fn();
    const preventDefault = vi.fn();
    const stopPropagation = vi.fn();

    const handled = trapFocusKeydown(
      { key: 'Escape', preventDefault, stopPropagation },
      null,
      null,
      onEscape
    );

    expect(handled).toBe(true);
    expect(preventDefault).toHaveBeenCalled();
    expect(stopPropagation).toHaveBeenCalled();
    expect(onEscape).toHaveBeenCalled();
  });
});
