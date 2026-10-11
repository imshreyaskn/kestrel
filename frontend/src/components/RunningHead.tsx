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
  isComposing?: boolean;
}

export const RunningHead: React.FC<RunningHeadProps> = ({
  title,
  isUntitled,
  onTitleChange,
  activeProvider,
  onProviderChange,
  providers,
  onOpenMobileMenu,
  isComposing = false,
}) => {
  const MAX_TITLE_LENGTH = 60;
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [charCount, setCharCount] = useState(0);
  const [isColophonOpen, setIsColophonOpen] = useState(false);
  const colophonRef = useRef<HTMLDivElement>(null);
  const spanRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (spanRef.current && !isEditingTitle) {
      spanRef.current.textContent = isUntitled ? 'untitled dossier' : title;
    }
  }, [title, isUntitled, isEditingTitle]);

  useEffect(() => {
    if (isEditingTitle && spanRef.current) {
      spanRef.current.focus();
      const range = document.createRange();
      range.selectNodeContents(spanRef.current);
      const sel = window.getSelection();
      sel?.removeAllRanges();
      sel?.addRange(range);
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

  const handleInput = () => {
    if (!spanRef.current) return;
    const raw = spanRef.current.textContent || '';
    if (raw.length > MAX_TITLE_LENGTH) {
      spanRef.current.textContent = raw.slice(0, MAX_TITLE_LENGTH);
      const range = document.createRange();
      range.selectNodeContents(spanRef.current);
      range.collapse(false);
      const sel = window.getSelection();
      sel?.removeAllRanges();
      sel?.addRange(range);
      setCharCount(MAX_TITLE_LENGTH);
    } else {
      setCharCount(raw.length);
    }
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLSpanElement>) => {
    e.preventDefault();
    const paste = e.clipboardData.getData('text/plain').replace(/[\r\n]+/g, ' ');
    const current = spanRef.current?.textContent || '';
    const sel = window.getSelection();
    const selectedLength = sel?.toString().length || 0;
    const available = Math.max(0, MAX_TITLE_LENGTH - (current.length - selectedLength));
    if (available > 0) {
      const insert = paste.slice(0, available);
      const range = sel && sel.rangeCount > 0 ? sel.getRangeAt(0) : null;
      if (range) {
        range.deleteContents();
        const node = document.createTextNode(insert);
        range.insertNode(node);
        range.setStartAfter(node);
        range.collapse(true);
        sel?.removeAllRanges();
        sel?.addRange(range);
      } else if (spanRef.current) {
        spanRef.current.textContent = current + insert;
      }
      setCharCount(spanRef.current?.textContent?.length || 0);
    }
  };

  const commitTitle = () => {
    setIsEditingTitle(false);
    const text = spanRef.current?.textContent?.trim().slice(0, MAX_TITLE_LENGTH);
    if (text && text !== (isUntitled ? 'untitled dossier' : title)) {
      onTitleChange(text);
    } else if (spanRef.current) {
      spanRef.current.textContent = isUntitled ? 'untitled dossier' : title;
    }
  };

  const cancelTitle = () => {
    setIsEditingTitle(false);
    if (spanRef.current) {
      spanRef.current.textContent = isUntitled ? 'untitled dossier' : title;
    }
  };

  const handleTitleKeyDown = (e: React.KeyboardEvent<HTMLSpanElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      spanRef.current?.blur();
      return;
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      cancelTitle();
      return;
    }
    // Block regular key inputs beyond MAX_TITLE_LENGTH
    if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
      const current = spanRef.current?.textContent || '';
      const sel = window.getSelection();
      const selectedLength = sel?.toString().length || 0;
      if (current.length - selectedLength >= MAX_TITLE_LENGTH) {
        e.preventDefault();
      }
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
        Kestrel<small>growth research dossier, drawn from Lenny’s Podcast archive</small>
      </div>

      <div className="rhead-title">
        <span
          ref={spanRef}
          id="rheadTitle"
          className={`rhead-title-text${isEditingTitle ? ' is-editing' : ''}`}
          data-empty={isUntitled ? 'true' : 'false'}
          contentEditable={isEditingTitle}
          suppressContentEditableWarning
          spellCheck={false}
          title={isEditingTitle ? undefined : 'Double-click to retitle this dossier'}
          onDoubleClick={() => {
            setIsEditingTitle(true);
            setCharCount((isUntitled ? '' : title).length);
          }}
          onInput={handleInput}
          onPaste={handlePaste}
          onBlur={commitTitle}
          onKeyDown={handleTitleKeyDown}
        >
          {isUntitled ? 'untitled dossier' : title}
        </span>
        {isEditingTitle && (
          <span
            className="rhead-title-counter"
            data-limit={
              charCount >= MAX_TITLE_LENGTH
                ? 'reached'
                : charCount >= MAX_TITLE_LENGTH - 10
                ? 'near'
                : 'normal'
            }
            aria-live="polite"
          >
            {charCount} / {MAX_TITLE_LENGTH}
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
          <span
            className={`dot${isComposing ? ' composing' : ''}${currentProvider?.status === 'offline' ? ' offline' : ''}`}
            aria-hidden="true"
          />
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
            transcript archive · every citation maps to a stored chunk
          </p>
        </div>
      </div>
    </header>
  );
};
