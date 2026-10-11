/**
 * Typed API Client for Kestrel Frontend (Codename: Kestrel)
 * Binds to the live FastAPI backend and SSE message stream per
 * IMPLEMENTATION_SPEC.md §6 & §10 and the live server contracts.
 *
 * Contract rules honored here:
 * - No mock/demo fallbacks in the production flow: failures THROW typed
 *   ApiErrors so the UI can surface honest states instead of fake data.
 * - SSE parsing tolerates events split across network chunks and
 *   multi-line `data:` fields (SPEC §12.4).
 * - The stream handle exposes cancel() which cancels the fetch AND the
 *   response body reader, triggering the backend's GeneratorExit path that
 *   marks the assistant message `cancelled` (SPEC §6.5).
 */

import {
  ArtifactData,
  ArtifactKind,
  ComposeMode,
  GrowthBriefData,
  HealthReadyResponse,
  ProviderConfig,
  ProviderId,
  SessionData,
} from '../types';

const BASE_URL = import.meta.env.VITE_BACKEND_URL || '';

// ---------------------------------------------------------------------------
// Typed backend records (wire format, snake_case as served)
// ---------------------------------------------------------------------------
export interface SessionRecord {
  id: string;
  title: string;
  provider_preference: string;
  created_at: string;
  updated_at: string;
  last_message_at: string | null;
}

export interface CitationRecord {
  evidence_id: string;
  source_id: string;
  chunk_id: string;
  guest: string | null;
  episode_title: string;
  episode_url: string | null;
  publish_date: string | null;
  excerpt: string;
  supports?: string | null;
  retrieval_rank?: number | null;
  rrf_score?: number | null;
  dense_rank?: number | null;
  sparse_rank?: number | null;
}

export interface MessageRecord {
  id: string;
  session_id: string;
  role: 'user' | 'assistant';
  content: string;
  status: 'pending' | 'complete' | 'failed' | 'cancelled';
  workflow_mode?: string | null;
  provider?: string | null;
  model_id?: string | null;
  error_code?: string | null;
  created_at: string;
  completed_at?: string | null;
  citations?: CitationRecord[];
  metadata?: Record<string, any> | null;
}

export interface GrowthBriefRecord {
  id: string;
  session_id: string;
  title: string;
  version: number;
  status: string;
  product_context: string | null;
  data: {
    problem?: string;
    research_summary?: string;
    recommendation?: string;
    assumptions?: string[];
    experiment?: {
      hypothesis?: string;
      change?: string;
      segment?: string;
      success_metric?: string;
      guardrail_metric?: string;
      decision_rule?: string;
    };
    risks?: string[];
    next_deliverable?: string;
  };
  created_at: string;
  updated_at: string;
}

export interface ArtifactRecord {
  id: string;
  session_id: string;
  kind: 'html' | 'markdown';
  title: string;
  content: string;
  preview_content: string | null;
  version: number;
  created_at: string;
  updated_at: string;
}

export interface CompletedStreamData {
  message: {
    id: string;
    session_id: string;
    role: string;
    status: string;
    content: string;
    mode?: string | null;
    provider?: string | null;
    model_id?: string | null;
    created_at?: string | null;
    completed_at?: string | null;
    metadata?: Record<string, any> | null;
  };
  citations: CitationRecord[];
  insufficient_evidence: boolean;
  growth_brief_id?: string | null;
  artifact_id?: string | null;
}

export interface StreamError {
  code: string;
  message: string;
}

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------
export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: unknown
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const url = `${BASE_URL}${path}`;
  const headers = {
    'Content-Type': 'application/json',
    ...(options?.headers || {}),
  };

  try {
    const res = await fetch(url, { ...options, headers });
    if (!res.ok) {
      let errBody: { error?: { code?: string; message?: string } } = {};
      try {
        errBody = await res.json();
      } catch {
        // non-JSON error body
      }
      throw new ApiError(
        res.status,
        errBody.error?.code || `HTTP_${res.status}`,
        errBody.error?.message || `Request failed with status ${res.status}`
      );
    }
    return (await res.json()) as T;
  } catch (err) {
    if (err instanceof ApiError) throw err;
    throw new ApiError(0, 'NETWORK_ERROR', (err as Error).message || 'Network request failed');
  }
}

// ---------------------------------------------------------------------------
// SSE parsing (pure, exported for tests; SPEC §12.4)
// ---------------------------------------------------------------------------
export interface SSEEvent {
  event: string;
  data: string;
}

/**
 * Extract complete SSE events from a buffered chunk stream. Tolerates:
 * - events split across network chunks (returns the unparsed remainder)
 * - multi-line `data:` fields (joined with \n per the SSE spec)
 * - \r\n line endings and comment lines (':')
 */
