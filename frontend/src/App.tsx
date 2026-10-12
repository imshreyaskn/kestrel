import React, { useState, useEffect, useRef, useCallback } from 'react';
import { flushSync } from 'react-dom';
import {
  AppView,
  ArtifactData,
  ArtifactKind,
  ComposeMode,
  ComposingStep,
  GrowthBriefData,
  ManuscriptEntry,
  ProviderConfig,
  ProviderId,
  SessionData,
  ToastMessage,
} from './types';
import { ApiError, api, isUuid } from './lib/api';
import { buildAnswerData, buildCitations, entriesFromHistory, modeToLabel } from './lib/citeInline';
import { prefersReducedMotion, strikeCard, shakeConflict } from './lib/motion';

import { RunningHead } from './components/RunningHead';
import { IndexRail } from './components/IndexRail';
import { Frontmatter } from './components/Frontmatter';
import { Manuscript } from './components/Manuscript';
import { ComposerBar } from './components/ComposerBar';
import { GrowthBriefModal } from './components/GrowthBriefModal';
import { PlateViewerModal } from './components/PlateViewerModal';
import { LeaderLines } from './components/LeaderLines';
import { Toasts } from './components/Toasts';
import { ArtifactsDock } from './components/ArtifactsDock';

const COMPOSING_STAGES: Record<ComposeMode, Array<[string, string]>> = {
  research: [
    ['consulting the archive', 'semantic + keyword · passages weighed'],
    ['drafting the entry', 'grounded in retrieved passages only'],
    ['verifying citations', 'each claim checked to its source'],
    ['binding to the session', ''],
  ],
  growth_brief: [
    ['consulting the archive', 'semantic + keyword · passages weighed'],
    ['composing the brief', 'sections — evidence kept apart from synthesis'],
    ['verifying citations', 'each claim checked to its source'],
    ['binding the draft', ''],
  ],
  essay: [
    ['consulting the archive', 'semantic + keyword · passages weighed'],
    ['outlining · ship 30 skill', 'hook · structure · takeaway'],
    ['drafting the essay', '≈ 1,250 words · claims grounded'],
    ['verifying citations', 'each claim checked to its source'],
  ],
  artifact: [
    ['consulting the archive', 'semantic + keyword · passages weighed'],
    ['casting the plate', 'structured document from evidence'],
    ['checking the frame', 'sandboxed — scripts, forms, network blocked'],
    ['filing the plate', ''],
  ],
};

const ORDINALS = ['First', 'Second', 'Third', 'Fourth', 'Fifth', 'Sixth', 'Seventh'];
const ordinal = (n: number) => ORDINALS[n - 1] || `${n}th`;

