import React, { useEffect, useRef } from 'react';
import { Citation, ComposingStep, ManuscriptEntry } from '../types';
import { segmentTextWithCitations } from '../lib/citeInline';
import { bloomEndmark, settleEntry } from '../lib/motion';
import { SideNote } from './SideNote';
import { PlateAside } from './PlateAside';

interface ManuscriptProps {
  entries: ManuscriptEntry[];
  isComposing: boolean;
  composingSteps: ComposingStep[];
  composingStamp: string;
  onStrikeRun: () => void;
  onOpenBrief: () => void;
  onSetEssay: (prompt: string) => void;
  onExaminePlate: (artId: string) => void;
  onPrefillQuery: (text: string) => void;
  onRetryLast: () => void;
}

/**
 * Render a text run with inline citation markers ([E1]/[1]) replaced by
 * interactive .sn-ref buttons, plus minimal editorial emphasis (bold/italic).
 * Everything is emitted as text nodes — model output is never injected as
 * raw HTML (SPEC §9.2).
 */
const RichText: React.FC<{ text: string; citations?: Citation[] }> = ({ text, citations }) => {
  if (!citations || citations.length === 0) {
    return <>{renderEmphasis(text)}</>;
  }
  const segments = segmentTextWithCitations(text, citations);
  return (
    <>
      {segments.map((seg, i) => {
        if (typeof seg === 'string') {
          return <React.Fragment key={i}>{renderEmphasis(seg)}</React.Fragment>;
        }
        const cit = citations.find((c) => c.refIndex === seg.refIndex);
        if (!cit) return <React.Fragment key={i}>[{seg.evidenceId}]</React.Fragment>;
        return (
          <button
            key={i}
            type="button"
            className="sn-ref"
            data-note={cit.id}
            data-n={cit.refIndex}
            aria-label={`Read evidence note ${cit.refIndex}`}
          >
            {cit.refIndex}
          </button>
        );
      })}
    </>
  );
};

/** Minimal inline markdown: **bold** and *emphasis* only, as safe React nodes. */
function renderEmphasis(text: string): React.ReactNode {
  const parts = text.split(/(\*\*[^*]+\*\*|\*[^*]+\*)/g);
  if (parts.length === 1) return text;
  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**') && part.length > 4) {
      return <strong key={i}>{part.slice(2, -2)}</strong>;
    }
    if (part.startsWith('*') && part.endsWith('*') && part.length > 2) {
      return <em key={i}>{part.slice(1, -1)}</em>;
    }
    return part;
  });
}

