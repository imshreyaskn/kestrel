import React, { useState, useRef, useEffect, useCallback } from 'react';
import { ArtifactData } from '../types';
import { CSP_HEADER } from '../lib/demoData';
import { MarkdownViewer } from './MarkdownViewer';
import { useFocusTrap } from '../lib/useFocusTrap';
import { prefersReducedMotion, flip } from '../lib/motion';

interface PlateViewerModalProps {
  isOpen: boolean;
  onClose: () => void;
  artifact: ArtifactData | null;
  originRect?: DOMRect | null;
  onRevise: (artifact: ArtifactData) => void;
  onCopySuccess: (msg: string) => void;
}

export const PlateViewerModal: React.FC<PlateViewerModalProps> = ({
  isOpen,
  onClose,
  artifact,
  originRect,
  onRevise,
  onCopySuccess,
}) => {
  const [viewMode, setViewMode] = useState<'preview' | 'source'>('preview');
  const [isClosing, setIsClosing] = useState(false);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const downloadTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const modalRef = useRef<HTMLDivElement>(null);
  const closeBtnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (isOpen) {
      setViewMode('preview');
      if (originRect && modalRef.current) {
        requestAnimationFrame(() => {
          const frameEl = modalRef.current?.querySelector<HTMLElement>('.pv-frame, .pv-src, .pv-doc');
          if (frameEl) {
            flip(frameEl, originRect, { duration: 380 });
          }
        });
      }
    } else {
      if (closeTimerRef.current) {
        clearTimeout(closeTimerRef.current);
        closeTimerRef.current = null;
      }
      setIsClosing(false);
    }

    return () => {
      if (closeTimerRef.current) {
        clearTimeout(closeTimerRef.current);
        closeTimerRef.current = null;
      }
      if (downloadTimerRef.current) {
        clearTimeout(downloadTimerRef.current);
        downloadTimerRef.current = null;
      }
    };
  }, [isOpen, originRect]);

  const requestClose = useCallback(() => {
    if (prefersReducedMotion() || isClosing) {
      if (closeTimerRef.current) {
        clearTimeout(closeTimerRef.current);
        closeTimerRef.current = null;
      }
      setIsClosing(false);
      onClose();
      return;
    }
    setIsClosing(true);
    if (closeTimerRef.current) {
      clearTimeout(closeTimerRef.current);
    }
    closeTimerRef.current = setTimeout(() => {
      setIsClosing(false);
      closeTimerRef.current = null;
      onClose();
    }, 240);
  }, [onClose, isClosing]);

  useFocusTrap(modalRef, isOpen, requestClose);

  if ((!isOpen && !isClosing) || !artifact) return null;

  const handleCopy = () => {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(artifact.src).then(
        () => onCopySuccess(`Copied — ${artifact.file}`),
        () => onCopySuccess('Copy failed — use the source view')
      );
    }
  };

  const handleDownload = () => {
    const mimeType = artifact.kind === 'html' ? 'text/html' : 'text/markdown';
    const blob = new Blob([artifact.src], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = artifact.file;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    if (downloadTimerRef.current) {
      clearTimeout(downloadTimerRef.current);
    }
    downloadTimerRef.current = setTimeout(() => {
      URL.revokeObjectURL(url);
      downloadTimerRef.current = null;
    }, 4000);
    onCopySuccess(`Downloaded ${artifact.file}`);
  };

  const safeSrcDoc = artifact.src.includes('<head>')
    ? artifact.src.replace('<head>', `<head>${CSP_HEADER}`)
    : `<!doctype html><html><head>${CSP_HEADER}<style>body{margin:0;font-family:serif;font-size:14px;padding:24px;line-height:1.6;}</style></head><body>${artifact.src}</body></html>`;

  return (
    <div
      ref={modalRef}
      className={`pv open${isClosing ? ' closing' : ''}`}
      id="pv"
      role="dialog"
      aria-modal="true"
      aria-labelledby="pvTitle"
      aria-hidden={!isOpen}
    >
      <header className="pv-bar">
        <button
          ref={closeBtnRef}
          type="button"
          className="icon"
          id="pvX"
          aria-label="Close plate viewer"
          style={{
            width: '30px',
            height: '30px',
            display: 'grid',
            placeItems: 'center',
            border: '1px solid var(--border)',
            borderRadius: 0,
          }}
          onClick={requestClose}
        >
          <svg className="icon" aria-hidden="true" viewBox="0 0 24 24">
            <path d="M18 6 6 18M6 6l12 12" />
          </svg>
        </button>

        <div className="pv-id">
          <span className="pv-title" id="pvTitle">
            {artifact.file}
          </span>
          <span className="pv-kind" id="pvKind">
            {artifact.kind === 'html' ? 'HTML' : 'Markdown'}
          </span>
          <span className="stamp" id="pvImp">
            {artifact.impression}
          </span>
        </div>

        <div className="pv-view" role="radiogroup" aria-label="Plate view">
          <label>
            <input
              type="radio"
              name="pvview"
              value="preview"
              checked={viewMode === 'preview'}
              onChange={() => setViewMode('preview')}
            />
            <span>Preview</span>
          </label>
          <label>
            <input
              type="radio"
              name="pvview"
              value="source"
              checked={viewMode === 'source'}
              onChange={() => setViewMode('source')}
            />
            <span>Source</span>
          </label>
        </div>

        <div className="pv-tools">
          <button
            type="button"
            className="tbtn"
            id="pvRevise"
            onClick={() => onRevise(artifact)}
          >
            Revise
          </button>
          <button type="button" className="tbtn" id="pvCopy" onClick={handleCopy}>
            Copy
          </button>
          <button type="button" className="tbtn" id="pvDl" onClick={handleDownload}>
            Download
          </button>
        </div>
      </header>

      <div className="pv-body" id="pvBody">
        {viewMode === 'source' ? (
          <pre className="pv-src">{artifact.src}</pre>
        ) : artifact.kind === 'html' ? (
          <iframe
            className="pv-frame"
            title={`Plate preview — ${artifact.file}`}
            sandbox=""
            srcDoc={safeSrcDoc}
          />
        ) : (
          <MarkdownViewer content={artifact.src} />
        )}
      </div>
    </div>
  );
};
