import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  AppView,
  ArtifactData,
  ComposeMode,
  ArtifactKind,
  ComposingStep,
  ManuscriptEntry,
  ProviderConfig,
  ProviderId,
  SessionData,
  ToastMessage,
} from './types';
import { api } from './lib/api';
import {
  INITIAL_SESSIONS,
  INITIAL_ARTIFACTS,
  INITIAL_GROWTH_BRIEF,
  CITATION_LIBRARY,
} from './lib/demoData';
import { RunningHead } from './components/RunningHead';
import { IndexRail } from './components/IndexRail';
import { Frontmatter } from './components/Frontmatter';
import { Manuscript } from './components/Manuscript';
import { ComposerBar } from './components/ComposerBar';
import { GrowthBriefModal } from './components/GrowthBriefModal';
import { PlateViewerModal } from './components/PlateViewerModal';
import { LeaderLines } from './components/LeaderLines';
import { Toasts } from './components/Toasts';
import { StatesTray, StateKey } from './components/StatesTray';

const COMPOSING_STAGES: Record<ComposeMode, Array<[string, string]>> = {
  research: [
    ['consulting the archive', 'semantic + keyword · 8 passages weighed'],
    ['drafting the entry', 'grounded in retrieved passages only'],
    ['verifying citations', 'each claim checked to its source'],
    ['binding to the session', ''],
  ],
  growth_brief: [
    ['consulting the archive', 'semantic + keyword · 8 passages weighed'],
    ['composing the brief', 'five sections — evidence kept apart from synthesis'],
    ['verifying citations', 'each claim checked to its source'],
    ['binding the draft', ''],
  ],
  essay: [
    ['consulting the archive', 'semantic + keyword · 8 passages weighed'],
    ['outlining · ship 30 skill', 'hook · structure · takeaway'],
    ['drafting the essay', '≈ 1,250 words · claims grounded'],
    ['verifying citations', 'each claim checked to its source'],
  ],
  artifact: [
    ['consulting the archive', 'semantic + keyword · 8 passages weighed'],
    ['casting the plate', 'structured document from evidence'],
    ['checking the frame', 'sandboxed — scripts, forms, network blocked'],
    ['filing the plate', 'first impression'],
  ],
};

