import React, { useState, useRef, useEffect } from 'react';
import { ProviderConfig, ProviderId } from '../types';

interface RunningHeadProps {
  title: string;
  isUntitled: boolean;
  onTitleChange: (newTitle: string) => void;
  activeProvider: ProviderId;
  onProviderChange: (providerId: ProviderId) => void;
  providers: ProviderConfig[];
  onOpenMobileMenu: () => void;
}

export const RunningHead: React.FC<RunningHeadProps> = ({
  title,
  isUntitled,
  onTitleChange,
  activeProvider,
  onProviderChange,
  providers,
  onOpenMobileMenu,
}) => {
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [editTitleValue, setEditTitleValue] = useState(title);
  const [isColophonOpen, setIsColophonOpen] = useState(false);
  const colophonRef = useRef<HTMLDivElement>(null);
  const titleInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setEditTitleValue(title);
  }, [title]);

  useEffect(() => {
    if (isEditingTitle && titleInputRef.current) {
      titleInputRef.current.focus();
      titleInputRef.current.select();
    }
  }, [isEditingTitle]);

  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (
        isColophonOpen &&
        colophonRef.current &&
        !colophonRef.current.contains(e.target as Node)
      ) {
        setIsColophonOpen(false);
      }
    };
    document.addEventListener('click', handleOutsideClick);
    return () => document.removeEventListener('click', handleOutsideClick);
  }, [isColophonOpen]);

  const handleTitleSubmit = () => {
    setIsEditingTitle(false);
    const trimmed = editTitleValue.trim();
    if (trimmed && trimmed !== title) {
      onTitleChange(trimmed);
    } else {
      setEditTitleValue(title);
    }
  };

  const handleTitleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleTitleSubmit();
    } else if (e.key === 'Escape') {
      setIsEditingTitle(false);
      setEditTitleValue(title);
    }
  };

  const currentProvider = providers.find((p) => p.id === activeProvider) || providers[0];

  return (
    <header className="rhead" role="banner">
      <button
        className="rhead-menu icon"
        onClick={onOpenMobileMenu}
        aria-label="Open dossier index"
      >
        <svg className="icon" aria-hidden="true" viewBox="0 0 24 24">
          <path d="M4 6h16M4 12h16M4 18h16" />
        </svg>
      </button>

      <div className="rhead-brand">
        Kestrel<small>Growth dossier</small>
      </div>

      <div className="rhead-title">
        {isEditingTitle ? (
          <input
            ref={titleInputRef}
            type="text"
            className="rhead-title-input"
            value={editTitleValue}
            onChange={(e) => setEditTitleValue(e.target.value)}
            onBlur={handleTitleSubmit}
            onKeyDown={handleTitleKeyDown}
            style={{
              font: 'italic 500 14.5px var(--f-disp)',
              color: 'var(--ink)',
              background: 'var(--surface)',
              border: '1px solid var(--accent)',
              borderRadius: '3px',
              padding: '2px 8px',
              outline: 'none',
              textAlign: 'center',
              width: 'min(420px, 46vw)',
            }}
          />
        ) : (
          <span
            id="rheadTitle"
            data-empty={isUntitled ? 'true' : 'false'}
            title="Click to retitle this dossier"
            onClick={() => !isUntitled && setIsEditingTitle(true)}
            style={{ cursor: isUntitled ? 'default' : 'pointer' }}
          >
            {isUntitled ? 'untitled dossier' : title}
          </span>
        )}
      </div>

      <div style={{ position: 'relative' }} ref={colophonRef}>
        <button
          className="colobtn"
          id="coloBtn"
          aria-haspopup="dialog"
          aria-expanded={isColophonOpen}
          onClick={(e) => {
            e.stopPropagation();
            setIsColophonOpen(!isColophonOpen);
          }}
        >
          <span className="dot" aria-hidden="true"></span>
          <span id="coloLabel">
            Set in {currentProvider?.model || 'qwen2.5:1.5b'} · {currentProvider?.name.toLowerCase() || 'local'}
          </span>
        </button>

        <div
          className={`colophon ${isColophonOpen ? 'open' : ''}`}
          id="colophon"
          role="dialog"
          aria-label="Colophon — provider and archive status"
        >
          <div className="colo-head">
            <span className="sc" style={{ color: 'var(--ink)' }}>
              Colophon
            </span>
            <button
              className="icon"
              id="coloX"
              aria-label="Close colophon"
              style={{
                width: '26px',
                height: '26px',
                display: 'grid',
                placeItems: 'center',
              }}
              onClick={() => setIsColophonOpen(false)}
            >
              <svg className="icon ic12" aria-hidden="true" viewBox="0 0 24 24">
                <path d="M18 6 6 18M6 6l12 12" />
              </svg>
            </button>
          </div>

          {providers.map((p) => {
            const isSelected = p.id === activeProvider;
            return (
              <button
                key={p.id}
                className={`colo-row ${isSelected ? 'on' : ''}`}
                data-prov={p.id}
                onClick={() => {
                  onProviderChange(p.id);
                  setIsColophonOpen(false);
                }}
              >
                <span
                  className="dot"
                  aria-hidden="true"
                  style={{
                    background: isSelected ? 'var(--success)' : 'var(--faint)',
                  }}
                ></span>
                <span>
                  <span className="colo-name">{p.name}</span>
                  <span className="colo-model">{p.model}</span>
                </span>
                <span className="colo-state">{isSelected ? 'Setting' : 'Switch'}</span>
              </button>
            );
          })}

          <p className="colo-note">
            Kestrel never switches providers on its own — if the local model is unreachable,
            it asks you first.
          </p>
          <p className="stamp colo-sync">
            Episode index synced 2h ago · upstream commit 8f3c21c
          </p>
        </div>
      </div>
    </header>
  );
};
