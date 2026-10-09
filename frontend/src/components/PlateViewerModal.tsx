import React, { useState, useRef, useEffect } from 'react';
import { ArtifactData } from '../types';
import { CSP_HEADER } from '../lib/demoData';

interface PlateViewerModalProps {
  isOpen: boolean;
  onClose: () => void;
  artifact: ArtifactData | null;
  onRevise: (artifact: ArtifactData) => void;
  onCopySuccess: (msg: string) => void;
}

export const PlateViewerModal: React.FC<PlateViewerModalProps> = ({
  isOpen,
  onClose,
  artifact,
  onRevise,
  onCopySuccess,
}) => {
  const [viewMode, setViewMode] = useState<'preview' | 'source'>('preview');
  const closeBtnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (isOpen) {
      setViewMode('preview');
      if (closeBtnRef.current) {
        closeBtnRef.current.focus();
      }
    }
  }, [isOpen]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isOpen) return;
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen || !artifact) return null;

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
    setTimeout(() => URL.revokeObjectURL(url), 4000);
    onCopySuccess(`Downloaded ${artifact.file}`);
  };

  const safeSrcDoc = artifact.src.includes('<head>')
    ? artifact.src.replace('<head>', `<head>${CSP_HEADER}`)
    : `<!doctype html><html><head>${CSP_HEADER}<style>body{margin:0;font-family:serif;font-size:14px;padding:24px;line-height:1.6;}</style></head><body>${artifact.src}</body></html>`;

  return (
    <div
      className="pv open"
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
            borderRadius: '8px',
          }}
          onClick={onClose}
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
          <div className="pv-doc">
            <h1>Activation without retention damage</h1>
            <p className="md-i">
              A research memo assembled from four episodes of Lenny’s Podcast. Every claim maps to a
              cited transcript passage.
            </p>
            <h2>What the experts converge on</h2>
            <ol>
              <li>
                <strong>Speed toward the “aha.”</strong> Profile your most delighted users, find the
                moment delight happens, and rebuild onboarding so everyone gets there sooner.
                Activation is time-to-that-behavior — not steps completed.
              </li>
              <li>
                <strong>Flatten the curve first.</strong> If retention doesn’t flatten, acquisition
                is filling a leaking bucket. Fix the curve before the funnel.
              </li>
              <li>
                <strong>Make the first win the user’s win.</strong> A first lesson, a first project,
                a first streak — the outcome belongs to the user, not the checklist.
              </li>
              <li>
                <strong>In PLG, value reached is expansion begun.</strong> Users who reach value
                expand themselves; sales follows usage.
              </li>
            </ol>
            <h2>Where the evidence is thin</h2>
            <p>
              No guest shares a controlled experiment pitting an activation change directly against
              retention. Treat the pattern as expert consensus, not causal proof — and guard
              retention in whatever you test.
            </p>
            <h2>Sources</h2>
            <p className="md-i">
              Superhuman — How Superhuman Built an Engine for Growth (Rahul Vohra) · Retention: The
              Core of Growth (Casey Winters) · Duolingo — How Duolingo Reignited User Growth (Jorge
              Mazal &amp; Jackson Gates) · How B2B Companies Grow with a Product-Led Motion (Elena
              Verna)
            </p>
          </div>
        )}
      </div>
    </div>
  );
};
