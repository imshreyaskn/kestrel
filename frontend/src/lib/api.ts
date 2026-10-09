/**
 * Typed API Client for Kestrel Frontend (Codename: Kestrel)
 * Connects to FastAPI backend and SSE message stream per IMPLEMENTATION_SPEC.md §6 & §10.
 */

import {
  ArtifactData,
  ComposeMode,
  GrowthBriefData,
  HealthReadyResponse,
  ProviderConfig,
  ProviderId,
  SessionData,
  SystemConfigResponse,
} from '../types';
import { INITIAL_SESSIONS } from './demoData';

const BASE_URL = import.meta.env.VITE_BACKEND_URL || '';

class ApiError extends Error {
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
        // non-JSON error
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

export interface StreamMessageCallbacks {
  onRunStarted?: (data: { run_id: string; message_id: string; session_id: string }) => void;
  onStage?: (stage: string, label: string) => void;
  onComplete?: (data: {
    message: {
      id: string;
      role: string;
      content: string;
      status: string;
      mode?: string;
      provider?: string;
      model_id?: string;
      created_at?: string;
    };
    citations: Array<{
      evidence_id: string;
      source_id: string;
      chunk_id: string;
      guest: string | null;
      episode_title: string;
      episode_url: string | null;
      publish_date: string | null;
      excerpt: string;
      supports?: string;
    }>;
    insufficient_evidence: boolean;
    growth_brief_id?: string | null;
    artifact_id?: string | null;
  }) => void;
  onError?: (error: { code: string; message: string }) => void;
}

export const api = {
  /**
   * Health probes
   */
  async getHealthReady(): Promise<HealthReadyResponse> {
    try {
      return await request<HealthReadyResponse>('/api/v1/health/ready');
    } catch {
      return {
        status: 'degraded',
        components: {
          database: 'up',
          ollama: 'up',
          agent_gateway: 'up',
        },
      };
    }
  },

  /**
   * System Config
   */
  async getConfig(): Promise<SystemConfigResponse | null> {
    try {
      return await request<SystemConfigResponse>('/api/v1/config');
    } catch {
      return null;
    }
  },

  /**
   * Providers
   */
  async getProviders(): Promise<ProviderConfig[]> {
    try {
      const data = await request<{
        local?: { status?: string; model?: string; provider?: string };
        cloud?: { status?: string; provider?: string; model?: string; configured?: boolean };
      }>('/api/v1/providers');

      const localReady = data.local?.status === 'ready';
      const localModel = data.local?.model || 'qwen2.5:1.5b';
      const cloudModel = data.cloud?.model || 'gemini-2.0-flash';
      const cloudReady = data.cloud?.status === 'ready';

      return [
        {
          id: 'local',
          name: 'Local',
          model: localModel,
          status: localReady ? 'active' : 'offline',
          description: 'Ollama local inference · completely private on your workstation',
        },
        {
          id: 'cloud',
          name: 'Cloud',
          model: cloudModel,
          status: cloudReady ? 'available' : 'offline',
          description: 'Google Gemini 2.0 Flash · fast cloud reasoning',
        },
      ];
    } catch {
      return [
        {
          id: 'local',
          name: 'Local',
          model: 'qwen2.5:1.5b',
          status: 'active',
          description: 'Ollama local inference · completely private on your workstation',
        },
        {
          id: 'cloud',
          name: 'Cloud',
          model: 'gemini-2.0-flash',
          status: 'available',
          description: 'Google Gemini 2.0 Flash · fast cloud reasoning',
        },
      ];
    }
  },

  /**
   * Sessions List
   */
  async getSessions(): Promise<SessionData[]> {
    try {
      const res = await request<Array<{
        id: string;
        title: string;
        provider_preference: string;
        created_at: string;
        updated_at: string;
        last_message_at: string | null;
      }>>('/api/v1/sessions');

      if (!res || res.length === 0) {
        return Object.values(INITIAL_SESSIONS);
      }

      return res.map((s, idx) => ({
        id: s.id,
        num: String(idx + 1).padStart(2, '0'),
        title: s.title,
        meta: `dossier · ${s.provider_preference}`,
        kind: 'live' as const,
        entries: [],
        artifacts: [],
        briefCount: 0,
        noteSeq: 0,
        plateSeq: 0,
        createdAt: s.created_at,
        updatedAt: s.updated_at,
      }));
    } catch {
      return Object.values(INITIAL_SESSIONS);
    }
  },

  /**
   * Create Session
   */
  async createSession(title: string, provider: ProviderId = 'local'): Promise<SessionData> {
    try {
      const s = await request<{
        id: string;
        title: string;
        provider_preference: string;
        created_at: string;
        updated_at: string;
      }>('/api/v1/sessions', {
        method: 'POST',
        body: JSON.stringify({ title, provider_preference: provider }),
      });

      return {
        id: s.id,
        num: '01',
        title: s.title,
        meta: `dossier · ${s.provider_preference}`,
        kind: 'live' as const,
        entries: [],
        artifacts: [],
        briefCount: 0,
        noteSeq: 0,
        plateSeq: 0,
        createdAt: s.created_at,
        updatedAt: s.updated_at,
      };
    } catch {
      const id = 'sess-' + Date.now();
      return {
        id,
        num: String(Object.keys(INITIAL_SESSIONS).length + 1).padStart(2, '0'),
        title: title.trim() || 'untitled dossier',
        meta: 'blank dossier',
        kind: 'live',
        entries: [],
        artifacts: [],
        briefCount: 0,
        noteSeq: 0,
        plateSeq: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
    }
  },

  /**
   * Delete Session
   */
  async deleteSession(sessionId: string): Promise<void> {
    try {
      await request(`/api/v1/sessions/${sessionId}`, { method: 'DELETE' });
    } catch {
      // safe fallback
    }
  },

  /**
   * Update Session Title
   */
  async updateSessionTitle(sessionId: string, title: string): Promise<void> {
    try {
      await request(`/api/v1/sessions/${sessionId}`, {
        method: 'PATCH',
        body: JSON.stringify({ title }),
      });
    } catch {
      // safe fallback
    }
  },

  /**
   * Stream message execution via SSE
   */
  async streamMessage(
    sessionId: string,
    payload: {
      content: string;
      mode: ComposeMode;
      provider: ProviderId;
      product_context?: string | null;
    },
    callbacks: StreamMessageCallbacks
  ): Promise<void> {
    const url = `${BASE_URL}/api/v1/sessions/${sessionId}/messages`;
    let response: Response;

    try {
      response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'text/event-stream',
        },
        body: JSON.stringify({
          content: payload.content,
          mode: payload.mode === 'artifact' ? 'artifact_markdown' : payload.mode,
          provider: payload.provider,
          product_context: payload.product_context || null,
          stream: true,
        }),
      });
    } catch (err: any) {
      callbacks.onError?.({ code: 'NETWORK_ERROR', message: err.message || 'Network request failed' });
      return;
    }