export function extractSSEEvents(buffer: string): { events: SSEEvent[]; remainder: string } {
  const events: SSEEvent[] = [];
  const normalized = buffer.replace(/\r\n/g, '\n');
  const blocks = normalized.split('\n\n');
  const remainder = blocks.pop() ?? '';

  for (const block of blocks) {
    if (!block.trim()) continue;
    let eventType = 'message';
    const dataLines: string[] = [];
    for (const line of block.split('\n')) {
      if (line.startsWith(':')) continue;
      if (line.startsWith('event:')) {
        eventType = line.slice(6).trim();
      } else if (line.startsWith('data:')) {
        dataLines.push(line.slice(5).replace(/^ /, ''));
      }
    }
    if (dataLines.length === 0) continue;
    events.push({ event: eventType, data: dataLines.join('\n') });
  }

  return { events, remainder };
}

// ---------------------------------------------------------------------------
// Mapping helpers (backend wire format -> UI domain types)
// ---------------------------------------------------------------------------
const pad2 = (n: number) => String(n).padStart(2, '0');

function sessionRecordToData(s: SessionRecord, index = 0): SessionData {
  return {
    id: s.id,
    num: pad2(Math.max(0, index) + 1),
    title: s.title,
    meta: `dossier · ${s.provider_preference}`,
    kind: 'live',
    isDemo: false,
    entries: [],
    artifacts: [],
    briefCount: 0,
    noteSeq: 0,
    plateSeq: 0,
    createdAt: s.created_at,
    updatedAt: s.updated_at,
  };
}

function artifactRecordToData(a: ArtifactRecord): ArtifactData {
  return {
    id: a.id,
    file: `${a.title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')}.${a.kind}`,
    title: a.title,
    kind: a.kind,
    src: a.preview_content || a.content,
    mdHtml: a.kind === 'markdown' ? a.content : undefined,
    version: a.version,
    impression: `Plate ${a.version} · ${a.kind.toUpperCase()}`,
    createdAt: a.created_at,
  };
}

export function briefRecordToData(b: GrowthBriefRecord): GrowthBriefData {
  const d = b.data || {};
  const exp = d.experiment || {};
  return {
    id: b.id,
    sessionId: b.session_id,
    title: b.title,
    version: b.version,
    status: b.status,
    isDemo: false,
    productContext: b.product_context,
    problem: d.problem ?? '',
    researchSummary: d.research_summary ?? '',
    recommendation: d.recommendation ?? '',
    assumptions: (d.assumptions ?? []).join('\n'),
    experiment: {
      hypothesis: exp.hypothesis ?? '',
      change: exp.change ?? '',
      segment: exp.segment ?? '',
      success_metric: exp.success_metric ?? '',
      guardrail_metric: exp.guardrail_metric ?? '',
      decision_rule: exp.decision_rule ?? '',
    },
    risks: (d.risks ?? []).join('\n'),
    nextDeliverable: d.next_deliverable ?? '',
    createdAt: b.created_at,
    updatedAt: b.updated_at,
  };
}

export function briefDataToRecordPatch(brief: GrowthBriefData): { title: string; data: GrowthBriefRecord['data'] } {
  const splitLines = (s: string) =>
    s
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean);
  return {
    title: brief.title,
    data: {
      problem: brief.problem,
      research_summary: brief.researchSummary,
      recommendation: brief.recommendation,
      assumptions: splitLines(brief.assumptions),
      experiment: {
        hypothesis: brief.experiment.hypothesis,
        change: brief.experiment.change,
        segment: brief.experiment.segment,
        success_metric: brief.experiment.success_metric,
        guardrail_metric: brief.experiment.guardrail_metric,
        decision_rule: brief.experiment.decision_rule,
      },
      risks: splitLines(brief.risks),
      next_deliverable: brief.nextDeliverable,
    },
  };
}

// ---------------------------------------------------------------------------
// Streaming message submission
// ---------------------------------------------------------------------------
export interface StreamMessagePayload {
  content: string;
  mode: ComposeMode;
  format: ArtifactKind;
  provider: ProviderId;
  productContext?: string | null;
}

export interface StreamMessageCallbacks {
  onRunStarted?: (data: { run_id: string; message_id: string; session_id: string }) => void;
  onStage?: (stage: string, label: string) => void;
  onComplete?: (data: CompletedStreamData) => void;
  onError?: (error: StreamError) => void;
  /** Invoked when the user strikes the run (reader.cancel()). */
  onCancelled?: () => void;
}

export interface StreamHandle {
  cancel: () => void;
}

