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

  it('correctly includes position: fixed elements where offsetParent is null', () => {
    // In DOM specs, position: fixed elements have offsetParent === null!
    const fixedBtn: any = {
      id: 'fixedCloseBtn',
      offsetParent: null,
      hidden: false,
      hasAttribute: vi.fn().mockReturnValue(false),
      getClientRects: vi.fn().mockReturnValue([{ width: 30, height: 30 }]),
      focus: vi.fn(),
    };
    const staticBtn: any = {
      id: 'staticBtn',
      offsetParent: {},
      hidden: false,
      hasAttribute: vi.fn().mockReturnValue(false),
      getClientRects: vi.fn().mockReturnValue([{ width: 80, height: 30 }]),
      focus: vi.fn(),
    };

    const container: any = {
      querySelectorAll: vi.fn().mockReturnValue([staticBtn, fixedBtn]),
      contains: vi.fn().mockReturnValue(true),
    };

    const preventDefault = vi.fn();
    // Shift+Tab from staticBtn (first) should cycle to fixedBtn (last) even though fixedBtn.offsetParent === null
    const handled = trapFocusKeydown(
      { key: 'Tab', shiftKey: true, preventDefault },
      container,
      staticBtn
    );

    expect(handled).toBe(true);
    expect(fixedBtn.focus).toHaveBeenCalled();
  });

  it('strictly filters out hidden, display:none, and aria-hidden elements', () => {
    const hiddenAttrBtn: any = {
      id: 'hiddenAttrBtn',
      offsetParent: {},
      hidden: true,
      hasAttribute: vi.fn().mockReturnValue(false),
      focus: vi.fn(),
    };
    const ariaHiddenBtn: any = {
      id: 'ariaHiddenBtn',
      offsetParent: {},
      hidden: false,
      hasAttribute: vi.fn((attr) => attr === 'aria-hidden'),
      getAttribute: vi.fn((attr) => (attr === 'aria-hidden' ? 'true' : null)),
      focus: vi.fn(),
    };
    const visibleBtn: any = {
      id: 'visibleBtn',
      offsetParent: {},
      hidden: false,
      hasAttribute: vi.fn().mockReturnValue(false),
      getClientRects: vi.fn().mockReturnValue([{ width: 50, height: 20 }]),
      focus: vi.fn(),
    };

    const container: any = {
      querySelectorAll: vi.fn().mockReturnValue([hiddenAttrBtn, ariaHiddenBtn, visibleBtn]),
      contains: vi.fn().mockReturnValue(false),
    };

    const preventDefault = vi.fn();
    const handled = trapFocusKeydown(
      { key: 'Tab', shiftKey: false, preventDefault },
      container,
      null
    );

    expect(handled).toBe(true);
    // Only visibleBtn should be focused; hidden and aria-hidden must be ignored
    expect(visibleBtn.focus).toHaveBeenCalled();
    expect(hiddenAttrBtn.focus).not.toHaveBeenCalled();
    expect(ariaHiddenBtn.focus).not.toHaveBeenCalled();
  });

  it('safely handles container with zero visible focusable elements without crashing', () => {
    const hiddenBtn: any = {
      id: 'hiddenBtn',
      hidden: true,
      hasAttribute: vi.fn().mockReturnValue(false),
      focus: vi.fn(),
    };
    const container: any = {
      querySelectorAll: vi.fn().mockReturnValue([hiddenBtn]),
      contains: vi.fn().mockReturnValue(false),
    };
    const preventDefault = vi.fn();
    const handled = trapFocusKeydown(
      { key: 'Tab', shiftKey: false, preventDefault },
      container,
      null
    );
    expect(handled).toBe(true);
    expect(preventDefault).toHaveBeenCalled();
  });

  it('ignores non-Tab, non-Escape keystrokes', () => {
    const preventDefault = vi.fn();
    const handled = trapFocusKeydown(
      { key: 'ArrowDown', shiftKey: false, preventDefault },
      null,
      null
    );
    expect(handled).toBe(false);
    expect(preventDefault).not.toHaveBeenCalled();
  });
});