export const App: React.FC = () => {
  const [view, setView] = useState<AppView>('frontmatter');
  const [sessions, setSessions] = useState<SessionData[]>(Object.values(INITIAL_SESSIONS));
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [activeProvider, setActiveProvider] = useState<ProviderId>('local');
  const [providers, setProviders] = useState<ProviderConfig[]>([]);

  // Modals & Panels
  const [isMobileRailOpen, setIsMobileRailOpen] = useState(false);
  const [isBriefOpen, setIsBriefOpen] = useState(false);
  const [isPlateOpen, setIsPlateOpen] = useState(false);
  const [activeArtifact, setActiveArtifact] = useState<ArtifactData | null>(null);

  // Composing Run State
  const [isComposing, setIsComposing] = useState(false);
  const [activeMode, setActiveMode] = useState<ComposeMode>('research');
  const [composingSteps, setComposingSteps] = useState<ComposingStep[]>([]);
  const composeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Toasts & Announcements
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const [announcement, setAnnouncement] = useState('');

  // Refs
  const sheetRef = useRef<HTMLElement>(null);

  const activeSession = sessions.find((s) => s.id === activeSessionId) || null;

  const showToast = useCallback((message: string) => {
    const id = 'toast-' + Date.now() + '-' + Math.random().toString(36).slice(2, 5);
    setToasts((prev) => [...prev, { id, message }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 2800);
  }, []);

  const announce = useCallback((msg: string) => {
    setAnnouncement(msg);
  }, []);

  // Initialize Providers & Backend Health
  useEffect(() => {
    api.getProviders().then(setProviders);
    api.getConfig().then((cfg) => {
      if (cfg) {
        // Backend live
      }
    });
  }, []);

  // Global Keyboard Navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsBriefOpen(false);
        setIsPlateOpen(false);
        setIsMobileRailOpen(false);
        return;
      }

      if (e.key === '/' && !e.ctrlKey && !e.metaKey) {
        const target = e.target as HTMLElement;
        if (target.matches('input, textarea, [contenteditable="true"]')) return;
        e.preventDefault();
        const ta =
          view === 'frontmatter'
            ? document.querySelector<HTMLTextAreaElement>('#fmTa')
            : document.querySelector<HTMLTextAreaElement>('#ckTa');
        if (ta) ta.focus();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [view]);

  // Session Switching
  const handleSelectSession = useCallback((sessionId: string) => {
    if (isComposing) {
      showToast('Composing — strike the run first');
      return;
    }
    setActiveSessionId(sessionId);
    setView('manuscript');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [isComposing, showToast]);

  const handleNewDossier = useCallback(() => {
    if (isComposing) {
      showToast('Composing — strike the run first');
      return;
    }
    setActiveSessionId(null);
    setView('frontmatter');
    const ta = document.querySelector<HTMLTextAreaElement>('#fmTa');
    if (ta) ta.focus();
  }, [isComposing, showToast]);

  const handleTitleChange = useCallback(
    (newTitle: string) => {
      if (!activeSessionId) return;
      setSessions((prev) =>
        prev.map((s) => (s.id === activeSessionId ? { ...s, title: newTitle } : s))
      );
      api.updateSessionTitle(activeSessionId, newTitle);
      showToast('Dossier retitled');
    },
    [activeSessionId, showToast]
  );

  const handleProviderChange = useCallback(
    (newProv: ProviderId) => {
      setActiveProvider(newProv);
      const provObj = providers.find((p) => p.id === newProv);
      showToast(`Provider set to ${provObj?.name.toLowerCase()} — ${provObj?.model}`);
      announce(`Provider set to ${provObj?.name}.`);
    },
    [providers, showToast, announce]
  );

  // Delivery Logic for Different Modes
  const deliverResult = useCallback(
    (session: SessionData, text: string, mode: ComposeMode, format: ArtifactKind) => {
      const isBenchmark = /benchmark|industry average|typical (rate|conversion)|average (rate|conversion)|statistic/i.test(
        text
      );

      if (isBenchmark) {
        const noticeEntry: ManuscriptEntry = {
          id: 'not-' + Date.now(),
          kind: 'insufficient',
          noticeData: {
            kick: 'Not in the archive',
            paragraphs: [
              'I searched the episode index for product-led-growth benchmark conversion rates, and the archive can’t support a reliable answer. Guests rarely publish comparable numbers, and benchmarks vary too much by segment and definition to quote blindly — I’d rather show you the gap than invent a figure.',
            ],
            suggestions: [
              'How do guests define “good” activation for self-serve B2B?',
              'What retention curve shape do guests look for before scaling acquisition?',
            ],
            stamp: '0 citations · the question outran the evidence',
          },
          createdAt: new Date().toISOString(),
        };

        setSessions((prev) =>
          prev.map((s) =>
            s.id === session.id
              ? { ...s, entries: [...s.entries, noticeEntry], meta: 'query · 0 notes' }
              : s
          )
        );
        announce('Not enough evidence in the archive.');
        return;
      }

      if (mode === 'growth_brief') {
        setIsBriefOpen(true);
        showToast('Growth brief drafted — first impression');
        announce('Growth brief composed.');
        return;
      }

      if (mode === 'artifact') {
        const artId = format === 'html' ? 'a1' : 'a2';
        const art = INITIAL_ARTIFACTS[artId];
        const nextPlateSeq = session.plateSeq + 1;

        const plateEntry: ManuscriptEntry = {
          id: 'plate-entry-' + Date.now(),
          kind: 'notice',
          noticeData: {
            kick: 'Plate filed',
            paragraphs: [
              `<strong>${art.title}</strong> is filed in the margin at right — v1, first impression. It’s examined in a sandboxed frame: scripts, forms and network are blocked, and the original source stays one click away.`,
            ],
            stamp: `${art.file} · sandboxed preview · first impression`,
          },
          artifact: art,
          createdAt: new Date().toISOString(),
        };

        setSessions((prev) =>
          prev.map((s) =>
            s.id === session.id
              ? {
                  ...s,
                  plateSeq: nextPlateSeq,
                  entries: [...s.entries, plateEntry],
                  artifacts: [...s.artifacts, art],
                }
              : s
          )
        );
        setActiveArtifact(art);
        setIsPlateOpen(true);
        showToast('Plate filed — v1 · sandboxed frame');
        announce('Plate filed and open for examination.');
        return;
      }

      // Default: Research Answer with 4 Verified Citations
      const answerEntry: ManuscriptEntry = {
        id: 'ans-' + Date.now(),
        kind: 'answer',
        answerData: {
          lead:
            'The pattern across the interviews is consistent: activation gains that hold up come from narrowing the first run — carrying a new user to one personally meaningful outcome, faster — not from adding steps, tours, or pressure. Retention follows the value, not the funnel.',
          sections: [
            {
              rn: 'I',
              h: 'Find the moment worth speeding toward',
              bodyHtml:
                'Rahul Vohra describes how Superhuman used its product-market-fit survey as a map rather than a score: profile the users who would be “very disappointed” without the product, find what they were actually doing when delight happened, then rebuild onboarding so every new user reaches that same moment sooner. The activation metric that falls out is time-to-that-behavior — not steps completed.',
              citedRefIndices: [1],
            },
            {
              rn: 'II',
              h: 'Read the retention curve before touching the funnel',
              bodyHtml:
                'Casey Winters is blunt about sequencing: retention is the core of growth, and a curve that never flattens means acquisition is filling a leaking bucket. Before shipping onboarding changes, find which cohorts flatten, where the drop concentrates, and whether the users you are activating are the ones who stay.',
              citedRefIndices: [2],
            },
            {
              rn: 'III',
              h: 'Make the first outcome the user’s own',
              bodyHtml:
                'Duolingo’s turnaround focused on the habit itself — a first lesson that is fast and calibrated to the learner, wrapped in a streak the learner owns. The lesson transfers: define activation as the user’s first real success — a project created, a first aha — not a checklist the product imposes.',
              citedRefIndices: [3],
            },
            {
              rn: 'IV',
              h: 'In self-serve B2B, activation is the expansion engine',
              bodyHtml:
                'Elena Verna’s framing for product-led growth: the product is the funnel. Users who reach value expand their own accounts, and sales follows usage signals instead of cold outreach. That only compounds when “activated” means reached-value — not “invited five teammates.”',
              citedRefIndices: [4],
            },
          ],
          thinNotice:
            'Guests rarely share controlled experiments that pit an activation change directly against retention. Treat the pattern above as strong expert consensus, not causal proof — and keep a retention guardrail on whatever you test.',
          stamp: `Set in ${providers.find((p) => p.id === activeProvider)?.model || 'qwen2.5:1.5b'} · ${activeProvider} — 4 citations verified`,
        },
        citations: [
          { id: `sn-${session.id}-1`, refIndex: 1, ...CITATION_LIBRARY.vohra },
          { id: `sn-${session.id}-2`, refIndex: 2, ...CITATION_LIBRARY.winters },
          { id: `sn-${session.id}-3`, refIndex: 3, ...CITATION_LIBRARY.mazal },
          { id: `sn-${session.id}-4`, refIndex: 4, ...CITATION_LIBRARY.verna },
        ],
        createdAt: new Date().toISOString(),
      };

      setSessions((prev) =>
        prev.map((s) =>
          s.id === session.id
            ? {
                ...s,
                entries: [...s.entries, answerEntry],
                meta: 'query · 4 notes',
                noteSeq: s.noteSeq + 4,
              }
            : s
        )
      );

      announce('Entry bound — four passages cited in the margin.');
      showToast('Entry bound — 4 citations verified in the margin');
      setTimeout(() => {
        window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
      }, 100);
    },
    [activeProvider, providers, showToast, announce]
  );

  // Run Composing Pipeline
  const runComposingPipeline = useCallback(
    (session: SessionData, text: string, mode: ComposeMode, format: ArtifactKind) => {
      setIsComposing(true);
      const stageDefs = COMPOSING_STAGES[mode] || COMPOSING_STAGES.research;

      const initialSteps: ComposingStep[] = stageDefs.map((def, idx) => ({
        label: def[0],
        detail: def[1],
        status: idx === 0 ? 'run' : 'wait',
      }));
      setComposingSteps(initialSteps);
      announce(stageDefs[0][0]);

      let stepIndex = 0;
      const stepDuration = 600;

      const advance = () => {
        stepIndex++;
        if (stepIndex >= stageDefs.length) {
          setComposingSteps((prev) =>
            prev.map((step) => ({ ...step, status: 'done' }))
          );
          composeTimerRef.current = setTimeout(() => {
            setIsComposing(false);
            deliverResult(session, text, mode, format);
          }, 350);
          return;
        }

        setComposingSteps((prev) =>
          prev.map((step, idx) => ({
            ...step,
            status: idx < stepIndex ? 'done' : idx === stepIndex ? 'run' : 'wait',
          }))
        );
        announce(stageDefs[stepIndex][0]);
        composeTimerRef.current = setTimeout(advance, stepDuration);
      };

      composeTimerRef.current = setTimeout(advance, stepDuration);
    },
    [announce, deliverResult]
  );

  const handleStrikeRun = useCallback(() => {
    if (composeTimerRef.current) {
      clearTimeout(composeTimerRef.current);
    }
    setIsComposing(false);

    if (activeSessionId) {
      const struckNotice: ManuscriptEntry = {
        id: 'struck-' + Date.now(),
        kind: 'insufficient',
        noticeData: {
          kick: 'Run struck',
          paragraphs: [
            'Nothing was bound to this session — the partial draft was discarded, and no citation was recorded.',
          ],
          action: {
            label: 'Recompose →',
            actionKey: 'retry',
          },
          stamp: 'struck by the reader · nothing persisted',
        },
        createdAt: new Date().toISOString(),
      };

      setSessions((prev) =>
        prev.map((s) =>
          s.id === activeSessionId ? { ...s, entries: [...s.entries, struckNotice] } : s
        )
      );
    }

    announce('Run struck — nothing was persisted.');
    showToast('Run struck — nothing was persisted');
  }, [activeSessionId, announce, showToast]);

  // Submit Prompt from Frontmatter or ComposerBar
  const handleSubmitQuery = useCallback(
    (
      text: string,
      mode: ComposeMode,
      format: ArtifactKind,
      productContext?: string
    ) => {
      let currentSession = activeSession;
      if (!currentSession) {
        // Create new session
        const titleSnippet = text.length > 50 ? `${text.slice(0, 48)}…` : text;
        const newSess: SessionData = {
          id: 'live-' + Date.now(),
          num: String(sessions.length + 1).padStart(2, '0'),
          title: titleSnippet,
          meta: 'query · new',
          kind: 'live',
          entries: [],
          artifacts: [],
          briefCount: 0,
          noteSeq: 0,
          plateSeq: 0,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        currentSession = newSess;
        setSessions((prev) => [newSess, ...prev]);
        setActiveSessionId(newSess.id);
        setView('manuscript');
      }

      // Add query entry
      const queryEntry: ManuscriptEntry = {
        id: 'q-' + Date.now(),
        kind: 'query',
        queryText: text,
        queryMeta: {
          time: new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }),
          modeLabel: mode === 'research' ? 'Query' : mode === 'growth_brief' ? 'Brief' : mode === 'essay' ? 'Essay' : 'Plate',
          hasContext: !!productContext,
        },
        createdAt: new Date().toISOString(),
      };

      setSessions((prev) =>
        prev.map((s) =>
          s.id === currentSession!.id ? { ...s, entries: [...s.entries, queryEntry] } : s
        )
      );

      // Scroll to bottom
      setTimeout(() => {
        window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
      }, 50);

      runComposingPipeline(currentSession, text, mode, format);
    },
    [activeSession, sessions.length, runComposingPipeline]
  );

  // States Tray Handler
  const handleSelectState = useCallback(
    (stateKey: StateKey) => {
      setIsBriefOpen(false);
      setIsPlateOpen(false);

      switch (stateKey) {
        case 'hero':
          handleNewDossier();
          showToast('State: Frontmatter (New Dossier)');
          break;

        case 'activation': {
          let actSession = sessions.find((s) => s.id === 'live-act');
          if (!actSession) {
            actSession = {
              id: 'live-act',
              num: '01',
              title: 'Improving activation without hurting retention',
              meta: 'query · 4 notes',
              kind: 'live',
              entries: [
                {
                  id: 'q-act',
                  kind: 'query',
                  queryText:
                    'How can an early-stage SaaS improve activation without hurting retention?',
                  queryMeta: {
                    time: 'Today · 2:15 PM',
                    modeLabel: 'Query',
                    hasContext: true,
                  },
                  createdAt: new Date().toISOString(),
                },
                {
                  id: 'ans-act',
                  kind: 'answer',
                  answerData: {
                    lead:
                      'The pattern across the interviews is consistent: activation gains that hold up come from narrowing the first run — carrying a new user to one personally meaningful outcome, faster — not from adding steps, tours, or pressure. Retention follows the value, not the funnel.',
                    sections: [
                      {
                        rn: 'I',
                        h: 'Find the moment worth speeding toward',
                        bodyHtml:
                          'Rahul Vohra describes how Superhuman used its product-market-fit survey as a map rather than a score: profile the users who would be “very disappointed” without the product, find what they were actually doing when delight happened, then rebuild onboarding so every new user reaches that same moment sooner. The activation metric that falls out is time-to-that-behavior — not steps completed.',
                        citedRefIndices: [1],
                      },
                      {
                        rn: 'II',
                        h: 'Read the retention curve before touching the funnel',
                        bodyHtml:
                          'Casey Winters is blunt about sequencing: retention is the core of growth, and a curve that never flattens means acquisition is filling a leaking bucket. Before shipping onboarding changes, find which cohorts flatten, where the drop concentrates, and whether the users you are activating are the ones who stay.',
                        citedRefIndices: [2],
                      },
                      {
                        rn: 'III',
                        h: 'Make the first outcome the user’s own',
                        bodyHtml:
                          'Duolingo’s turnaround focused on the habit itself — a first lesson that is fast and calibrated to the learner, wrapped in a streak the learner owns. The lesson transfers: define activation as the user’s first real success — a project created, a first aha — not a checklist the product imposes.',
                        citedRefIndices: [3],
                      },
                      {
                        rn: 'IV',
                        h: 'In self-serve B2B, activation is the expansion engine',
                        bodyHtml:
                          'Elena Verna’s framing for product-led growth: the product is the funnel. Users who reach value expand their own accounts, and sales follows usage signals instead of cold outreach. That only compounds when “activated” means reached-value — not “invited five teammates.”',
                        citedRefIndices: [4],
                      },
                    ],
                    thinNotice:
                      'Guests rarely share controlled experiments that pit an activation change directly against retention. Treat the pattern above as strong expert consensus, not causal proof — and guard retention in whatever you test.',
                    stamp: 'Set in qwen2.5:1.5b · local — 4 citations verified',
                  },
                  citations: [
                    { id: 'sn-live-act-1', refIndex: 1, ...CITATION_LIBRARY.vohra },
                    { id: 'sn-live-act-2', refIndex: 2, ...CITATION_LIBRARY.winters },
                    { id: 'sn-live-act-3', refIndex: 3, ...CITATION_LIBRARY.mazal },
                    { id: 'sn-live-act-4', refIndex: 4, ...CITATION_LIBRARY.verna },
                  ],
                  createdAt: new Date().toISOString(),
                },
              ],
              artifacts: [],
              briefCount: 1,
              noteSeq: 4,
              plateSeq: 0,
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            };
            setSessions((prev) => [actSession!, ...prev]);
          }
          setActiveSessionId('live-act');
          setView('manuscript');
          showToast('State: Research Folio with 4 Citations & Leaders');
          break;
        }

        case 'pricing':
          handleSelectSession('pricing');
          showToast('State: Pricing Folio');
          break;

        case 'brief':
          setIsBriefOpen(true);
          showToast('State: Growth Brief ("The Fold")');
          break;

        case 'plate-html':
          setActiveArtifact(INITIAL_ARTIFACTS.a1);
          setIsPlateOpen(true);
          showToast('State: Sandboxed HTML Plate Viewer');
          break;

        case 'plate-md':
          setActiveArtifact(INITIAL_ARTIFACTS.a2);
          setIsPlateOpen(true);
          showToast('State: Sandboxed Markdown Plate Viewer');
          break;

        case 'insufficient':
          handleSubmitQuery(
            'What’s a good benchmark conversion rate for product-led growth companies?',
            'research',
            'markdown'
          );
          showToast('State: Insufficient Evidence Notice');
          break;

        case 'composing':
          handleSubmitQuery(
            'How does Superhuman measure product-market fit delight?',
            'research',
            'markdown'
          );
          showToast('State: Composing 4-Stage Step List');
          break;

        case 'empty':
          handleSelectSession('empty1');
          showToast('State: Blank Dossier Session');
          break;

        case 'colophon':
          document.getElementById('coloBtn')?.click();
          showToast('State: Colophon Provider Inspector');
          break;
      }
    },
    [handleNewDossier, handleSelectSession, handleSubmitQuery, sessions, showToast]
  );

  return (
    <>
      <a className="skip" href="#sheet">
        Skip to the dossier
      </a>
      <div className="grain" aria-hidden="true" />

      {/* Masthead */}
      <RunningHead
        title={activeSession?.title || ''}
        isUntitled={!activeSession}
        onTitleChange={handleTitleChange}
        activeProvider={activeProvider}
        onProviderChange={handleProviderChange}
        providers={providers}
        onOpenMobileMenu={() => setIsMobileRailOpen(true)}
      />

      {/* Book-spine Session Index Rail */}
      <IndexRail
        sessions={sessions}
        activeSessionId={activeSessionId}
        onSelectSession={handleSelectSession}
        onNewDossier={handleNewDossier}
        isMobileOpen={isMobileRailOpen}
        onCloseMobile={() => setIsMobileRailOpen(false)}
      />

      {/* Continuous Manuscript Sheet */}
      <main
        className="sheet"
        id="sheet"
        ref={sheetRef}
        style={{ paddingBottom: view === 'manuscript' ? '170px' : undefined }}
      >
        <LeaderLines sheetRef={sheetRef} />

        <div className="page">
          {view === 'frontmatter' ? (
            <Frontmatter
              onSubmit={handleSubmitQuery}
              isComposing={isComposing}
              onSelectIndexMode={(m, prefill) => {
                setActiveMode(m);
                if (prefill) {
                  handleSubmitQuery(prefill, m, 'markdown');
                } else {
                  const ta = document.querySelector<HTMLTextAreaElement>('#fmTa');
                  if (ta) ta.focus();
                }
              }}
            />
          ) : (
            <Manuscript
              entries={activeSession?.entries || []}
              isComposing={isComposing}
              composingSteps={composingSteps}
              onStrikeRun={handleStrikeRun}
              onOpenBrief={() => setIsBriefOpen(true)}
              onSetEssay={(prompt) => {
                setActiveMode('essay');
                const ta = document.querySelector<HTMLTextAreaElement>('#ckTa');
                if (ta) {
                  ta.value = prompt;
                  ta.focus();
                }
              }}
              onExaminePlate={(artId) => {
                const art = INITIAL_ARTIFACTS[artId];
                if (art) {
                  setActiveArtifact(art);
                  setIsPlateOpen(true);
                }
              }}
              onPrefillQuery={(prefill) => {
                const ta = document.querySelector<HTMLTextAreaElement>('#ckTa');
                if (ta) {
                  ta.value = prefill;
                  ta.focus();
                }
              }}
              onRetryLast={() => {
                handleSubmitQuery(
                  'How can an early-stage SaaS improve activation without hurting retention?',
                  'research',
                  'markdown'
                );
              }}
            />
          )}
        </div>
      </main>

      {/* Fixed Bottom Writing Bar (Manuscript View) */}
      {view === 'manuscript' && (
        <ComposerBar
          onSubmit={handleSubmitQuery}
          isComposing={isComposing}
          activeMode={activeMode}
          onModeChange={setActiveMode}
        />
      )}

      {/* The Fold — Growth Brief Deliverable Modal */}
      <GrowthBriefModal
        isOpen={isBriefOpen}
        onClose={() => setIsBriefOpen(false)}
        brief={INITIAL_GROWTH_BRIEF}
        onSaveImpression={() => {
          showToast('Second impression bound');
          announce('Brief saved — second impression.');
        }}
        onJumpToCitation={(refIndex) => {
          const sup = document.querySelector<HTMLElement>(
            `#entries .sn-ref[data-n="${refIndex}"]`
          );
          if (sup?.dataset.note) {
            const note = document.getElementById(sup.dataset.note);
            if (note) {
              note.scrollIntoView({ block: 'center', behavior: 'smooth' });
              note.classList.add('flash');
              setTimeout(() => note.classList.remove('flash'), 1400);
            }
          }
        }}
        onSetEssay={() => {
          setActiveMode('essay');
          showToast('Composer set to Essay');
        }}
        onCastPlate={() => {
          setActiveArtifact(INITIAL_ARTIFACTS.a1);
          setIsPlateOpen(true);
          showToast('Plate cast — v1 · sandboxed frame');
        }}
      />

      {/* Plate Viewer — Sandboxed Deliverable Modal */}
      <PlateViewerModal
        isOpen={isPlateOpen}
        onClose={() => setIsPlateOpen(false)}
        artifact={activeArtifact}
        onRevise={(art) => {
          setIsPlateOpen(false);
          setActiveMode('artifact');
          const ta =
            view === 'frontmatter'
              ? document.querySelector<HTMLTextAreaElement>('#fmTa')
              : document.querySelector<HTMLTextAreaElement>('#ckTa');
          if (ta) {
            ta.value =
              art.kind === 'html'
                ? 'Revise the one-pager: sharpen the decision rule and add guardrail thresholds.'
                : 'Revise the memo: tighten the “where the evidence is thin” section.';
            ta.focus();
          }
          showToast('Composer set to Plate');
        }}
        onCopySuccess={showToast}
      />

      {/* Floating State Reviewer Tray */}
      <StatesTray onSelectState={handleSelectState} />

      {/* Printed Slip Notifications */}
      <Toasts toasts={toasts} />

      {/* Screen Reader Live Region */}
      <div className="sr-only" role="status" aria-live="polite" id="live">
        {announcement}
      </div>
    </>
  );
};
