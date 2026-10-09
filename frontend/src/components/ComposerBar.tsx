import React, { useState, useRef, useEffect } from 'react';
import { ComposeMode, ArtifactKind } from '../types';

interface ComposerBarProps {
  onSubmit: (text: string, mode: ComposeMode, format: ArtifactKind, productContext?: string) => void;
  isComposing: boolean;
  activeMode: ComposeMode;
  onModeChange: (mode: ComposeMode) => void;
}

const PLACEHOLDERS: Record<ComposeMode, string> = {
  research: 'append a query to this dossier…',
  growth_brief: 'describe the problem — I’ll compose a structured brief from transcript evidence…',
  essay: 'what should the essay argue? a topic and an audience is enough…',
  artifact: 'describe the plate — “an experiment one-pager from our brief”…',
};

export const ComposerBar: React.FC<ComposerBarProps> = ({
  onSubmit,
  isComposing,
  activeMode,
  onModeChange,
}) => {
  const [text, setText] = useState('');
  const [format, setFormat] = useState<ArtifactKind>('markdown');
  const [showContext, setShowContext] = useState(false);
  const [productContext, setProductContext] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const autoGrow = () => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 190)}px`;
    }
  };

  useEffect(() => {
    autoGrow();
  }, [text]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = text.trim();
    if (!trimmed || isComposing) return;
    onSubmit(trimmed, activeMode, format, showContext ? productContext.trim() : undefined);
    setText('');
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  return (
    <footer className="compose" id="composeBar" role="region" aria-label="Composer">
      <div className="compose-in">
        <form id="ckForm" onSubmit={handleSubmit} noValidate>
          {showContext && (
            <div className="ctx-box">
              <div className="ctx-head">
                <span className="sc">Product context</span>
                <span className="ctx-opt">Optional</span>
                <button
                  type="button"
                  className="ctx-x"
                  onClick={() => {
                    setShowContext(false);
                    setProductContext('');
                  }}
                >
                  Remove
                </button>
              </div>
              <p className="ctx-help">
                Kept strictly apart from transcript evidence — never cited as podcast fact.
              </p>
              <textarea
                className="ctx-ta"
                rows={2}
                value={productContext}
                onChange={(e) => setProductContext(e.target.value)}
                placeholder="e.g. Seed-stage B2B task manager, self-serve signups, ~400 trials a month…"
              />
            </div>
          )}

          <div className="write-line">
            <span className="write-glyph" aria-hidden="true">
              ¶
            </span>
            <label className="sr-only" htmlFor="ckTa">
              Append to this dossier
            </label>
            <textarea
              ref={textareaRef}
              id="ckTa"
              rows={1}
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={PLACEHOLDERS[activeMode]}
            />
          </div>

          <div className="write-row">
            <div className="msel" role="radiogroup" aria-label="Compose as">
              <span className="as" aria-hidden="true">
                AS:
              </span>
              <label>
                <input
                  type="radio"
                  name="ckMode"
                  value="research"
                  checked={activeMode === 'research'}
                  onChange={() => onModeChange('research')}
                />
                <span>Query</span>
              </label>
              <label>
                <input
                  type="radio"
                  name="ckMode"
                  value="growth_brief"
                  checked={activeMode === 'growth_brief'}
                  onChange={() => onModeChange('growth_brief')}
                />
                <span>Brief</span>
              </label>
              <label>
                <input
                  type="radio"
                  name="ckMode"
                  value="essay"
                  checked={activeMode === 'essay'}
                  onChange={() => onModeChange('essay')}
                />
                <span>Essay</span>
              </label>
              <label>
                <input
                  type="radio"
                  name="ckMode"
                  value="artifact"
                  checked={activeMode === 'artifact'}
                  onChange={() => onModeChange('artifact')}
                />
                <span>Plate</span>
              </label>

              {activeMode === 'artifact' && (
                <span className="msel fmt">
                  <label>
                    <input
                      type="radio"
                      name="ckFmt"
                      value="markdown"
                      checked={format === 'markdown'}
                      onChange={() => setFormat('markdown')}
                    />
                    <span>Markdown</span>
                  </label>
                  <label>
                    <input
                      type="radio"
                      name="ckFmt"
                      value="html"
                      checked={format === 'html'}
                      onChange={() => setFormat('html')}
                    />
                    <span>HTML</span>
                  </label>
                </span>
              )}
            </div>

            <div className="write-acts">
              {!showContext && (
                <button
                  type="button"
                  className="ctx-toggle"
                  onClick={() => setShowContext(true)}
                >
                  + context
                </button>
              )}
              <button
                type="submit"
                className="tbtn"
                disabled={isComposing || !text.trim()}
              >
                {isComposing ? 'Composing…' : 'Bind ↵'}
              </button>
            </div>
          </div>
        </form>

        <p className="stamp compose-hint">
          Enter binds · shift+enter breaks the line · separate dossiers never share context
        </p>
      </div>
    </footer>
  );
};
