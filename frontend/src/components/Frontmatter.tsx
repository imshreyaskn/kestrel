import React, { useState, useRef, useEffect } from 'react';
import { ComposeMode, ArtifactKind } from '../types';

interface FrontmatterProps {
  onSubmit: (text: string, mode: ComposeMode, format: ArtifactKind, productContext?: string) => void;
  isComposing: boolean;
  onSelectIndexMode: (mode: ComposeMode, prefill?: string) => void;
}

const PLACEHOLDERS: Record<ComposeMode, string> = {
  research: 'write your question into the dossier…',
  growth_brief: 'describe the problem — I’ll compose a structured brief from transcript evidence…',
  essay: 'what should the essay argue? a topic and an audience is enough…',
  artifact: 'describe the plate — “an experiment one-pager from our brief”…',
};

export const Frontmatter: React.FC<FrontmatterProps> = ({
  onSubmit,
  isComposing,
  onSelectIndexMode,
}) => {
  const [queryText, setQueryText] = useState('');
  const [mode, setMode] = useState<ComposeMode>('research');
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
  }, [queryText]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = queryText.trim();
    if (!trimmed || isComposing) return;
    onSubmit(trimmed, mode, format, showContext ? productContext.trim() : undefined);
    setQueryText('');
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  const handleTryClick = (prefill: string) => {
    setQueryText(prefill);
    if (textareaRef.current) {
      textareaRef.current.focus();
    }
  };

  return (
    <section className="frontmatter" id="frontmatter" aria-label="New dossier">
      <div className="fm-mast">
        <span className="left">
          Kestrel<em>a growth research dossier, drawn from Lenny’s Podcast archive</em>
        </span>
        <span className="right">Research · Decide · Create · Refine</span>
      </div>

      <div className="fm-col">
        <h1 className="hero-h" id="heroH">
          <span className="w">What</span> <span className="w">are</span> <span className="w">you</span>{' '}
          <span className="w wonk">working</span>
          <button
            type="button"
            className="star sn-ref"
            data-note="land-1"
            data-n="*"
            aria-label="Read the margin note"
          >
            ✳
          </button>{' '}
          <span className="w">through?</span>
        </h1>
        <p className="hero-lede">
          An evidence-first research companion. Every claim in this dossier is typeset with its
          source in the margin — tap a number to read the exact passage it rests on, then decide for
          yourself.
        </p>

        {/* Demonstration sidenote */}
        <aside className="snote" id="land-1" tabIndex={-1} aria-label="Margin note">
          <div className="snote-in">
            <div className="snote-top">
              <span className="snote-n">✳</span>
              <p className="snote-src">How to read this dossier</p>
            </div>
            <blockquote className="snote-q">
              Answers carry small numbers in the text. Each one is a leader line to a passage in the
              margin — hover either end and both light up. Nothing is cited that wasn’t retrieved.
            </blockquote>
            <p className="stamp snote-stamp">This note is itself a demonstration</p>
          </div>
        </aside>
      </div>

      <form className="write" id="fmForm" onSubmit={handleSubmit} noValidate>
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
              Stage, customer, goal, constraints. Kept strictly apart from transcript evidence — never
              cited as podcast fact.
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
          <label className="sr-only" htmlFor="fmTa">
            Write your question
          </label>
          <textarea
            ref={textareaRef}
            id="fmTa"
            rows={1}
            value={queryText}
            onChange={(e) => setQueryText(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={PLACEHOLDERS[mode]}
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
                name="fmMode"
                value="research"
                checked={mode === 'research'}
                onChange={() => setMode('research')}
              />
              <span>Query</span>
            </label>
            <label>
              <input
                type="radio"
                name="fmMode"
                value="growth_brief"
                checked={mode === 'growth_brief'}
                onChange={() => setMode('growth_brief')}
              />
              <span>Brief</span>
            </label>
            <label>
              <input
                type="radio"
                name="fmMode"
                value="essay"
                checked={mode === 'essay'}
                onChange={() => setMode('essay')}
              />
              <span>Essay</span>
            </label>
            <label>
              <input
                type="radio"
                name="fmMode"
                value="artifact"
                checked={mode === 'artifact'}
                onChange={() => setMode('artifact')}
              />
              <span>Plate</span>
            </label>

            {mode === 'artifact' && (
              <span className="msel fmt">
                <label>
                  <input
                    type="radio"
                    name="fmFmt"
                    value="markdown"
                    checked={format === 'markdown'}
                    onChange={() => setFormat('markdown')}
                  />
                  <span>Markdown</span>
                </label>
                <label>
                  <input
                    type="radio"
                    name="fmFmt"
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
                + product context
              </button>
            )}
            <button
              type="submit"
              className="tbtn"
              disabled={isComposing || !queryText.trim()}
            >
              {isComposing ? 'Composing…' : 'Bind to archive ↵'}
            </button>
          </div>
        </div>
      </form>

      <div className="try">
        <span className="sc">Try</span>
        <button
          type="button"
          className="try-q"
          onClick={() =>
            handleTryClick('How can an early-stage SaaS improve activation without hurting retention?')
          }
        >
          “How can an early-stage SaaS improve activation without hurting retention?”
        </button>
        <button
          type="button"
          className="try-q"
          onClick={() =>
            handleTryClick('What makes a pricing page convert for a self-serve B2B product?')
          }
        >
          “What makes a pricing page convert?”
        </button>
      </div>

      <div className="idx" role="list">
        <button
          type="button"
          className="idx-row"
          role="listitem"
          onClick={() => onSelectIndexMode('research')}
        >
          <span className="idx-num">I.</span>
          <span>
            <span className="idx-t">Research a problem</span>
            <span className="idx-d" style={{ display: 'block' }}>
              Ask anything — the answer is typeset with its evidence in the margin, every passage
              verbatim.
            </span>
          </span>
          <span className="idx-a" aria-hidden="true">
            →
          </span>
        </button>

        <button
          type="button"
          className="idx-row"
          role="listitem"
          onClick={() =>
            onSelectIndexMode(
              'growth_brief',
              'Build a growth brief: how can we improve week-one activation without harming retention?'
            )
          }
        >
          <span className="idx-num">II.</span>
          <span>
            <span className="idx-t">Compose a growth brief</span>
            <span className="idx-d" style={{ display: 'block' }}>
              Problem, evidence, recommendation, experiment — a structured deliverable, not a chat
              transcript.
            </span>
          </span>
          <span className="idx-a" aria-hidden="true">
            →
          </span>
        </button>

        <button
          type="button"
          className="idx-row"
          role="listitem"
          onClick={() =>
            onSelectIndexMode(
              'artifact',
              'Cast an HTML one-pager artifact summarizing our activation experiment.'
            )
          }
        >
          <span className="idx-num">III.</span>
          <span>
            <span className="idx-t">Typeset a deliverable</span>
            <span className="idx-d" style={{ display: 'block' }}>
              A Ship 30-style essay, or a plate — an HTML artifact examined in a safe, sandboxed
              frame.
            </span>
          </span>
          <span className="idx-a" aria-hidden="true">
            →
          </span>
        </button>
      </div>

      <p className="fm-foot">
        Editorial Research Studio · all citations map to verified archive chunks · nothing unsourced
      </p>
    </section>
  );
};
