/**
 * Strict TypeScript Domain Types — The Lenny Growth Assistant (Kestrel)
 * Conforming strictly to IMPLEMENTATION_SPEC.md §5, §6, and §10
 */

export type ProviderId = 'local' | 'cloud';

export type ComposeMode = 'research' | 'growth_brief' | 'essay' | 'artifact';

export type ArtifactKind = 'html' | 'markdown';

export type AppView = 'frontmatter' | 'manuscript';

export interface ProviderConfig {
  id: ProviderId;
  name: string;
  model: string;
  status: 'active' | 'available' | 'offline';
  description: string;
}

export interface Citation {
  // DOM anchor id: `sn-{sessionId}-{messageId}-{evidenceId}` — unique across
  // the whole manuscript so leader lines and getElementById stay unambiguous
  // even when several answers in one session reuse evidence label E1.
  id: string;
  refIndex: number; // sequential display number 1, 2, 3...
  speaker: string;
  affiliation?: string;
  episodeTitle: string;
  episodeUrl?: string;
  quote: string; // verbatim excerpt read from the stored transcript chunk
  provenanceStamp: string; // e.g. "[E1] supporting passage"
  chunkId?: string;
}

export interface ArtifactData {
  id: string;
  file: string;
  title: string;
  kind: ArtifactKind;
  src: string;
  mdHtml?: string;
  version: number;
  impression: string;
  createdAt?: string;
}

export interface GrowthBriefExperiment {
  // Field names mirror the backend contract exactly (SPEC §5.7 / §8.3):
  // hypothesis, change, segment (audience), success_metric (primary metric),
  // guardrail_metric, decision_rule.
  hypothesis: string;
  change: string;
  segment: string;
  success_metric: string;
  guardrail_metric: string;
  decision_rule: string;
}

export interface GrowthBriefData {
  id: string;
  sessionId: string;
  title: string;
  version: number;
  status: string;
  productContext: string | null;
  // The 7 bound sections (mission contract): problem, research_summary,
  // recommendation, assumptions, experiment, risks, next_deliverable.
  problem: string;
  researchSummary: string;
  recommendation: string;
  assumptions: string; // newline-joined list, editable as prose
  experiment: GrowthBriefExperiment;
  risks: string; // newline-joined list
  nextDeliverable: string;
  isDemo?: boolean; // design-tour brief: never sent to the API
  createdAt?: string;
  updatedAt?: string;
}

export interface ComposingStep {
  label: string;
  detail: string;
  status: 'wait' | 'run' | 'done';
}

export type EntryKind = 'query' | 'answer' | 'insufficient' | 'notice' | 'blank';

export interface ManuscriptEntry {
  id: string;
  kind: EntryKind;
  queryText?: string;
  queryMeta?: {
    time: string;
    modeLabel?: string;
    hasContext?: boolean;
  };
  answerData?: {
    lead: string;
    sections: Array<{
      rn: string;
      h: string;
      paragraphs: string[];
    }>;
    thinNotice?: string;
    stamp: string;
  };
  noticeData?: {
    kick: string;
    paragraphs: string[];
    suggestions?: string[];
    action?: {
      label: string;
      actionKey: string;
      prefill?: string;
    };
    stamp?: string;
  };
  citations?: Citation[];
  artifact?: ArtifactData;
  createdAt: string;
}

export interface SessionData {
  id: string;
  num: string; // "01", "02"
  title: string;
  meta: string;
  kind: 'live' | 'demo'; // 'demo' = design-tour fixture, never persisted
  isDemo?: boolean;
  entries: ManuscriptEntry[];
  artifacts: ArtifactData[];
  briefCount: number;
  activeBrief?: GrowthBriefData;
  noteSeq: number;
  plateSeq: number;
  createdAt: string;
  updatedAt: string;
}

export interface SystemConfigResponse {
  app_name: string;
  environment: string;
  database: {
    connected: boolean;
    has_vector_extension: boolean;
  };
  providers: {
    primary: string;
    active_cloud: string;
    ollama_url: string;
    agent_gateway_url: string;
  };
}

export interface HealthReadyResponse {
  status: 'ready' | 'not_ready';
  components: {
    database: { status: string; type?: string; error?: string };
    ollama: { status: string; version?: string; code?: number };
    agent_gateway: { status: string; code?: number };
  };
  timestamp: number;
}

export interface ToastMessage {
  id: string;
  message: string;
}
