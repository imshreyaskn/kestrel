import React, { useState, useEffect, useRef, useCallback } from 'react';
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
import { TOUR_ARTIFACTS, TOUR_BRIEF, TOUR_SESSIONS } from './lib/demoData';
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

  // Composing Run State
  const [isComposing, setIsComposing] = useState(false);
  const [activeMode, setActiveMode] = useState<ComposeMode>('research');
  const [composingSteps, setComposingSteps] = useState<ComposingStep[]>([]);

  // Toasts & Announcements
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const [announcement, setAnnouncement] = useState('');

  // Refs
  const sheetRef = useRef<HTMLElement>(null);
  const streamCtlRef = useRef<{ cancel: () => void } | null>(null);
  const lastRunRef = useRef<{ text: string; mode: ComposeMode; format: ArtifactKind } | null>(null);

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
        showToast(`The archive is unreachable — ${err.message}`);
      });
  }, [showToast]);

  // ---------------------------------------------------------------
  // Strike the run ("Esc" / "strike this run"): cancel the SSE reader.
  // The backend receives the disconnect and marks the assistant
  // message `cancelled` — no partial draft is persisted.
  // ---------------------------------------------------------------
  const handleStrikeRun = useCallback(() => {
    streamCtlRef.current?.cancel();
    streamCtlRef.current = null;
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
            ? { label: 'Recompose →', actionKey: 'prefill', prefill: lastRunRef.current.text }
            : undefined,
          stamp: 'struck by the reader · nothing persisted',
        },
        createdAt: new Date().toISOString(),
      });
    }

    announce('Run struck — nothing was persisted.');
    showToast('Run struck — nothing was persisted');
  }, [activeSessionId, announce, appendEntry, showToast]);

  // Global Keyboard Navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (isComposing && !isBriefOpen && !isPlateOpen && !isMobileRailOpen) {
          handleStrikeRun();
          return;
        }
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
          const msgs = await api.getSessionMessages(sessionId);
          const loaded = entriesFromHistory(sessionId, msgs);
          if (loaded.length > 0) {
            setSessions((prev) =>
              prev.map((s) => (s.id === sessionId ? { ...s, entries: loaded } : s))
            );
          }
        } catch (err) {
          const msg = err instanceof ApiError ? err.message : 'history could not be read';
          showToast(`Could not read this dossier — ${msg}`);
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
          showToast('Could not delete dossier — the archive kept it');
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
          showToast('Retitle failed — the archive kept the old title');
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
            : 'The cloud provider is not configured — add its API key server-side'
        );
      }
      setActiveProvider(newProv);
      if (provObj) {
        showToast(`Provider set to ${provObj.name.toLowerCase()} — ${provObj.model}`);
        announce(`Provider set to ${provObj.name}.`);
      }
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

      const stageMap: Record<string, number> = {
        loading_context: 0,
        retrieving: 1,
        drafting: 2,
        validating: 3,
        saving: 4,
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
            const activeIdx = stageMap[stage] ?? 0;
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
                      actionKey: 'prefill',
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
                  showToast(`Plate was persisted but could not be opened — ${msg}`);
                }
                return;
              }

              // Growth brief deliverable: fetch and open the fold.
              if (data.growth_brief_id) {
                try {
                  const brief = await api.getGrowthBrief(data.growth_brief_id);
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
                  showToast(`Brief was persisted but could not be opened — ${msg}`);
                }
              }

              // Research / brief / essay answer entry.
              const stamp =
                citations.length > 0
                  ? `Set in ${stampModel} · ${stampProvider} — ${citations.length} citation${
                      citations.length === 1 ? '' : 's'
                    } verified`
                  : `Set in ${stampModel} · ${stampProvider}`;
              appendEntry(session.id, {
                id: data.message.id || 'ans-' + Date.now(),
                kind: 'answer',
                answerData: buildAnswerData(data.message.content, stamp),
                citations,
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
                  top: document.body.scrollHeight,
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
                  actionKey: 'prefill',
                  prefill: text,
                },
                stamp: `${err.code} · nothing was persisted`,
              },
              createdAt: new Date().toISOString(),
            });
            announce('The composing run failed.');
            showToast(`The run failed — ${err.message}`);
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
      lastRunRef.current = { text, mode, format };
      let currentSession = activeSession;

      try {
        if (!currentSession) {
          const initialTitle = draftTitle || text.slice(0, 60);
          const newSess = await api.createSession(initialTitle, activeProvider);
          setSessions((prev) => [newSess, ...prev]);
          setActiveSessionId(newSess.id);
          setDraftTitle(null);
          setView('manuscript');
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
        showToast(`Could not open a dossier — ${msg}`);
        announce('Could not open a dossier. Nothing was submitted.');
        return;
      }

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

      setTimeout(() => {
        window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
      }, 50);

      runComposingPipeline(currentSession!, text, mode, format, productContext);
    },
    [activeProvider, activeSession, draftTitle, announce, appendEntry, runComposingPipeline, showToast]
  );

  // Retry the most recent real run, if there was one.
  const handleRetryLast = useCallback(() => {
    const last = lastRunRef.current;
    if (last) {
      handleSubmitQuery(last.text, last.mode, last.format);
    }
  }, [handleSubmitQuery]);

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
          showToast('Version conflict: please reload the latest brief');
          announce('Version conflict. Reload the latest brief.');
        } else {
          const msg = err instanceof ApiError ? err.message : 'the archive is unreachable';
          showToast(`Bind failed — ${msg}`);
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
      showToast('No brief bound to this dossier yet — compose one with the Brief mode');
      setActiveMode('growth_brief');
    }
  }, [activeSession, showToast]);

  // ---------------------------------------------------------------
  // Plates: real artifacts from the session, tour artifacts otherwise.
  // ---------------------------------------------------------------
  const handleExaminePlate = useCallback(
    (artId: string) => {
      const all = sessions.flatMap((s) => s.artifacts);
      const art = all.find((a) => a.id === artId) || TOUR_ARTIFACTS[artId];
      if (art) {
        setActiveArtifact(art);
        setIsPlateOpen(true);
      } else {
        showToast('That plate is no longer in the dossier');
      }
    },
    [sessions, showToast]
  );

  // ---------------------------------------------------------------
  // Design-tour state tray. Tour sessions are injected locally and
  // clearly marked; 'insufficient' and 'composing' run REAL queries
  // against PostgreSQL so the states are inspected live.
  // ---------------------------------------------------------------
  const ensureTourSession = useCallback((key: keyof typeof TOUR_SESSIONS) => {
    setSessions((prev) => {
      if (prev.some((s) => s.id === key)) return prev;
      return [TOUR_SESSIONS[key], ...prev];
    });
  }, []);

  const handleSelectState = useCallback(
    (stateKey: StateKey) => {
      setIsBriefOpen(false);
      setIsPlateOpen(false);

      switch (stateKey) {
        case 'hero':
          handleNewDossier();
          showToast('State: Frontmatter (New Dossier)');
          break;

        case 'activation':
          ensureTourSession('live-act');
          setActiveSessionId('live-act');
          setView('manuscript');
          showToast('State: Research Folio — design tour · not persisted');
          break;

        case 'pricing': {
          ensureTourSession('pricing');
          setActiveSessionId('pricing');
          setView('manuscript');
          showToast('State: Pricing Folio — design tour · not persisted');
          break;
        }

        case 'brief':
          setActiveBrief(TOUR_BRIEF);
          setIsBriefOpen(true);
          showToast('State: Growth Brief (The Fold) — design tour');
          break;

        case 'plate-html':
          setActiveArtifact(TOUR_ARTIFACTS.a1);
          setIsPlateOpen(true);
          showToast('State: Sandboxed HTML Plate — design tour');
          break;

        case 'plate-md':
          setActiveArtifact(TOUR_ARTIFACTS.a2);
          setIsPlateOpen(true);
          showToast('State: Sandboxed Markdown Plate — design tour');
          break;

        case 'insufficient':
          if (isComposing) {
            showToast('Composing — strike the run first');
            break;
          }
          setView('frontmatter');
          handleSubmitQuery(
            'What’s a good benchmark conversion rate for product-led growth companies?',
            'research',
            'markdown'
          );
          showToast('State: Insufficient Evidence — real run against the archive');
          break;

        case 'composing':
          if (isComposing) {
            showToast('A run is already composing');
            break;
          }
          setView('frontmatter');
          handleSubmitQuery(
            'How does Superhuman measure product-market fit delight?',
            'research',
            'markdown'
          );
          showToast('State: Composing 4-Stage Step List — real run');
          break;

        case 'empty':
          ensureTourSession('empty1');
          setActiveSessionId('empty1');
          setView('manuscript');
          showToast('State: Blank Folio — design tour · not persisted');
          break;

        case 'colophon':
          document.getElementById('coloBtn')?.click();
          showToast('State: Colophon Provider Inspector');
          break;
      }
    },
    [ensureTourSession, handleNewDossier, handleSubmitQuery, isComposing, showToast]
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
              composingStamp={composingStamp}
              onStrikeRun={handleStrikeRun}
              onOpenBrief={handleOpenBrief}
              onSetEssay={(prompt) => {
                setActiveMode('essay');
                const ta = document.querySelector<HTMLTextAreaElement>('#ckTa');
                if (ta) {
                  ta.value = prompt;
                  ta.focus();
                }
              }}
              onExaminePlate={handleExaminePlate}
              onPrefillQuery={(prefill) => {
                const ta = document.querySelector<HTMLTextAreaElement>('#ckTa');
                if (ta) {
                  ta.value = prefill;
                  ta.focus();
                }
              }}
              onRetryLast={handleRetryLast}
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
        brief={activeBrief || TOUR_BRIEF}
        onSaveImpression={handleSaveBrief}
        onSetEssay={() => {
          setActiveMode('essay');
          showToast('Composer set to Essay');
        }}
        onCastPlate={() => {
          setActiveMode('artifact');
          const ta = document.querySelector<HTMLTextAreaElement>('#ckTa');
          if (ta) {
            ta.value = `Cast an HTML one-pager experiment brief from this growth brief: “${activeBrief?.title || 'the brief'}”.`;
            ta.focus();
          }
          showToast('Composer set to Plate — describe the plate and bind');
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
            ta.value = `Revise the plate “${art.title}” — sharpen its decision rule and keep every claim grounded.`;
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