export const App: React.FC = () => {
  const [view, setView] = useState<AppView>('frontmatter');
  const [sessions, setSessions] = useState<SessionData[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [draftTitle, setDraftTitle] = useState<string | null>(null);
  const [activeProvider, setActiveProvider] = useState<ProviderId>('local');
  const [providers, setProviders] = useState<ProviderConfig[]>([]);

  // Modals & Panels
  const [isMobileRailOpen, setIsMobileRailOpen] = useState(false);
  const [isBriefOpen, setIsBriefOpen] = useState(false);
  const [activeBrief, setActiveBrief] = useState<GrowthBriefData | null>(null);
  const [isPlateOpen, setIsPlateOpen] = useState(false);
  const [activeArtifact, setActiveArtifact] = useState<ArtifactData | null>(null);
  const [plateOriginRect, setPlateOriginRect] = useState<DOMRect | null>(null);
  const [isColophonOpen, setIsColophonOpen] = useState(false);

  // Composing Run State
  const [isComposing, setIsComposing] = useState(false);
  const [activeMode, setActiveMode] = useState<ComposeMode>('research');
  const [composingSteps, setComposingSteps] = useState<ComposingStep[]>([]);
  const [composerPrefill, setComposerPrefill] = useState<string | null>(null);

  // Toasts & Announcements
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const [announcement, setAnnouncement] = useState('');

  // Refs
  const sheetRef = useRef<HTMLElement>(null);
  const streamCtlRef = useRef<{ cancel: () => void } | null>(null);
  const lastRunRef = useRef<{ text: string; mode: ComposeMode; format: ArtifactKind; productContext?: string } | null>(null);
  const isStrikingRef = useRef(false);
  const strikeTimerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (strikeTimerRef.current !== null) {
        clearTimeout(strikeTimerRef.current);
      }
    };
  }, []);

  const activeSession = sessions.find((s) => s.id === activeSessionId) || null;

  const showToast = useCallback((message: string, tone: 'ink' | 'danger' = 'ink') => {
    const id = 'toast-' + Date.now() + '-' + Math.random().toString(36).slice(2, 5);
    setToasts((prev) => [...prev, { id, message, tone }].slice(-3));
    setTimeout(() => {
      setToasts((prev) => prev.map((t) => (t.id === id ? { ...t, out: true } : t)));
    }, 2800);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 3150);
  }, []);

  const announce = useCallback((msg: string) => {
    setAnnouncement(msg);
  }, []);

  // Append a manuscript entry to a session (local UI state only).
  const appendEntry = useCallback((sessionId: string, entry: ManuscriptEntry) => {
    setSessions((prev) =>
      prev.map((s) =>
        s.id === sessionId ? { ...s, entries: [...s.entries, entry], updatedAt: entry.createdAt } : s
      )
    );
  }, []);

  // ---------------------------------------------------------------
  // Initialize: live providers + real session list from PostgreSQL.
  // An empty archive shows the pristine frontmatter landing view.
  // ---------------------------------------------------------------
  useEffect(() => {
    api
      .getProviders()
      .then(setProviders)
      .catch(() => undefined); // getProviders normalizes its own offline state

    api
      .getSessions()
      .then((loaded) => {
        setSessions(loaded);
        if (loaded.length === 0) {
          setView('frontmatter');
        }
      })
      .catch((err: ApiError) => {
        setSessions([]);
        showToast(`The archive is unreachable — ${err.message}`, 'danger');
      });
  }, [showToast]);

  // ---------------------------------------------------------------
  // Strike the run ("Esc" / "strike this run"): cancel the SSE reader.
  // The backend receives the disconnect and marks the assistant
  // message `cancelled` — no partial draft is persisted.
  // ---------------------------------------------------------------
  const handleStrikeRun = useCallback(() => {
    if (isStrikingRef.current) return;
    isStrikingRef.current = true;

    streamCtlRef.current?.cancel();
    streamCtlRef.current = null;

    const finishStrike = () => {
      isStrikingRef.current = false;
      if (strikeTimerRef.current !== null) {
        clearTimeout(strikeTimerRef.current);
        strikeTimerRef.current = null;
      }
      setIsComposing(false);
      setComposingSteps([]);

      if (activeSessionId) {
        appendEntry(activeSessionId, {
          id: 'struck-' + Date.now(),
          kind: 'insufficient',
          noticeData: {
            kick: 'Run struck',
            paragraphs: [
              'Nothing was bound to this session — the partial draft was discarded, and no citation was recorded.',
            ],
            action: lastRunRef.current
              ? { label: 'Recompose →', actionKey: 'recompose', prefill: lastRunRef.current.text }
              : undefined,
            stamp: 'struck by the reader · nothing persisted',
          },
          createdAt: new Date().toISOString(),
        });
      }

      announce('Run struck — nothing was persisted.');
      showToast('Run struck — nothing was persisted', 'danger');
    };

    const compEl = document.querySelector<HTMLElement>('.composing');
    if (compEl && strikeCard(compEl)) {
      strikeTimerRef.current = window.setTimeout(finishStrike, 400);
    } else {
      finishStrike();
    }
  }, [activeSessionId, announce, appendEntry, showToast]);

  // Global Keyboard Navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        // Modals own their own accessible Escape listener to play reverse closing animations.
        if (isBriefOpen || isPlateOpen) {
          return;
        }
        if (isComposing && !isMobileRailOpen) {
          handleStrikeRun();
          return;
        }
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
  }, [view, isComposing, isBriefOpen, isPlateOpen, isMobileRailOpen, handleStrikeRun]);

  // ---------------------------------------------------------------
  // Session Switching: real sessions lazily load their history.
  // ---------------------------------------------------------------
  const handleSelectSession = useCallback(
    async (sessionId: string) => {
      if (isComposing) {
        showToast('Composing — strike the run first');
        return;
      }
      const target = sessions.find((s) => s.id === sessionId);
      if (!target) return;
      setDraftTitle(null);
      setActiveSessionId(sessionId);
      setView('manuscript');
      window.scrollTo({ top: 0, behavior: 'smooth' });

      // Real sessions: fetch persisted history on first open.
      if (!target.isDemo && target.entries.length === 0) {
        try {
          const [msgs, latestBrief, arts] = await Promise.all([
            api.getSessionMessages(sessionId),
            api.getLatestGrowthBrief(sessionId),
            api.getSessionArtifacts(sessionId),
          ]);
          const loaded = entriesFromHistory(sessionId, msgs, latestBrief, arts);
          if (latestBrief) setActiveBrief(latestBrief);
          setSessions((prev) =>
            prev.map((s) =>
              s.id === sessionId
                ? {
                    ...s,
                    entries: loaded,
                    activeBrief: latestBrief || s.activeBrief,
                    artifacts: arts.length > 0 ? arts : s.artifacts,
                    briefCount: latestBrief ? 1 : s.briefCount,
                    plateSeq: arts.length > 0 ? arts.length : s.plateSeq,
                  }
                : s
            )
          );
        } catch (err) {
          const msg = err instanceof ApiError ? err.message : 'history could not be read';
          showToast(`Could not read this dossier — ${msg}`, 'danger');
        }
      }
    },
    [isComposing, sessions, showToast]
  );

  const handleNewDossier = useCallback(() => {
    if (isComposing) {
      showToast('Composing — strike the run first');
      return;
    }
    setActiveSessionId(null);
    setDraftTitle(null);
    setView('frontmatter');
    const ta = document.querySelector<HTMLTextAreaElement>('#fmTa');
    if (ta) ta.focus();
  }, [isComposing, showToast]);

  const handleDeleteSession = useCallback(
    async (sessionId: string) => {
      if (isComposing) {
        showToast('Composing — strike the run first');
        return;
      }
      const target = sessions.find((s) => s.id === sessionId);
      if (!target) return;

      // Optimistic removal from state
      setSessions((prev) => prev.filter((s) => s.id !== sessionId));

      if (sessionId === activeSessionId) {
        handleNewDossier();
      }

      if (!target.isDemo) {
        try {
          await api.deleteSession(sessionId);
          showToast('Dossier deleted');
        } catch {
          // Revert on failure
          setSessions((prev) => [target, ...prev]);
          showToast('Could not delete dossier — the archive kept it', 'danger');
        }
      } else {
        showToast('Dossier removed from tour');
      }
    },
    [isComposing, sessions, activeSessionId, handleNewDossier, showToast]
  );

  // Renaming: persisted sessions update PostgreSQL; draft/new dossiers only record in local state
  // until the user actually sends their first query (no empty ghost sessions in DB).
  const handleTitleChange = useCallback(
    (newTitle: string) => {
      const trimmed = newTitle.slice(0, 60).trim();
      if (!trimmed) return;

      if (!activeSessionId) {
        setDraftTitle(trimmed);
        showToast('Dossier titled');
        return;
      }

      const target = sessions.find((s) => s.id === activeSessionId);
      if (!target) return;

      if (target.isDemo) {
        setSessions((prev) =>
          prev.map((s) => (s.id === activeSessionId ? { ...s, title: trimmed } : s))
        );
        showToast('Dossier retitled');
        return;
      }

      const previous = target.title;
      setSessions((prev) =>
        prev.map((s) => (s.id === activeSessionId ? { ...s, title: trimmed } : s))
      );
      api.updateSessionTitle(activeSessionId, trimmed).then(
        () => showToast('Dossier retitled'),
        () => {
          setSessions((prev) =>
            prev.map((s) => (s.id === activeSessionId ? { ...s, title: previous || s.title } : s))
          );
          showToast('Retitle failed — the archive kept the old title', 'danger');
        }
      );
    },
    [activeSessionId, sessions, showToast]
  );

  const handleProviderChange = useCallback(
    (newProv: ProviderId) => {
      const provObj = providers.find((p) => p.id === newProv);
      if (provObj && provObj.status === 'offline') {
        showToast(
          newProv === 'local'
            ? 'Local Ollama is unreachable — start it, or use the cloud setting'
            : 'The cloud provider is not configured — add its API key server-side',
          'danger'
        );
      } else if (provObj) {
        showToast(`Provider set to ${provObj.name.toLowerCase()} — ${provObj.model}`);
        announce(`Provider set to ${provObj.name}.`);
      }
      setActiveProvider(newProv);
    },
    [providers, showToast, announce]
  );

  // ---------------------------------------------------------------
  // Live SSE composing pipeline. On error: an honest failure notice —
  // never a fabricated answer. On completion: entries are built from
  // the validated message and its server-resolved citations.
  // ---------------------------------------------------------------
  const runComposingPipeline = useCallback(
    (session: SessionData, text: string, mode: ComposeMode, format: ArtifactKind, productContext?: string | null) => {
      setIsComposing(true);
      const stageDefs = COMPOSING_STAGES[mode] || COMPOSING_STAGES.research;
      const initialSteps: ComposingStep[] = stageDefs.map((def, idx) => ({
        label: def[0],
        detail: def[1],
        status: idx === 0 ? 'run' : 'wait',
      }));
      setComposingSteps(initialSteps);
      announce(stageDefs[0][0]);

      const STAGE_MAP_BY_MODE: Record<ComposeMode, Record<string, number>> = {
        research: { loading_context: 0, retrieving: 0, drafting: 1, validating: 2, saving: 3 },
        growth_brief: { loading_context: 0, retrieving: 0, drafting: 1, validating: 2, saving: 3 },
        artifact: { loading_context: 0, retrieving: 0, drafting: 1, validating: 2, saving: 3 },
        essay: { loading_context: 0, retrieving: 1, drafting: 2, validating: 3, saving: 3 },
      };

      const modelName =
        providers.find((p) => p.id === activeProvider)?.model || activeProvider;

      streamCtlRef.current = api.streamMessage(
        session.id,
        {
          content: text,
          mode,
          format,
          provider: activeProvider,
          productContext: productContext || null,
        },
        {
          onStage: (stage, label) => {
            const activeIdx = STAGE_MAP_BY_MODE[mode]?.[stage] ?? 0;
            setComposingSteps((prev) =>
              prev.map((step, idx) => ({
                ...step,
                status: idx < activeIdx ? 'done' : idx === activeIdx ? 'run' : 'wait',
              }))
            );
            announce(label || stage);
          },
          onComplete: async (data) => {
            setComposingSteps((prev) => prev.map((s) => ({ ...s, status: 'done' })));
            setTimeout(async () => {
              setIsComposing(false);
              streamCtlRef.current = null;

              const citations = buildCitations(session.id, data.message.id, data.citations || []);
              const stampModel = data.message.model_id || modelName;
              const stampProvider = data.message.provider || activeProvider;

              // Insufficient evidence: honest abstention, no fabrication.
              if (data.insufficient_evidence) {
                appendEntry(session.id, {
                  id: data.message.id || 'insuf-' + Date.now(),
                  kind: 'insufficient',
                  noticeData: {
                    kick: 'Not in the archive',
                    paragraphs: [
                      data.message.content ||
                        'The podcast transcript corpus does not contain sufficient verified evidence to support this claim.',
                    ],
                    action: {
                      label: 'Recompose →',
                      actionKey: 'recompose',
                      prefill: text,
                    },
                    stamp: `${stampModel} · 0 citations · the question outran the evidence`,
                  },
                  citations,
                  createdAt: new Date().toISOString(),
                });
                showToast('Not enough evidence in the archive');
                announce('Insufficient evidence — nothing was invented.');
                return;
              }

              // Artifact deliverable: fetch and file the plate.
              if (data.artifact_id) {
                try {
                  const artifact = await api.getArtifact(data.artifact_id);
                  const nextPlateSeq = session.plateSeq + 1;
                  setSessions((prev) =>
                    prev.map((s) =>
                      s.id === session.id
                        ? {
                            ...s,
                            plateSeq: nextPlateSeq,
                            artifacts: [...s.artifacts, artifact],
                          }
                        : s
                    )
                  );
                  appendEntry(session.id, {
                    id: 'plate-entry-' + Date.now(),
                    kind: 'notice',
                    noticeData: {
                      kick: 'Plate filed',
                      paragraphs: [
                        `${artifact.title} is filed in the margin at right — v${artifact.version}. It’s examined in a sandboxed frame: scripts, forms and network are blocked, and the original source stays one click away.`,
                      ],
                      stamp: `${artifact.file} · sandboxed preview · v${artifact.version}`,
                    },
                    artifact,
                    createdAt: new Date().toISOString(),
                  });
                  setActiveArtifact(artifact);
                  setIsPlateOpen(true);
                  showToast(`Plate filed — v${artifact.version} · sandboxed frame`);
                  announce('Plate filed and open for examination.');
                } catch (err) {
                  const msg = err instanceof ApiError ? err.message : 'the plate could not be read';
                  showToast(`Plate was persisted but could not be opened — ${msg}`, 'danger');
                }
                return;
              }

              // Growth brief deliverable: fetch and open the fold.
              let fetchedBrief: GrowthBriefData | undefined = undefined;
              if (data.growth_brief_id) {
                try {
                  const brief = await api.getGrowthBrief(data.growth_brief_id);
                  fetchedBrief = brief;
                  setSessions((prev) =>
                    prev.map((s) =>
                      s.id === session.id
                        ? { ...s, activeBrief: brief, briefCount: s.briefCount + 1 }
                        : s
                    )
                  );
                  setActiveBrief(brief);
                  setIsBriefOpen(true);
                  showToast('Growth brief bound — first impression');
                  announce('Growth brief composed and opened.');
                } catch (err) {
                  const msg = err instanceof ApiError ? err.message : 'the brief could not be read';
                  showToast(`Brief was persisted but could not be opened — ${msg}`, 'danger');
                }
              }

              // Deliverable artifacts: Essay or Plate
              const isEssay = data.message.mode === 'essay' || activeMode === 'essay';
              const essayArtifact: ArtifactData | undefined = isEssay
                ? {
                    id: `essay-${data.message.id || Date.now()}`,
                    file: `${(data.message.content.match(/^#+\s*(.+)$/m)?.[1] || 'ship-30-essay').toLowerCase().replace(/[^a-z0-9]+/g, '-')}.md`,
                    title: data.message.content.match(/^#+\s*(.+)$/m)?.[1] || 'Ship 30 Digital Essay',
                    kind: 'markdown',
                    src: data.message.content,
                    version: 1,
                    impression: 'Ship 30 Essay · Markdown',
                    createdAt: data.message.created_at || new Date().toISOString(),
                  }
                : undefined;

              if (essayArtifact) {
                setSessions((prev) =>
                  prev.map((s) =>
                    s.id === session.id
                      ? { ...s, artifacts: [...s.artifacts, essayArtifact] }
                      : s
                  )
                );
              }

              // Research / brief / essay answer entry.
              const stamp =
                citations.length > 0
                  ? `Set in ${stampModel} · ${stampProvider} — ${citations.length} citation${
                      citations.length === 1 ? '' : 's'
                    } verified`
                  : `Set in ${stampModel} · ${stampProvider}`;
              const writingPath = data.message.metadata?.writing_path
                ? String(data.message.metadata.writing_path)
                : undefined;
              appendEntry(session.id, {
                id: data.message.id || 'ans-' + Date.now(),
                kind: 'answer',
                answerData: {
                  ...buildAnswerData(data.message.content, stamp),
                  writingPath,
                },
                citations,
                brief: fetchedBrief,
                artifact: essayArtifact,
                essayContent: isEssay ? data.message.content : undefined,
                createdAt: data.message.created_at || new Date().toISOString(),
              });

              announce(
                citations.length > 0
                  ? `Entry bound — ${citations.length} citation${citations.length === 1 ? '' : 's'} verified in the margin.`
                  : `Entry bound — set in ${stampModel}.`
              );
              showToast(`Entry bound — ${citations.length} citation${citations.length === 1 ? '' : 's'} verified`);
              setTimeout(() => {
                window.scrollTo({
                  top: Math.max(document.body.scrollHeight, document.documentElement.scrollHeight),
                  behavior: 'smooth',
                });
              }, 100);
            }, 300);
          },
          onError: (err) => {
            setIsComposing(false);
            streamCtlRef.current = null;
            appendEntry(session.id, {
              id: 'err-' + Date.now(),
              kind: 'insufficient',
              noticeData: {
                kick: 'The run failed',
                paragraphs: [err.message],
                action: {
                  label: 'Recompose →',
                  actionKey: 'recompose',
                  prefill: text,
                },
                stamp: `${err.code} · nothing was persisted`,
              },
              createdAt: new Date().toISOString(),
            });
            announce('The composing run failed.');
            showToast(`The run failed — ${err.message}`, 'danger');
          },
          onCancelled: () => {
            // The struck-run notice is appended by handleStrikeRun.
          },
        }
      );
    },
    [activeProvider, announce, appendEntry, providers, showToast]
  );

  // ---------------------------------------------------------------
  // Submit Prompt from Frontmatter or ComposerBar.
  // Real interactions always hit PostgreSQL: submitting inside a design
  // tour dossier transparently opens a fresh real dossier first.
  // ---------------------------------------------------------------
  const handleSubmitQuery = useCallback(
    async (text: string, mode: ComposeMode, format: ArtifactKind, productContext?: string) => {
      lastRunRef.current = { text, mode, format, productContext };
      setActiveMode(mode);
      let currentSession = activeSession;
      const isInitialSwitch = view === 'frontmatter' || !currentSession;

      try {
        if (!currentSession) {
          const initialTitle = draftTitle || text.slice(0, 60);
          const newSess = await api.createSession(initialTitle, activeProvider);
          setSessions((prev) => [newSess, ...prev]);
          setActiveSessionId(newSess.id);
          setDraftTitle(null);
          currentSession = newSess;
        } else if (currentSession.isDemo) {
          showToast('Design tour dossier — binding to a fresh archive dossier');
          const initialTitle = draftTitle || text.slice(0, 60);
          const newSess = await api.createSession(initialTitle, activeProvider);
          setSessions((prev) => [newSess, ...prev]);
          setActiveSessionId(newSess.id);
          setDraftTitle(null);
          currentSession = newSess;
        }
      } catch (err) {
        const msg = err instanceof ApiError ? err.message : 'the archive is unreachable';
        showToast(`Could not open a dossier — ${msg}`, 'danger');
        announce('Could not open a dossier. Nothing was submitted.');
        return;
      }

      const appendQueryEntry = () => {
        appendEntry(currentSession!.id, {
          id: 'q-' + Date.now(),
          kind: 'query',
          queryText: text,
          queryMeta: {
            time: new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }),
            modeLabel: modeToLabel(mode),
            hasContext: !!productContext,
          },
          createdAt: new Date().toISOString(),
        });
      };

      if (isInitialSwitch) {
        // Initial transition: Frontmatter -> Manuscript
        if ('startViewTransition' in document && !prefersReducedMotion()) {
          (document as any).startViewTransition(() => {
            flushSync(() => {
              setView('manuscript');
              appendQueryEntry();
            });
            window.scrollTo({ top: 0, behavior: 'instant' });
          });
        } else {
          setView('manuscript');
          appendQueryEntry();
          window.scrollTo({ top: 0, behavior: 'instant' });
        }
      } else {
        // Subsequent prompt inside active Manuscript: direct append, no full-page transition flash
        appendQueryEntry();
        setTimeout(() => {
          window.scrollTo({
            top: Math.max(document.body.scrollHeight, document.documentElement.scrollHeight),
            behavior: 'smooth',
          });
        }, 100);
      }

      runComposingPipeline(currentSession!, text, mode, format, productContext);
    },
    [activeProvider, activeSession, draftTitle, view, announce, appendEntry, runComposingPipeline, showToast]
  );

  // Retry the most recent real run, if there was one.
  const handleRetryLast = useCallback(() => {
    const last = lastRunRef.current;
    if (last) {
      handleSubmitQuery(last.text, last.mode, last.format, last.productContext);
    }
  }, [handleSubmitQuery]);

  // Recompose a failed run: replaces the failed message directly instead of appending a new one.
  const handleRecompose = useCallback(
    (failedEntryId: string, text: string) => {
      const currentSession = activeSession;
      if (!currentSession) return;
      const last = lastRunRef.current;
      const mode = last?.mode || 'research';
      const format = last?.format || 'markdown';
      const queryText = text || last?.text || '';
      const productContext = last?.productContext;

      // Replace the failed message by removing it from the session entries
      setSessions((prev) =>
        prev.map((s) =>
          s.id === currentSession.id
            ? { ...s, entries: s.entries.filter((e) => e.id !== failedEntryId) }
            : s
        )
      );

      // Re-run the composing pipeline with the query
      runComposingPipeline(currentSession, queryText, mode, format, productContext);
    },
    [activeSession, runComposingPipeline]
  );

  // ---------------------------------------------------------------
  // Growth Brief — "Bind impression" (optimistic concurrency).
  // ---------------------------------------------------------------
  const handleSaveBrief = useCallback(
    async (draft: GrowthBriefData) => {
      // Design-tour briefs never touch the API — that's the point of the tour.
      if (draft.isDemo || !isUuid(draft.id)) {
        showToast('Design tour brief — compose a real brief to persist edits');
        announce('This is a design tour brief. Nothing was sent.');
        return;
      }
      try {
        const saved = await api.saveGrowthBrief(draft);
        setActiveBrief(saved);
        setSessions((prev) =>
          prev.map((s) => (s.id === saved.sessionId ? { ...s, activeBrief: saved } : s))
        );
        showToast(`${ordinal(saved.version)} impression bound — Version ${saved.version}`);
        announce(`Brief saved. Version ${saved.version}.`);
      } catch (err) {
        if (err instanceof ApiError && err.status === 409) {
          const chipEl = document.getElementById('impChip');
          if (chipEl) {
            shakeConflict(chipEl);
          }
          showToast('Version conflict: please reload the latest brief', 'danger');
          announce('Version conflict. Reload the latest brief.');
        } else {
          const msg = err instanceof ApiError ? err.message : 'the archive is unreachable';
          showToast(`Bind failed — ${msg}`, 'danger');
        }
      }
    },
    [announce, showToast]
  );

  const handleOpenBrief = useCallback(() => {
    if (activeSession?.activeBrief) {
      setActiveBrief(activeSession.activeBrief);
      setIsBriefOpen(true);
    } else {
      setActiveMode('growth_brief');
      const lastQuery = [...(activeSession?.entries || [])]
        .reverse()
        .find((e) => e.kind === 'query')?.queryText;
      const briefPrefill = lastQuery
        ? `Synthesize a structured growth brief from our research into “${lastQuery}”.`
        : 'Compose a structured growth brief from this dossier’s findings.';
      setComposerPrefill(briefPrefill);
      showToast('Composer set to Growth Brief — press Bind to compose');
    }
  }, [activeSession, showToast]);

  // ---------------------------------------------------------------
  // Plates: real artifacts from the session, tour artifacts otherwise.
  // ---------------------------------------------------------------
  const handleExaminePlate = useCallback(
    (artId: string, originRect?: DOMRect) => {
      const all = sessions.flatMap((s) => s.artifacts);
      const art = all.find((a) => a.id === artId);
      if (art) {
        if (originRect) setPlateOriginRect(originRect);
        setActiveArtifact(art);
        setIsPlateOpen(true);
      } else {
        showToast('That plate is no longer in the dossier');
      }
    },
    [sessions, showToast]
  );

  const composingStamp = `${providers.find((p) => p.id === activeProvider)?.model || activeProvider} · ${activeProvider} — nothing is bound until citations pass`;

  return (
    <>
      <a className="skip" href="#sheet">
        Skip to the dossier
      </a>
      <div className="grain" aria-hidden="true" />

      {/* Masthead */}
      <RunningHead
        title={activeSession ? activeSession.title : (draftTitle || '')}
        isUntitled={!activeSession && !draftTitle}
        onTitleChange={handleTitleChange}
        activeProvider={activeProvider}
        onProviderChange={handleProviderChange}
        providers={providers}
        onOpenMobileMenu={() => setIsMobileRailOpen(true)}
        isComposing={isComposing}
        isColophonOpen={isColophonOpen}
        onColophonOpenChange={setIsColophonOpen}
      />

      {/* Book-spine Session Index Rail */}
      <IndexRail
        sessions={sessions}
        activeSessionId={activeSessionId}
        onSelectSession={handleSelectSession}
        onDeleteSession={handleDeleteSession}
        onNewDossier={handleNewDossier}
        isMobileOpen={isMobileRailOpen}
        onCloseMobile={() => setIsMobileRailOpen(false)}
      />

      {/* Right-side Folio Deliverables Dock */}
      <ArtifactsDock
        activeBrief={activeSession?.activeBrief || activeBrief}
        artifacts={[
          ...(activeSession?.artifacts || []),
          ...(activeSession?.entries
            ?.map((e) => e.artifact)
            .filter((a): a is NonNullable<typeof a> => !!a)
            .filter((a) => !(activeSession?.artifacts || []).some((s) => s.id === a.id)) || []),
        ]}
        onOpenBrief={handleOpenBrief}
        onExaminePlate={handleExaminePlate}
        isColophonOpen={isColophonOpen}
      />

      {/* Continuous Manuscript Sheet */}
      <main
        className="sheet"
        id="sheet"
        ref={sheetRef}
      >
        <LeaderLines sheetRef={sheetRef} />

        <div className="page">
          {view === 'frontmatter' ? (
            <Frontmatter
              onSubmit={handleSubmitQuery}
              isComposing={isComposing}
              prefillText={composerPrefill}
              onClearPrefill={() => setComposerPrefill(null)}
              onSelectIndexMode={(m, prefill) => {
                setActiveMode(m);
                if (prefill) {
                  handleSubmitQuery(prefill, m, 'markdown');
                }
              }}
            />
          ) : (
            <Manuscript
              entries={activeSession?.entries || []}
              isComposing={isComposing}
              composingSteps={composingSteps}
              composingStamp={composingStamp}
              onStrikeRun={handleStrikeRun}
              onOpenBrief={handleOpenBrief}
              onSetEssay={(prompt) => {
                setActiveMode('essay');
                setComposerPrefill(prompt);
              }}
              onExaminePlate={handleExaminePlate}
              onPrefillQuery={(prefill) => {
                setComposerPrefill(prefill);
              }}
              onRetryLast={handleRetryLast}
              onRecompose={handleRecompose}
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
          prefillText={composerPrefill}
          onClearPrefill={() => setComposerPrefill(null)}
        />
      )}

      {/* The Fold — Growth Brief Deliverable Modal. Rendered only when a real
          brief exists: the removed design-tour fixtures can never surface. */}
      {activeBrief && (
        <GrowthBriefModal
          isOpen={isBriefOpen}
          onClose={() => setIsBriefOpen(false)}
          brief={activeBrief}
          onSaveImpression={handleSaveBrief}
          onSetEssay={() => {
            setActiveMode('essay');
            showToast('Composer set to Essay');
          }}
          onCastPlate={() => {
            setActiveMode('artifact');
            setComposerPrefill(
              `Cast an HTML one-pager experiment brief from this growth brief: “${activeBrief.title}”.`
            );
            showToast('Composer set to Plate — describe the plate and bind');
          }}
        />
      )}

      {/* Plate Viewer — Sandboxed Deliverable Modal */}
      <PlateViewerModal
        isOpen={isPlateOpen}
        onClose={() => {
          setIsPlateOpen(false);
          setPlateOriginRect(null);
        }}
        artifact={activeArtifact}
        originRect={plateOriginRect}
        onRevise={(art) => {
          setIsPlateOpen(false);
          setActiveMode('artifact');
          setComposerPrefill(
            `Revise the plate “${art.title}” — sharpen its decision rule and keep every claim grounded.`
          );
          showToast('Composer set to Plate');
        }}
        onCopySuccess={showToast}
      />


      {/* Printed Slip Notifications */}
      <Toasts toasts={toasts} />

      {/* Screen Reader Live Region */}
      <div className="sr-only" role="status" aria-live="polite" id="live">
        {announcement}
      </div>
    </>
  );
};
