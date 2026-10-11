import React, { useRef, useEffect, useState, useCallback } from 'react';
import { GrowthBriefData } from '../types';
import { stampPress, prefersReducedMotion } from '../lib/motion';
import { useFocusTrap } from '../lib/useFocusTrap';

interface GrowthBriefModalProps {
  isOpen: boolean;
  onClose: () => void;
  brief: GrowthBriefData;
  /** Receives the locally-edited draft; the caller persists it with
   *  expected_version and handles 200 vs 409. */
  onSaveImpression: (draft: GrowthBriefData) => void | Promise<void>;
  onSetEssay: () => void;
  onCastPlate: () => void;
}

const getOrdinalImpression = (n: number) => {
  const ordinals = ['First', 'Second', 'Third', 'Fourth', 'Fifth', 'Sixth', 'Seventh'];
  return ordinals[n - 1] || `${n}th`;
};

/**
 * Editable block with real two-way binding. React never re-renders the
 * contentEditable children while the user types: external values are pushed
 * into the DOM imperatively only when they genuinely differ from the current
 * text, so the caret position survives every keystroke.
 */
const EdBlock: React.FC<{
  value: string;
  onInput: (next: string) => void;
  ariaLabel: string;
}> = ({ value, onInput, ariaLabel }) => {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (ref.current && ref.current.textContent !== value) {
      ref.current.textContent = value;
    }
  }, [value]);

  return (
    <div
      ref={ref}
      className="ed"
      contentEditable
      role="textbox"
      aria-multiline="true"
      aria-label={ariaLabel}
      tabIndex={0}
      suppressContentEditableWarning
      spellCheck={false}
      onInput={(e) => onInput(e.currentTarget.textContent || '')}
    />
  );
};