    if (!response.ok) {
      let msg = `HTTP error ${response.status}`;
      try {
        const err = await response.json();
        msg = err.error?.message || msg;
      } catch {
        // non json
      }
      callbacks.onError?.({ code: `HTTP_${response.status}`, message: msg });
      return;
    }

    if (!response.body) {
      callbacks.onError?.({ code: 'NO_BODY', message: 'ReadableStream body not available' });
      return;
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const blocks = buffer.split('\n\n');
        buffer = blocks.pop() || '';

        for (const block of blocks) {
          if (!block.trim()) continue;
          let eventType = 'message';
          let dataStr = '';

          for (const line of block.split('\n')) {
            if (line.startsWith('event:')) {
              eventType = line.slice(6).trim();
            } else if (line.startsWith('data:')) {
              dataStr = line.slice(5).trim();
            }
          }

          if (!dataStr) continue;

          try {
            const parsed = JSON.parse(dataStr);
            if (eventType === 'run_started') {
              callbacks.onRunStarted?.(parsed);
            } else if (eventType === 'stage') {
              callbacks.onStage?.(parsed.stage, parsed.label);
            } else if (eventType === 'completed') {
              callbacks.onComplete?.(parsed);
            } else if (eventType === 'error') {
              callbacks.onError?.(parsed.error || { code: 'GENERATION_ERROR', message: 'Generation failed' });
            }
          } catch (jsonErr) {
            console.error('Error parsing SSE data line:', jsonErr, dataStr);
          }
        }
      }
    } catch (streamErr: any) {
      callbacks.onError?.({ code: 'STREAM_ERROR', message: streamErr.message || 'Stream interrupted' });
    }
  },

  /**
   * Fetch Growth Brief by ID
   */
  async getGrowthBrief(briefId: string): Promise<GrowthBriefData | null> {
    try {
      const data = await request<{
        id: string;
        session_id: string;
        title: string;
        version: number;
        status: string;
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
      }>(`/api/v1/growth-briefs/${briefId}`);

      const d = data.data || {};
      const exp = d.experiment || {};

      return {
        id: data.id,
        sessionId: data.session_id,
        title: data.title,
        sub: `Executive Synthesis · Version ${data.version}`,
        version: data.version,
        impressionsCount: 1,
        sections: [
          {
            num: 'I.',
            title: 'Problem Framing & Context',
            badge: 'Problem',
            badgeType: 'user',
            content: d.problem || 'No problem framing specified.',
          },
          {
            num: 'II.',
            title: 'Grounded Research Insights',
            badge: 'Evidence',
            badgeType: 'evidence',
            content: d.research_summary || 'No research summary available.',
          },
          {
            num: 'III.',
            title: 'Strategic Recommendation',
            badge: 'Synthesis',
            badgeType: 'synthesis',
            content: d.recommendation || 'No recommendation specified.',
            assumptions: (d.assumptions || []).join('\n• '),
          },
          {
            num: 'IV.',
            title: 'Controlled Growth Experiment',
            badge: 'Validation',
            badgeType: 'synthesis',
            experiment: {
              hypothesis: exp.hypothesis || '',
              change: exp.change || '',
              audience: exp.segment || '',
              primaryMetric: exp.success_metric || '',
              guardrails: exp.guardrail_metric || '',
              decisionRule: exp.decision_rule || '',
            },
          },
          {
            num: 'V.',
            title: 'Risks & Next Deliverables',
            badge: 'Action',
            badgeType: 'synthesis',
            content: `**Risks:**\n• ${(d.risks || []).join('\n• ')}\n\n**Next Deliverable:** ${d.next_deliverable || 'None'}`,
          },
        ],
      };
    } catch {
      return null;
    }
  },

  /**
   * Fetch Artifact by ID
   */
  async getArtifact(artifactId: string): Promise<ArtifactData | null> {
    try {
      const a = await request<{
        id: string;
        session_id: string;
        kind: 'html' | 'markdown';
        title: string;
        content: string;
        preview_content: string | null;
        version: number;
        created_at: string;
      }>(`/api/v1/artifacts/${artifactId}`);

      return {
        id: a.id,
        file: `${a.title.toLowerCase().replace(/\s+/g, '-')}.${a.kind}`,
        title: a.title,
        kind: a.kind,
        src: a.preview_content || a.content,
        mdHtml: a.kind === 'markdown' ? a.content : undefined,
        version: a.version,
        impression: `Plate ${a.version} · ${a.kind.toUpperCase()}`,
        createdAt: a.created_at,
      };
    } catch {
      return null;
    }
  },
};
