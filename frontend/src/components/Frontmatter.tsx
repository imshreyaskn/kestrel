import React, { useState, useRef, useEffect } from 'react';
import { ComposeMode, ArtifactKind } from '../types';
import { stampPress } from '../lib/motion';
import { FALCON_ASCII } from '../lib/asciiArt';

interface FrontmatterProps {
  onSubmit: (text: string, mode: ComposeMode, format: ArtifactKind, productContext?: string) => void;
  isComposing: boolean;
  onSelectIndexMode: (mode: ComposeMode, prefill?: string) => void;
  prefillText?: string | null;
  onClearPrefill?: () => void;
}

const PLACEHOLDERS: Record<ComposeMode, string> = {
  research: 'write your question into the dossier…',
  growth_brief: 'describe the problem — I’ll compose a structured brief from transcript evidence…',
  essay: 'what should the essay argue? a topic and an audience is enough…',
  artifact: 'describe the plate — “an experiment one-pager from our brief”…',
};

type CardMode = 'research' | 'growth_brief' | 'deliverable';

const RESEARCH_CHIPS = [
  'How do top SaaS companies transition from PLG to enterprise sales?',
  'How does Superhuman measure product-market fit delight?',
  'What are Elena Verna’s core B2B growth loop frameworks?',
  'What are realistic week-one activation rate benchmarks for B2B freemium?',
];

const BRIEF_CHIPS = [
  'Improve week-one onboarding activation without harming long-term retention',
  'Design an experiment to increase free-to-paid trial conversion',
  'Transition self-serve product usage into sales-assisted enterprise pipeline',
  'Reduce annual plan renewal churn with proactive usage milestones',
];

const DELIVERABLE_CHIPS = [
  'Cast an HTML activation experiment scorecard and calculator',
  'A Ship 30 essay on the anatomy of an effective onboarding sequence',
  'Cast an interactive HTML pricing tier teardown matrix',
  'A Ship 30 essay on product-led growth loops vs traditional funnels',
];