export const Manuscript: React.FC<ManuscriptProps> = ({
  entries,
  isComposing,
  composingSteps,
  composingStamp,
  onStrikeRun,
  onOpenBrief,
  onSetEssay,
  onExaminePlate,
  onPrefillQuery,
  onRetryLast,
}) => {
  const prevEntryCount = useRef(entries.length);
  const entriesRef = useRef<HTMLDivElement>(null);

  // Bloom the endmark and settle entries when a new answer arrives.
  useEffect(() => {
    if (entries.length > prevEntryCount.current) {
      bloomEndmark();
      // Settle the last entry's type variation
      const lastEl = entriesRef.current?.lastElementChild as HTMLElement | null;
      if (lastEl) settleEntry(lastEl);
    }
    prevEntryCount.current = entries.length;
  }, [entries.length]);

  return (
    <section className="manuscript" id="manuscript" aria-label="Dossier entries">
      <div className="entries" id="entries" ref={entriesRef}>
        {entries.map((entry) => {
          if (entry.kind === 'blank') {
            return (
              <article key={entry.id} className="entry">
                <div className="blank">
                  <div className="blank-orn" aria-hidden="true">
                    ¶
                  </div>
                  <h2>This dossier is blank.</h2>
                  <p>
                    Append your first query below. Whatever is asked here stays here —{' '}
                    <strong>separate dossiers never share context</strong> — and every answer
                    arrives with its evidence in the margin.
                  </p>
                </div>
              </article>
            );
          }

          if (entry.kind === 'query') {
            return (
              <article key={entry.id} className="entry">
                <div className="e-kick">
                  <span className="sc kick">
                    Query — {entry.queryMeta?.time || 'Just now'}
                  </span>
                  <span className="stamp e-meta">
                    {[
                      entry.queryMeta?.modeLabel && `as ${entry.queryMeta.modeLabel}`,
                      entry.queryMeta?.hasContext && 'with product context',
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </span>
                </div>
                <h3 className="e-q">{entry.queryText}</h3>
              </article>
            );
          }

          if (entry.kind === 'insufficient' || entry.kind === 'notice') {
            const not = entry.noticeData;
            return (
              <article key={entry.id} className="entry">
                <div className="not cf">
                  {not?.kick && <p className="sc kick not-kick">{not.kick}</p>}
                  {not?.paragraphs.map((p, pIdx) => (
                    // App-authored or model-generated PLAIN TEXT only — never raw HTML.
                    <p key={pIdx}>
                      <RichText text={p} />
                    </p>
                  ))}
                  {not?.suggestions && not.suggestions.length > 0 && (
                    <>
                      <p className="sc" style={{ color: 'var(--faint)' }}>
                        Narrow it
                      </p>
                      <div className="not-sugg">
                        {not.suggestions.map((sug, sIdx) => (
                          <button
                            key={sIdx}
                            type="button"
                            className="try-q"
                            onClick={() => onPrefillQuery(sug)}
                          >
                            “{sug}”
                          </button>
                        ))}
                      </div>
                    </>
                  )}
                  {not?.action && (
                    <div className="not-act">
                      <button
                        type="button"
                        className="tbtn"
                        onClick={() => {
                          if (not.action?.actionKey === 'retry') onRetryLast();
                          else if (not.action?.actionKey === 'prefill')
                            onPrefillQuery(not.action?.prefill || '');
                        }}
                      >
                        {not.action.label}
                      </button>
                    </div>
                  )}
                  {not?.stamp && <span className="stamp">{not.stamp}</span>}

                  {entry.artifact && (
                    <PlateAside
                      artifact={entry.artifact}
                      plateNumber="I"
                      onExamine={() => onExaminePlate(entry.artifact!.id)}
                    />
                  )}
                </div>
              </article>
            );
          }

          if (entry.kind === 'answer' && entry.answerData) {
            const ans = entry.answerData;
            return (
              <article key={entry.id} className="entry">
                <div className="a-body cf">
                  {/* Lead paragraph */}
                  {ans.lead && (
                    <p className="a-lead">
                      <RichText text={ans.lead} citations={entry.citations} />
                    </p>
                  )}

                  {/* Section paragraphs */}
                  {ans.sections.map((sec, sIdx) => {
                    return (
                      <React.Fragment key={sIdx}>
                        {sec.h && (
                          <div className="a-h">
                            <span className="rn">{sec.rn}</span>
                            <span>{sec.h}</span>
                          </div>
                        )}
                        {sec.paragraphs.map((para, pIdx) => (
                          <p key={pIdx}>
                            <RichText text={para} citations={entry.citations} />
                          </p>
                        ))}
                      </React.Fragment>
                    );
                  })}

                  {/* Where the archive is thin */}
                  {ans.thinNotice && (
                    <div className="thin">
                      <span className="sc kick">Where the archive is thin</span>
                      <p>{ans.thinNotice}</p>
                    </div>
                  )}

                  {/* Margin Apparatus Sidenotes */}
                  {entry.citations?.map((cit) => (
                    <SideNote key={cit.id} citation={cit} />
                  ))}

                  {/* Margin Plate if present */}
                  {entry.artifact && (
                    <PlateAside
                      artifact={entry.artifact}
                      plateNumber="I"
                      onExamine={() => onExaminePlate(entry.artifact!.id)}
                    />
                  )}
                </div>

                <footer className="a-foot">
                  <span className="stamp">{ans.stamp}</span>
                  <button
                    type="button"
                    className="tbtn"
                    onClick={onOpenBrief}
                  >
                    Bind to a growth brief →
                  </button>
                  <button
                    type="button"
                    className="tbtn"
                    onClick={() =>
                      onSetEssay(
                        'Write a Ship 30-style essay (~1,250 words) arguing that activation improves when you narrow the first run to one personally meaningful outcome. Ground every claim in this session’s sources.'
                      )
                    }
                  >
                    Set as an essay →
                  </button>
                </footer>
              </article>
            );
          }

          return null;
        })}

        {/* Live composing step state */}
        {isComposing && (
          <article className="entry">
            <div className="composing" role="status">
              <div className="comp-head">
                <span className="sc kick">Composing</span>
                <button type="button" className="strike" onClick={onStrikeRun}>
                  strike this run
                </button>
              </div>
              <ol className="steps">
                {composingSteps.map((step, sIdx) => (
                  <li key={sIdx} className={`st ${step.status}`}>
                    <span className="st-m">
                      {step.status === 'done' && (
                        <svg
                          className="icon"
                          style={{
                            width: '12px',
                            height: '12px',
                            color: 'var(--success)',
                          }}
                          aria-hidden="true"
                          viewBox="0 0 24 24"
                        >
                          <path d="M20 6 9 17l-5-5" />
                        </svg>
                      )}
                    </span>
                    <span className="st-l">{step.label}</span>
                    <span className="st-dots" />
                    <span className="st-d">{step.detail}</span>
                  </li>
                ))}
              </ol>
              <p className="stamp comp-stamp">{composingStamp}</p>
            </div>
          </article>
        )}
      </div>

      <div className="endmark" id="endmark">
        <svg aria-hidden="true" viewBox="0 0 12 12">
          <path d="M6 0 12 6 6 12 0 6Z" />
        </svg>
        <span className="stamp">
          End of folio — everything above is bound to this session
        </span>
      </div>
    </section>
  );
};