export const GrowthBriefModal: React.FC<GrowthBriefModalProps> = ({
  isOpen,
  onClose,
  brief,
  onSaveImpression,
  onSetEssay,
  onCastPlate,
}) => {
  const modalRef = useRef<HTMLDivElement>(null);
  const returnBtnRef = useRef<HTMLButtonElement>(null);
  // Local draft: the two-way binding source of truth. Synced from the brief
  // prop whenever a different brief (or a freshly saved version) arrives.
  const [draft, setDraft] = useState<GrowthBriefData>(brief);

  const [isClosing, setIsClosing] = useState(false);

  useEffect(() => {
    setDraft(brief);
  }, [brief.id, brief.version, brief.updatedAt]);

  const requestClose = useCallback(() => {
    if (prefersReducedMotion() || isClosing) {
      onClose();
      return;
    }
    setIsClosing(true);
    setTimeout(() => {
      setIsClosing(false);
      onClose();
    }, 320);
  }, [onClose, isClosing]);

  useFocusTrap(modalRef, isOpen, requestClose);

  if (!isOpen && !isClosing) return null;

  const set = <K extends keyof GrowthBriefData>(key: K, value: GrowthBriefData[K]) => {
    setDraft((prev) => ({ ...prev, [key]: value }));
  };
  const setExperiment = (key: keyof GrowthBriefData['experiment'], value: string) => {
    setDraft((prev) => ({ ...prev, experiment: { ...prev.experiment, [key]: value } }));
  };

  const handleBackdropClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === modalRef.current) {
      requestClose();
    }
  };

  return (
    <div
      ref={modalRef}
      className={`fold open${isClosing ? ' closing' : ''}`}
      id="fold"
      role="dialog"
      aria-modal="true"
      aria-labelledby="foldH"
      aria-hidden={!isOpen}
      onClick={handleBackdropClick}
    >
      <div className="fold-doc-wrap">
        <header className="fold-bar">
          <button
            ref={returnBtnRef}
            type="button"
            className="tbtn"
            id="foldBack"
            onClick={requestClose}
          >
            ← Return to the dossier
          </button>
          <span className="fold-spacer" />
          <span className="imp-chip" id="impChip">
            {brief.isDemo ? 'design tour' : `${getOrdinalImpression(brief.version)} impression`}
          </span>
          <button
            type="button"
            className="tbtn solid"
            id="foldSave"
            onClick={(e) => {
              stampPress(e.currentTarget);
              onSaveImpression(draft);
            }}
          >
            Bind impression
          </button>
        </header>

        <div className="fold-doc">
        <p className="sc kick"><span className="kestrel-brand-wordmark">Kestrel</span> · Growth Brief</p>
        <h1 id="foldH">{draft.title}</h1>
        <p className="fold-sub">
          A structured deliverable drafted from the dossier’s research — sections are editable,
          so click any paragraph and revise it.
        </p>
        <p className="stamp fold-meta" id="foldMeta">
          {brief.isDemo
            ? 'design tour fixture · not persisted'
            : `Version ${draft.version} · ${draft.status} · editable draft`}
        </p>

        {/* Section I: Problem */}
        <section className="fs">
          <div className="fs-num">I.</div>
          <div>
            <h2>
              Problem <span className="plabel">User context</span>
            </h2>
            <EdBlock
              value={draft.problem}
              ariaLabel="Problem statement"
              onInput={(v) => set('problem', v)}
            />
          </div>
        </section>

        {/* Section II: Research & evidence */}
        <section className="fs">
          <div className="fs-num">II.</div>
          <div>
            <h2>
              Research & evidence <span className="plabel ev">Transcript evidence</span>
            </h2>
            <EdBlock
              value={draft.researchSummary}
              ariaLabel="Research summary"
              onInput={(v) => set('researchSummary', v)}
            />
          </div>
        </section>

        {/* Section III: Recommendation + assumptions */}
        <section className="fs">
          <div className="fs-num">III.</div>
          <div>
            <h2>
              Recommendation <span className="plabel sy">Assistant synthesis</span>
            </h2>
            <EdBlock
              value={draft.recommendation}
              ariaLabel="Recommendation"
              onInput={(v) => set('recommendation', v)}
            />
            <p className="fs-note" style={{ marginTop: '14px' }}>
              Assumptions & limitations
            </p>
            <EdBlock
              value={draft.assumptions}
              ariaLabel="Assumptions and limitations"
              onInput={(v) => set('assumptions', v)}
            />
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
                  <EdBlock
                    value={draft.experiment.hypothesis}
                    ariaLabel="Experiment hypothesis"
                    onInput={(v) => setExperiment('hypothesis', v)}
                  />
                </dd>
              </div>
              <div className="frow">
                <dt>Change</dt>
                <dd>
                  <EdBlock
                    value={draft.experiment.change}
                    ariaLabel="Proposed change"
                    onInput={(v) => setExperiment('change', v)}
                  />
                </dd>
              </div>
              <div className="frow">
                <dt>Audience</dt>
                <dd>
                  <EdBlock
                    value={draft.experiment.segment}
                    ariaLabel="Experiment audience"
                    onInput={(v) => setExperiment('segment', v)}
                  />
                </dd>
              </div>
              <div className="frow">
                <dt>Primary metric</dt>
                <dd>
                  <EdBlock
                    value={draft.experiment.success_metric}
                    ariaLabel="Primary success metric"
                    onInput={(v) => setExperiment('success_metric', v)}
                  />
                </dd>
              </div>
              <div className="frow">
                <dt>Guardrails</dt>
                <dd>
                  <EdBlock
                    value={draft.experiment.guardrail_metric}
                    ariaLabel="Guardrail metrics"
                    onInput={(v) => setExperiment('guardrail_metric', v)}
                  />
                </dd>
              </div>
              <div className="frow">
                <dt>Decision rule</dt>
                <dd>
                  <EdBlock
                    value={draft.experiment.decision_rule}
                    ariaLabel="Decision rule"
                    onInput={(v) => setExperiment('decision_rule', v)}
                  />
                </dd>
              </div>
            </dl>
          </div>
        </section>

        {/* Section V: Risks & next deliverable */}
        <section className="fs">
          <div className="fs-num">V.</div>
          <div>
            <h2>Risks & next deliverable</h2>
            <p className="fs-note">Risks — one per line</p>
            <EdBlock
              value={draft.risks}
              ariaLabel="Risks, one per line"
              onInput={(v) => set('risks', v)}
            />
            <p className="fs-note" style={{ marginTop: '14px' }}>
              Next deliverable
            </p>
            <EdBlock
              value={draft.nextDeliverable}
              ariaLabel="Next deliverable"
              onInput={(v) => set('nextDeliverable', v)}
            />
            <p className="fs-note" style={{ marginTop: '14px' }}>
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
  </div>
  );
};
