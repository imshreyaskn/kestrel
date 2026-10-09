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
  id: string; // e.g. 'sn-1' or UUID
  refIndex: number; // sequential number 1, 2, 3...
  speaker: string;
  affiliation?: string;
  episodeTitle: string;
  episodeUrl?: string;
  quote: string;
  provenanceStamp: string; // e.g. "Chunk 142 · rank №1 · semantic 0.61"
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

export interface GrowthBriefSection {
  num: string; // "I.", "II.", etc.
  title: string;
  badge?: string;
  badgeType?: 'user' | 'evidence' | 'synthesis';
  content?: string;
  evidenceItems?: Array<{
    text: string;
    refIndex: number;
  }>;
  assumptions?: string;
  experiment?: {
    hypothesis: string;
    change: string;
    audience: string;
    primaryMetric: string;
    guardrails: string;
    decisionRule: string;
  };
}

export interface GrowthBriefData {
  id: string;
  sessionId: string;
  title: string;
  sub: string;
  version: number;
  impressionsCount: number;
  sections: GrowthBriefSection[];
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
      bodyHtml: string;
      citedRefIndices: number[];
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
  kind: 'live' | 'pricing' | 'empty';
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
  status: 'ready' | 'degraded' | 'unhealthy';
  components: {
    database: string;
    ollama: string;
    agent_gateway: string;
  };
}

export interface ToastMessage {
  id: string;
  message: string;
}