export const Frontmatter: React.FC<FrontmatterProps> = ({
  onSubmit,
  isComposing,
  onSelectIndexMode,
  prefillText,
  onClearPrefill,
}) => {
  const [expandedMode, setExpandedMode] = useState<CardMode | null>(null);
  const [queryText, setQueryText] = useState('');
  const [mode, setMode] = useState<ComposeMode>('research');
  const [format, setFormat] = useState<ArtifactKind>('markdown');
  const [showContext, setShowContext] = useState(false);
  const [productContext, setProductContext] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const cardTextareaRef = useRef<HTMLTextAreaElement>(null);

  const autoGrow = () => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 190)}px`;
    }
    if (cardTextareaRef.current) {
      cardTextareaRef.current.style.height = 'auto';
      cardTextareaRef.current.style.height = `${Math.min(cardTextareaRef.current.scrollHeight, 180)}px`;
    }
  };

  useEffect(() => {
    autoGrow();
  }, [queryText]);

  useEffect(() => {
    if (prefillText) {
      setQueryText(prefillText);
      onClearPrefill?.();
      if (cardTextareaRef.current) {
        cardTextareaRef.current.focus();
      } else if (textareaRef.current) {
        textareaRef.current.focus();
      }
    }
  }, [prefillText, onClearPrefill]);

  const toggleCard = (card: CardMode) => {
    if (expandedMode === card) {
      setExpandedMode(null);
    } else {
      setExpandedMode(card);
      const targetMode: ComposeMode =
        card === 'deliverable'
          ? (mode === 'essay' || mode === 'artifact' ? mode : 'essay')
          : card;
      setMode(targetMode);
      onSelectIndexMode(targetMode);
      setTimeout(() => {
        if (cardTextareaRef.current) {
          cardTextareaRef.current.focus();
        }
      }, 60);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = queryText.trim();
    if (!trimmed || isComposing) return;
    onSubmit(trimmed, mode, format, showContext ? productContext.trim() : undefined);
    setQueryText('');
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Escape') {
      if (expandedMode) {
        e.preventDefault();
        setExpandedMode(null);
      }
      return;
    }
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  return (
    <section className="frontmatter" id="frontmatter" aria-label="New dossier">
      <div className="fm-col">
        <div className="hero-head-anchor">
          <div className="hero-ascii-falcon" aria-hidden="true" role="presentation">
            <pre>{FALCON_ASCII}</pre>
          </div>
          <h1 className="hero-h" id="heroH">
            <span className="hero-row">
              <span className="w">What</span> <span className="w">are</span> <span className="w">you</span>
            </span>
            <span className="hero-row">
              <span className="w wonk">working</span>
              <button
                type="button"
                className="star sn-ref"
                data-note="land-1"
                data-n="*"
                aria-label="Read the margin note"
              >
                ✳
              </button>
            </span>
            <span className="hero-row">
              <span className="w">through?</span>
            </span>
          </h1>
        </div>
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

      <div className="idx" role="list">
        {/* CARD I: Research a problem */}
        <div className={`idx-item ${expandedMode === 'research' ? 'open' : ''}`} role="listitem">
          <button
            type="button"
            className="idx-row"
            aria-expanded={expandedMode === 'research'}
            aria-controls="idx-panel-research"
            onClick={() => toggleCard('research')}
          >
            <span className="idx-num">I.</span>
            <span>
              <span className="idx-t">Research a problem</span>
              <span className="idx-d" style={{ display: 'block' }}>
                Ask anything — the answer is typeset with its evidence in the margin, every passage
                verbatim.
              </span>
            </span>
            <span className={`idx-a ${expandedMode === 'research' ? 'open' : ''}`} aria-hidden="true">
              {expandedMode === 'research' ? '↓' : '→'}
            </span>
          </button>

          {expandedMode === 'research' && (
            <div
              className="idx-panel"
              id="idx-panel-research"
              role="region"
              aria-label="Research inquiry form"
              onKeyDown={(e) => {
                if (e.key === 'Escape') {
                  e.preventDefault();
                  setExpandedMode(null);
                }
              }}
            >
              <div className="idx-write-line">
                <span className="write-glyph" aria-hidden="true">
                  ¶
                </span>
                <label className="sr-only" htmlFor="cardTaResearch">
                  State your research question
                </label>
                <textarea
                  ref={cardTextareaRef}
                  id="cardTaResearch"
                  rows={2}
                  value={queryText}
                  onChange={(e) => setQueryText(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="What question or strategic challenge are you researching in the archive?"
                  className="idx-ta"
                />
              </div>

              <div className="idx-chips-wrap">
                <span className="idx-chips-label">Inspiration / Topics:</span>
                <div className="idx-chips">
                  {RESEARCH_CHIPS.map((chip, idx) => (
                    <button
                      key={idx}
                      type="button"
                      className="idx-chip"
                      onClick={() => {
                        setQueryText(chip);
                        cardTextareaRef.current?.focus();
                      }}
                    >
                      {chip}
                    </button>
                  ))}
                </div>
              </div>

              {showContext && (
                <div className="ctx-box" style={{ marginTop: '14px' }}>
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
                  <textarea
                    className="ctx-ta"
                    rows={2}
                    value={productContext}
                    onChange={(e) => setProductContext(e.target.value)}
                    placeholder="Stage, customer, goal, constraints (e.g. B2B SaaS, 400 signups/mo)…"
                  />
                </div>
              )}

              <div className="idx-actions">
                {!showContext && (
                  <button type="button" className="ctx-toggle" onClick={() => setShowContext(true)}>
                    + product context
                  </button>
                )}
                <button type="button" className="idx-cancel-btn" onClick={() => setExpandedMode(null)}>
                  Dismiss
                </button>
                <button
                  type="button"
                  className="tbtn"
                  disabled={isComposing || !queryText.trim()}
                  onClick={(e) => {
                    stampPress(e.currentTarget);
                    handleSubmit(e);
                  }}
                >
                  {isComposing ? 'Composing…' : 'Research Problem ↵'}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* CARD II: Compose a growth brief */}
        <div className={`idx-item ${expandedMode === 'growth_brief' ? 'open' : ''}`} role="listitem">
          <button
            type="button"
            className="idx-row"
            aria-expanded={expandedMode === 'growth_brief'}
            aria-controls="idx-panel-brief"
            onClick={() => toggleCard('growth_brief')}
          >
            <span className="idx-num">II.</span>
            <span>
              <span className="idx-t">Compose a growth brief</span>
              <span className="idx-d" style={{ display: 'block' }}>
                Problem, evidence, recommendation, experiment — a structured deliverable, not a chat
                transcript.
              </span>
            </span>
            <span className={`idx-a ${expandedMode === 'growth_brief' ? 'open' : ''}`} aria-hidden="true">
              {expandedMode === 'growth_brief' ? '↓' : '→'}
            </span>
          </button>

          {expandedMode === 'growth_brief' && (
            <div
              className="idx-panel"
              id="idx-panel-brief"
              role="region"
              aria-label="Growth brief form"
              onKeyDown={(e) => {
                if (e.key === 'Escape') {
                  e.preventDefault();
                  setExpandedMode(null);
                }
              }}
            >
              <div className="idx-write-line">
                <span className="write-glyph" aria-hidden="true">
                  ¶
                </span>
                <label className="sr-only" htmlFor="cardTaBrief">
                  Describe your growth problem
                </label>
                <textarea
                  ref={cardTextareaRef}
                  id="cardTaBrief"
                  rows={2}
                  value={queryText}
                  onChange={(e) => setQueryText(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="What growth problem or bottleneck should this brief address?"
                  className="idx-ta"
                />
              </div>

              <div className="idx-chips-wrap">
                <span className="idx-chips-label">Suggested Brief Topics:</span>
                <div className="idx-chips">
                  {BRIEF_CHIPS.map((chip, idx) => (
                    <button
                      key={idx}
                      type="button"
                      className="idx-chip"
                      onClick={() => {
                        setQueryText(chip);
                        cardTextareaRef.current?.focus();
                      }}
                    >
                      {chip}
                    </button>
                  ))}
                </div>
              </div>

              {showContext && (
                <div className="ctx-box" style={{ marginTop: '14px' }}>
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
                  <textarea
                    className="ctx-ta"
                    rows={2}
                    value={productContext}
                    onChange={(e) => setProductContext(e.target.value)}
                    placeholder="Stage, customer, goal, constraints (e.g. B2B SaaS, 400 signups/mo)…"
                  />
                </div>
              )}

              <div className="idx-actions">
                {!showContext && (
                  <button type="button" className="ctx-toggle" onClick={() => setShowContext(true)}>
                    + product context
                  </button>
                )}
                <button type="button" className="idx-cancel-btn" onClick={() => setExpandedMode(null)}>
                  Dismiss
                </button>
                <button
                  type="button"
                  className="tbtn"
                  disabled={isComposing || !queryText.trim()}
                  onClick={(e) => {
                    stampPress(e.currentTarget);
                    handleSubmit(e);
                  }}
                >
                  {isComposing ? 'Composing…' : 'Draft Growth Brief ↵'}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* CARD III: Typeset a deliverable */}
        <div className={`idx-item ${expandedMode === 'deliverable' ? 'open' : ''}`} role="listitem">
          <button
            type="button"
            className="idx-row"
            aria-expanded={expandedMode === 'deliverable'}
            aria-controls="idx-panel-deliverable"
            onClick={() => toggleCard('deliverable')}
          >
            <span className="idx-num">III.</span>
            <span>
              <span className="idx-t">Typeset a deliverable</span>
              <span className="idx-d" style={{ display: 'block' }}>
                A Ship 30-style essay, or a plate — an HTML artifact examined in a safe, sandboxed
                frame.
              </span>
            </span>
            <span className={`idx-a ${expandedMode === 'deliverable' ? 'open' : ''}`} aria-hidden="true">
              {expandedMode === 'deliverable' ? '↓' : '→'}
            </span>
          </button>

          {expandedMode === 'deliverable' && (
            <div
              className="idx-panel"
              id="idx-panel-deliverable"
              role="region"
              aria-label="Deliverable typeset form"
              onKeyDown={(e) => {
                if (e.key === 'Escape') {
                  e.preventDefault();
                  setExpandedMode(null);
                }
              }}
            >
              <div className="idx-format-selector" role="radiogroup" aria-label="Deliverable format">
                <label className={`idx-fmt-pill ${mode === 'essay' ? 'active' : ''}`}>
                  <input
                    type="radio"
                    name="idxDeliverableFmt"
                    checked={mode === 'essay'}
                    onChange={() => {
                      setMode('essay');
                      onSelectIndexMode('essay');
                    }}
                  />
                  <span>Ship 30 Essay</span>
                </label>
                <label className={`idx-fmt-pill ${mode === 'artifact' && format === 'html' ? 'active' : ''}`}>
                  <input
                    type="radio"
                    name="idxDeliverableFmt"
                    checked={mode === 'artifact' && format === 'html'}
                    onChange={() => {
                      setMode('artifact');
                      setFormat('html');
                      onSelectIndexMode('artifact');
                    }}
                  />
                  <span>HTML Plate</span>
                </label>
                <label className={`idx-fmt-pill ${mode === 'artifact' && format === 'markdown' ? 'active' : ''}`}>
                  <input
                    type="radio"
                    name="idxDeliverableFmt"
                    checked={mode === 'artifact' && format === 'markdown'}
                    onChange={() => {
                      setMode('artifact');
                      setFormat('markdown');
                      onSelectIndexMode('artifact');
                    }}
                  />
                  <span>Markdown Plate</span>
                </label>
              </div>

              <div className="idx-write-line">
                <span className="write-glyph" aria-hidden="true">
                  ¶
                </span>
                <label className="sr-only" htmlFor="cardTaDeliverable">
                  Describe the deliverable
                </label>
                <textarea
                  ref={cardTextareaRef}
                  id="cardTaDeliverable"
                  rows={2}
                  value={queryText}
                  onChange={(e) => setQueryText(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder={
                    mode === 'essay'
                      ? 'What should the essay argue? Specify a thesis or audience…'
                      : 'Describe the plate (e.g. an experiment one-pager scorecard, pricing matrix)…'
                  }
                  className="idx-ta"
                />
              </div>

              <div className="idx-chips-wrap">
                <span className="idx-chips-label">Inspiration / Deliverables:</span>
                <div className="idx-chips">
                  {DELIVERABLE_CHIPS.map((chip, idx) => (
                    <button
                      key={idx}
                      type="button"
                      className="idx-chip"
                      onClick={() => {
                        setQueryText(chip);
                        cardTextareaRef.current?.focus();
                      }}
                    >
                      {chip}
                    </button>
                  ))}
                </div>
              </div>

              {showContext && (
                <div className="ctx-box" style={{ marginTop: '14px' }}>
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
                  <textarea
                    className="ctx-ta"
                    rows={2}
                    value={productContext}
                    onChange={(e) => setProductContext(e.target.value)}
                    placeholder="Stage, customer, goal, constraints (e.g. B2B SaaS, 400 signups/mo)…"
                  />
                </div>
              )}

              <div className="idx-actions">
                {!showContext && (
                  <button type="button" className="ctx-toggle" onClick={() => setShowContext(true)}>
                    + product context
                  </button>
                )}
                <button type="button" className="idx-cancel-btn" onClick={() => setExpandedMode(null)}>
                  Dismiss
                </button>
                <button
                  type="button"
                  className="tbtn"
                  disabled={isComposing || !queryText.trim()}
                  onClick={(e) => {
                    stampPress(e.currentTarget);
                    handleSubmit(e);
                  }}
                >
                  {isComposing
                    ? 'Composing…'
                    : mode === 'essay'
                    ? 'Typeset Essay ↵'
                    : 'Cast Plate ↵'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Default Floating Dock — active when no in-card accordion is open */}
      {!expandedMode && (
        <div className="fm-dock" role="region" aria-label="Query dock">
          <div className="fm-dock-in">
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
                    onClick={(e) => stampPress(e.currentTarget)}
                  >
                    {isComposing ? 'Composing…' : 'Bind to archive ↵'}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}
    </section>
  );
};
