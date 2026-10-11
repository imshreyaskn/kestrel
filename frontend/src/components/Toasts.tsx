import React, { useEffect, useRef } from 'react';
import { ToastMessage } from '../types';

interface ToastsProps {
  toasts: ToastMessage[];
}

/**
 * §8.9 Printed slips — each toast enters with a slight tilt and upward slip.
 * The `.in` class is added on next frame so the CSS transition fires.
 */
const Slip: React.FC<{ toast: ToastMessage }> = ({ toast }) => {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Force the browser to paint the initial transform before adding .in
    const id = requestAnimationFrame(() => {
      ref.current?.classList.add('in');
    });
    return () => cancelAnimationFrame(id);
  }, []);

  return (
    <div
      ref={ref}
      className={`toast${toast.tone === 'danger' ? ' danger' : ''}${toast.out ? ' out' : ''}`}
    >
      {toast.tone === 'danger' ? (
        <svg
          className="icon"
          aria-hidden="true"
          viewBox="0 0 24 24"
          style={{ width: '13px', height: '13px', strokeWidth: 2.2 }}
        >
          {/* Oxblood strike glyph (§6.2) */}
          <path d="M4 12h16M4 12l2-2M4 12l2 2M20 12l-2-2M20 12l-2 2" />
        </svg>
      ) : (
        <svg
          className="icon"
          aria-hidden="true"
          viewBox="0 0 24 24"
          style={{ width: '13px', height: '13px', strokeWidth: 2.2 }}
        >
          {/* Aubergine ink tick */}
          <path d="M20 6 9 17l-5-5" />
        </svg>
      )}
      <span>{toast.message}</span>
    </div>
  );
};

export const Toasts: React.FC<ToastsProps> = ({ toasts }) => {
  return (
    <div className="toasts" id="toasts" aria-live="polite" aria-atomic="false">
      {toasts.map((t) => (
        <Slip key={t.id} toast={t} />
      ))}
    </div>
  );
};
