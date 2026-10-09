import React, { useRef, useEffect } from 'react';
import { GrowthBriefData } from '../types';

interface GrowthBriefModalProps {
  isOpen: boolean;
  onClose: () => void;
  brief: GrowthBriefData;
  onSaveImpression: () => void;
  onJumpToCitation: (refIndex: number) => void;
  onSetEssay: () => void;
  onCastPlate: () => void;
}

const getOrdinalImpression = (n: number) => {
  const ordinals = ['First', 'Second', 'Third', 'Fourth', 'Fifth'];
  return ordinals[n - 1] || `${n}th`;
};

export const GrowthBriefModal: React.FC<GrowthBriefModalProps> = ({
  isOpen,
  onClose,
  brief,
  onSaveImpression,
  onJumpToCitation,
  onSetEssay,
  onCastPlate,
}) => {
  const modalRef = useRef<HTMLDivElement>(null);
  const returnBtnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (isOpen && returnBtnRef.current) {
      returnBtnRef.current.focus();
    }
  }, [isOpen]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isOpen) return;
      if (e.key === 'Escape') {
        onClose();
        return;
      }
      if (e.key === 'Tab' && modalRef.current) {
        const focusable = Array.from(
          modalRef.current.querySelectorAll<HTMLElement>(
            'button, [contenteditable="true"], input, textarea, a[href]'
          )
        ).filter((el) => el.offsetParent !== null);

        if (focusable.length === 0) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];

        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      ref={modalRef}
      className="fold open"
      id="fold"
      role="dialog"
      aria-modal="true"
      aria-labelledby="foldH"
      aria-hidden={!isOpen}
    >
      <header className="fold-bar">
        <button
          ref={returnBtnRef}
          type="button"
          className="tbtn"
          id="foldBack"
          onClick={onClose}
        >
          ← Return to the dossier
        </button>
        <span className="fold-spacer" />
        <span className="imp-chip" id="impChip">
          {getOrdinalImpression(brief.impressionsCount)} impression
        </span>
        <button
          type="button"
          className="tbtn solid"
          id="foldSave"
          onClick={onSaveImpression}
        >
          Bind impression
        </button>
      </header>

      <div className="fold-doc">
        <p className="sc kick">Kestrel · Growth Brief</p>
        <h1 id="foldH">{brief.title}</h1>
        <p className="fold-sub">{brief.sub}</p>
        <p className="stamp fold-meta" id="foldMeta">
          Drafted from query 1 · 4 passages cited · editable draft
        </p>

        {/* Section I: Problem */}
        <section className="fs">
          <div className="fs-num">I.</div>
          <div>
            <h2>
              Problem <span className="plabel">User context</span>
            </h2>
            <div
              className="ed"
              contentEditable
              suppressContentEditableWarning
              spellCheck="false"
            >
              {brief.sections[0]?.content ||
                'Flowstate is a seed-stage B2B task manager with self-serve sign-up — roughly 400 trials a month. Sign-ups are steady, but only about 23% of new workspaces complete a first project within seven days, and week-4 retention tracks that first project almost perfectly. Goal: raise week-one activation without degrading retention or support load.'}
            </div>
          </div>
        </section>

        {/* Section II: Research & evidence */}
        <section className="fs">
          <div className="fs-num">II.</div>
          <div>
            <h2>
              Research &amp; evidence <span className="plabel ev">Transcript evidence</span>
            </h2>
            <ul className="fs-ev">
              {brief.sections[1]?.evidenceItems?.map((item) => (
                <li key={item.refIndex}>
                  {item.text}
                  <button
                    type="button"
                    className="fref"
                    data-n={item.refIndex}
                    aria-label={`Show margin note ${item.refIndex}`}
                    onClick={() => {
                      onClose();
                      onJumpToCitation(item.refIndex);
                    }}
                  >
                    {item.refIndex}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* Section III: Recommendation */}
        <section className="fs">
          <div className="fs-num">III.</div>
          <div>
            <h2>
              Recommendation <span className="plabel sy">Assistant synthesis</span>
            </h2>
            <div
              className="ed"
              contentEditable
              suppressContentEditableWarning
              spellCheck="false"
            >
              {brief.sections[2]?.content ||
                'Rebuild first-run around a single outcome — a real first project completed in the first session — by replacing the setup checklist with a guided template gallery, and instrument time-to-first-project as the activation metric. Watch the retention curve by cohort; any loss of flattening is a stop signal.'}
            </div>
            <p className="fs-note" style={{ marginTop: '14px' }}>
              Assumptions &amp; limitations
            </p>
            <div
              className="ed"
              contentEditable
              suppressContentEditableWarning
              spellCheck="false"
            >
              {brief.sections[2]?.assumptions ||
                'Assumes templates meaningfully cut blank-page time, and that the signup-to-first-project drop is exploration friction rather than weak intent. The archive offers expert pattern, not causal proof for this product — see the experiment below.'}
            </div>
          </div>
        </section>

        {/* Section IV: Experiment */}
        <section className="fs">
          <div className="fs-num">IV.</div>
          <div>
            <h2>Experiment</h2>
            <dl>
              <div className="frow">
                <dt>Hypothesis</dt>
                <dd>
                  <div
                    className="ed"
                    contentEditable
                    suppressContentEditableWarning
                    spellCheck="false"
                  >
                    New workspaces that start from a guided template complete a first project
                    within 7 days more often than those given a blank canvas.
                  </div>
                </dd>
              </div>
              <div className="frow">
                <dt>Change</dt>
                <dd>
                  <div
                    className="ed"
                    contentEditable
                    suppressContentEditableWarning
                    spellCheck="false"
                  >
                    Replace the post-signup checklist with a template gallery step; defer all other
                    setup until the first project exists.
                  </div>
                </dd>
              </div>
              <div className="frow">
                <dt>Audience</dt>
                <dd>
                  <div
                    className="ed"
                    contentEditable
                    suppressContentEditableWarning
                    spellCheck="false"
                  >
                    New self-serve workspaces, 50 / 50 split, two weeks of signups.
                  </div>
                </dd>
              </div>
              <div className="frow">
                <dt>Primary metric</dt>
                <dd>
                  <div
                    className="ed"
                    contentEditable
                    suppressContentEditableWarning
                    spellCheck="false"
                  >
                    % of new workspaces completing a first project within 7 days — baseline ≈ 23%
                    (user-supplied).
                  </div>
                </dd>
              </div>
              <div className="frow">
                <dt>Guardrails</dt>
                <dd>
                  <div
                    className="ed"
                    contentEditable
                    suppressContentEditableWarning
                    spellCheck="false"
                  >
                    Week-4 retention by cohort · support contacts per signup.
                  </div>
                </dd>
              </div>
              <div className="frow">
                <dt>Decision rule</dt>
                <dd>
                  <div
                    className="ed"
                    contentEditable
                    suppressContentEditableWarning
                    spellCheck="false"
                  >
                    Ship at ≥ +5 points absolute with no guardrail regression; iterate between 0
                    and 5; revert if retention drops.
                  </div>
                </dd>
              </div>
            </dl>
          </div>
        </section>

        {/* Section V: Next deliverable */}
        <section className="fs">
          <div className="fs-num">V.</div>
          <div>
            <h2>Next deliverable</h2>
            <p className="fs-note">
              Whatever you set next inherits this brief’s citations — nothing carries over
              unsourced.
            </p>
            <div className="fs-acts">
              <button
                type="button"
                className="tbtn solid"
                id="foldEssay"
                onClick={() => {
                  onClose();
                  onSetEssay();
                }}
              >
                Set as essay →
              </button>
              <button
                type="button"
                className="tbtn"
                id="foldPlate"
                onClick={() => {
                  onClose();
                  onCastPlate();
                }}
              >
                Cast a plate →
              </button>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
};