export function mapComposeRequest(payload: StreamMessagePayload) {
  // Backend enum mapping: the UI's unified 'artifact' mode maps to
  // artifact_markdown / artifact_html, and artifact_format must only be
  // sent for artifact modes (backend rejects other combinations).
  const isArtifact = payload.mode === 'artifact';
  const backendMode =
    isArtifact
      ? payload.format === 'html'
        ? 'artifact_html'
        : 'artifact_markdown'
      : payload.mode;

  return {
    content: payload.content,
    mode: backendMode,
    provider: payload.provider,
    cloud_provider: null,
    model_id: null,
    artifact_format: isArtifact ? payload.format : null,
    product_context: payload.productContext || null,
    stream: true,
  };
}

function streamMessage(
  sessionId: string,
  payload: StreamMessagePayload,
  callbacks: StreamMessageCallbacks
): StreamHandle {
  const url = `${BASE_URL}/api/v1/sessions/${sessionId}/messages`;
  const controller = new AbortController();
  let cancelled = false;
  let reader: ReadableStreamDefaultReader<Uint8Array> | null = null;

  const run = async () => {
    let response: Response;
    try {
      response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'text/event-stream',
        },
        body: JSON.stringify(mapComposeRequest(payload)),
        signal: controller.signal,
      });
    } catch (err) {
      if (cancelled) {
        callbacks.onCancelled?.();
        return;
      }
      callbacks.onError?.({
        code: 'NETWORK_ERROR',
        message: (err as Error).message || 'Could not reach the archive',
      });
      return;
    }

    if (!response.ok) {
      let msg = `The archive answered HTTP ${response.status}`;
      let code = `HTTP_${response.status}`;
      try {
        const err = await response.json();
        msg = err.error?.message || msg;
        code = err.error?.code || code;
      } catch {
        // non-JSON error body
      }
      callbacks.onError?.({ code, message: msg });
      return;
    }

    if (!response.body) {
      callbacks.onError?.({ code: 'NO_BODY', message: 'The stream body is unavailable' });
      return;
    }

    reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        const { events, remainder } = extractSSEEvents(buffer);
        buffer = remainder;

        for (const evt of events) {
          let parsed: any;
          try {
            parsed = JSON.parse(evt.data);
          } catch {
            continue; // malformed frame; keep the stream alive
          }
          if (evt.event === 'run_started') {
            callbacks.onRunStarted?.(parsed);
          } else if (evt.event === 'stage') {
            callbacks.onStage?.(parsed.stage, parsed.label || parsed.stage);
          } else if (evt.event === 'completed') {
            callbacks.onComplete?.(parsed as CompletedStreamData);
          } else if (evt.event === 'error') {
            callbacks.onError?.(
              parsed.error || { code: 'GENERATION_ERROR', message: 'Generation failed' }
            );
          }
        }
      }
      if (cancelled) {
        callbacks.onCancelled?.();
      }
    } catch (streamErr) {
      if (cancelled) {
        callbacks.onCancelled?.();
        return;
      }
      callbacks.onError?.({
        code: 'STREAM_ERROR',
        message: (streamErr as Error).message || 'The stream was interrupted',
      });
    }
  };

  void run();

  return {
    cancel: () => {
      cancelled = true;
      controller.abort();
      reader?.cancel().catch(() => undefined);
    },
  };
}

