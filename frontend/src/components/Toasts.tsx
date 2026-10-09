import React from 'react';
import { ToastMessage } from '../types';

interface ToastsProps {
  toasts: ToastMessage[];
}

export const Toasts: React.FC<ToastsProps> = ({ toasts }) => {
  return (
    <div className="toasts" id="toasts" role="status" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className="toast in">
          <svg
            className="icon"
            aria-hidden="true"
            viewBox="0 0 24 24"
            style={{ width: '15px', height: '15px', color: 'var(--accent)' }}
          >
            <path d="M20 6 9 17l-5-5" />
          </svg>
          <span>{t.message}</span>
        </div>
      ))}
    </div>
  );
};
