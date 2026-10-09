import React, { useState, useRef, useEffect } from 'react';

export type StateKey =
  | 'hero'
  | 'activation'
  | 'pricing'
  | 'brief'
  | 'plate-html'
  | 'plate-md'
  | 'insufficient'
  | 'composing'
  | 'empty'
  | 'colophon';

interface StatesTrayProps {
  onSelectState: (stateKey: StateKey) => void;
}

export const StatesTray: React.FC<StatesTrayProps> = ({ onSelectState }) => {
  const [isOpen, setIsOpen] = useState(false);
  const trayRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (isOpen && trayRef.current && !trayRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('click', handleOutsideClick);
    return () => document.removeEventListener('click', handleOutsideClick);
  }, [isOpen]);

  const handlePick = (key: StateKey) => {
    setIsOpen(false);
    onSelectState(key);
  };

  return (
    <div className="states-tray" id="statesTray" ref={trayRef}>
      <button
        type="button"
        className="states-btn"
        id="statesBtn"
        aria-haspopup="dialog"
        aria-expanded={isOpen}
        title="Preview key UI/UX states"
        onClick={(e) => {
          e.stopPropagation();
          setIsOpen(!isOpen);
        }}
      >
        <svg
          className="icon ic12"
          aria-hidden="true"
          viewBox="0 0 12 12"
          style={{ width: '12px', height: '12px' }}
        >
          <path d="M6 0 12 6 6 12 0 6Z" fill="currentColor" />
        </svg>
        <span>UI States Tray</span>
      </button>

      <div
        className={`states-menu ${isOpen ? 'open' : ''}`}
        id="statesMenu"
        role="dialog"
        aria-label="Quick State Switcher"
      >
        <button
          type="button"
          className="st-opt"
          onClick={() => handlePick('hero')}
        >
          1. Frontmatter (New Dossier) <span>Landing</span>
        </button>
        <button
          type="button"
          className="st-opt"
          onClick={() => handlePick('activation')}
        >
          2. Folio + Sidenotes + Leaders <span>Research</span>
        </button>
        <button
          type="button"
          className="st-opt"
          onClick={() => handlePick('pricing')}
        >
          3. Pricing Page Folio <span>Entry ¶</span>
        </button>
        <button
          type="button"
          className="st-opt"
          onClick={() => handlePick('brief')}
        >
          4. Growth Brief (The Fold) <span>Deliverable</span>
        </button>
        <button
          type="button"
          className="st-opt"
          onClick={() => handlePick('plate-html')}
        >
          5. Sandboxed Plate (HTML) <span>Artifact</span>
        </button>
        <button
          type="button"
          className="st-opt"
          onClick={() => handlePick('plate-md')}
        >
          6. Sandboxed Plate (MD) <span>Artifact</span>
        </button>
        <button
          type="button"
          className="st-opt"
          onClick={() => handlePick('insufficient')}
        >
          7. Insufficient Evidence <span>Advisory</span>
        </button>
        <button
          type="button"
          className="st-opt"
          onClick={() => handlePick('composing')}
        >
          8. Composing Step List <span>Working</span>
        </button>
        <button
          type="button"
          className="st-opt"
          onClick={() => handlePick('empty')}
        >
          9. Blank Folio <span>Session</span>
        </button>
        <button
          type="button"
          className="st-opt"
          onClick={() => handlePick('colophon')}
        >
          10. Colophon / Provider <span>Status</span>
        </button>
      </div>
    </div>
  );
};