// ---------------------------------------------------------------------------
// Public API surface
// ---------------------------------------------------------------------------
export const api = {
  /**
   * Health readiness probe. Component names come straight from the live
   * backend (database / ollama / agent_gateway).
   */
  async getHealthReady(): Promise<HealthReadyResponse> {
    return request<HealthReadyResponse>('/api/v1/health/ready');
  },

  /**
   * Live provider registry (config.py route shape, the mounted contract):
   * { local: {provider, available, version, model}, cloud: {configured_provider, gemini|anthropic|openai} }.
   * Network failure maps to honest offline statuses — never to fake readiness.
   */
  async getProviders(): Promise<ProviderConfig[]> {
    let rec: {
      local?: { provider?: string; available?: boolean; version?: string; model?: string; status?: string; error?: string };
      cloud?: {
        configured_provider?: string;
        gemini?: { configured?: boolean; model?: string };
        anthropic?: { configured?: boolean; model?: string };
        openai?: { configured?: boolean; model?: string };
        provider?: string;
        status?: string;
        model?: string;
        configured?: boolean;
      };
    };
    try {
      rec = await request<typeof rec>('/api/v1/providers');
    } catch {
      return [
        {
          id: 'local',
          name: 'Local',
          model: '—',
          status: 'offline',
          description: 'Ollama local inference · unreachable',
        },
        {
          id: 'cloud',
          name: 'Cloud',
          model: '—',
          status: 'offline',
          description: 'Cloud reasoning · unreachable',
        },
      ];
    }

    const localAvailable =
      rec.local?.available === true || rec.local?.status === 'ready';
    const localModel = rec.local?.model || 'local model';

    const cloudKey =
      rec.cloud?.configured_provider || rec.cloud?.provider || 'gemini';
    const cloudBlock = (rec.cloud as Record<string, any> | undefined)?.[cloudKey];
    const cloudModel =
      cloudBlock?.model || rec.cloud?.model || `${cloudKey} model`;
    const cloudConfigured =
      cloudBlock?.configured === true ||
      rec.cloud?.configured === true ||
      rec.cloud?.status === 'configured';

    return [
      {
        id: 'local',
        name: 'Local',
        model: localModel,
        status: localAvailable ? 'active' : 'offline',
        description: 'Ollama local inference · private on your workstation',
      },
      {
        id: 'cloud',
        name: 'Cloud',
        model: cloudModel,
        status: cloudConfigured ? 'available' : 'offline',
        description: `${cloudKey} cloud reasoning · runs only on your say-so`,
      },
    ];
  },

  /**
   * List real sessions from PostgreSQL. Returns [] when the archive has no
   * sessions — the caller shows the pristine frontmatter landing view.
   * Throws ApiError when the backend is unreachable.
   */
  async getSessions(): Promise<SessionData[]> {
    const res = await request<SessionRecord[]>('/api/v1/sessions');
    return (res || []).map(sessionRecordToData);
  },

  /**
   * Create a session in PostgreSQL. Throws on failure (no local fake).
   */
  async createSession(title: string, provider: ProviderId): Promise<SessionData> {
    const s = await request<SessionRecord>('/api/v1/sessions', {
      method: 'POST',
      body: JSON.stringify({ title, provider_preference: provider }),
    });
    return sessionRecordToData(s, 0);
  },

  /**
   * Rename a session via PATCH. Throws on failure so the caller can revert
   * the optimistic title.
   */
  async updateSessionTitle(sessionId: string, title: string): Promise<void> {
    await request<SessionRecord>(`/api/v1/sessions/${sessionId}`, {
      method: 'PATCH',
      body: JSON.stringify({ title }),
    });
  },

  async deleteSession(sessionId: string): Promise<void> {
    await request(`/api/v1/sessions/${sessionId}`, { method: 'DELETE' });
  },

  /**
   * Chronological message history with resolved citations (excerpt text read
   * from stored chunks, SPEC §5.6).
   */
  async getSessionMessages(sessionId: string): Promise<MessageRecord[]> {
    const res = await request<{ messages: MessageRecord[] }>(
      `/api/v1/sessions/${sessionId}/messages`
    );
    return res.messages || [];
  },

  streamMessage,

  /**
   * Fetch a growth brief by ID (session ownership enforced server-side).
   */
  async getGrowthBrief(briefId: string): Promise<GrowthBriefData> {
    const data = await request<GrowthBriefRecord>(`/api/v1/growth-briefs/${briefId}`);
    return briefRecordToData(data);
  },

  /**
   * Save a brief impression ("Bind impression") with optimistic concurrency:
   * sends expected_version; a stale version yields ApiError 409
   * (VERSION_CONFLICT) which the UI surfaces as a reload prompt.
   */
  async saveGrowthBrief(brief: GrowthBriefData): Promise<GrowthBriefData> {
    const patch = briefDataToRecordPatch(brief);
    const data = await request<GrowthBriefRecord>(`/api/v1/growth-briefs/${brief.id}`, {
      method: 'PATCH',
      body: JSON.stringify({
        title: patch.title,
        data: patch.data,
        expected_version: brief.version,
      }),
    });
    return briefRecordToData(data);
  },

  /**
   * Fetch an artifact by ID (ownership enforced server-side).
   */
  async getArtifact(artifactId: string): Promise<ArtifactData> {
    const a = await request<ArtifactRecord>(`/api/v1/artifacts/${artifactId}`);
    return artifactRecordToData(a);
  },

  /**
   * Revise an artifact with optimistic version check (409 on conflict).
   */
  async saveArtifact(
    artifactId: string,
    updates: { title?: string; content?: string },
    expectedVersion: number
  ): Promise<ArtifactData> {
    const a = await request<ArtifactRecord>(`/api/v1/artifacts/${artifactId}`, {
      method: 'PATCH',
      body: JSON.stringify({
        title: updates.title,
        content: updates.content,
        expected_version: expectedVersion,
      }),
    });
    return artifactRecordToData(a);
  },
};

export const isUuid = (value: string): boolean =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
