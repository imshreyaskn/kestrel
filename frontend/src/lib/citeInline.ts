/**
 * Citation inlining & manuscript entry construction.
 *
 * The backend's validated answers reference request-scoped evidence labels
 * ([E1], [E2]…) inline. This module:
 * - maps backend citation records to margin-note citations with unique DOM ids
 *   (`sn-{sessionId}-{messageId}-{evidenceId}` per the mission contract);
 * - segments answer text so the manuscript renderer can replace [E1]/[1]
 *   markers with interactive .sn-ref buttons;
 * - splits model answers into a lead paragraph + roman-numeral sections.
 */

import { Citation, ManuscriptEntry } from '../types';
import { CitationRecord, MessageRecord } from './api';

const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII'];

export function buildCitations(
  sessionId: string,
  messageId: string,
  records: CitationRecord[]
): Citation[] {
  return (records || [])
    .map((c, idx) => {
      const parsedNum = Number(c.evidence_id.replace(/\D/g, ''));
      const num = Number.isFinite(parsedNum) && parsedNum > 0 ? parsedNum : (idx + 1);
      return {
        ...c,
        num,
      };
    })
    .sort((a, b) => a.num - b.num)
    .map((c) => ({
      id: `sn-${sessionId}-${messageId}-${c.evidence_id}`,
      refIndex: c.num,
      evidenceId: c.evidence_id,
      speaker: c.guest || 'Lenny’s Podcast guest',
      episodeTitle: c.episode_title,
      episodeUrl: c.episode_url || undefined,
      quote: c.excerpt, // verbatim, read from the stored transcript chunk
      provenanceStamp: `[${c.evidence_id}] ${c.supports || 'supporting passage'}`,
      chunkId: c.chunk_id,
      retrievalRank: c.retrieval_rank ?? c.num,
      rrfScore: c.rrf_score ?? undefined,
      denseRank: c.dense_rank ?? undefined,
      sparseRank: c.sparse_rank ?? undefined,
    }));
}

// ---------------------------------------------------------------------------
// Text segmentation: [E1] markers -> citation references
// ---------------------------------------------------------------------------
export type TextSegment = string | { refIndex: number; evidenceId: string };

// Strictly match [E1] or multi-label clusters like [E1, E2].
// Bare [1] is intentionally eliminated to avoid converting normal bracketed prose into false-positive beads (CIT6).
const MARKER_RE = /\[(E\d+(?:\s*,\s*E\d+)*)\]/g;

/**
 * Split a text run around citation markers. Strict `[E{n}]` markers resolve by
 * evidence_id number directly. Unknown markers stay as literal text (server-validated
 * answers should never produce them, but we never silently drop content).
 */
export function segmentTextWithCitations(text: string, citations: Citation[]): TextSegment[] {
  const segments: TextSegment[] = [];
  let lastIndex = 0;
  MARKER_RE.lastIndex = 0;

  const pushText = (str: string) => {
    if (!str) return;
    if (segments.length > 0 && typeof segments[segments.length - 1] === 'string') {
      segments[segments.length - 1] += str;
    } else {
      segments.push(str);
    }
  };

  let match: RegExpExecArray | null;
  while ((match = MARKER_RE.exec(text)) !== null) {
    if (match.index > lastIndex) {
      pushText(text.substring(lastIndex, match.index));
    }
    const rawTokens = match[1].split(',').map((t) => t.trim());
    for (const token of rawTokens) {
      const num = Number(token.slice(1));
      const evidenceId = token;
      const cit = citations.find(
        (c) => c.refIndex === num || c.evidenceId === evidenceId || c.id.endsWith(`-${evidenceId}`)
      );

      if (cit) {
        segments.push({ refIndex: cit.refIndex, evidenceId });
      } else {
        pushText(`[${token}]`);
      }
    }
    lastIndex = MARKER_RE.lastIndex;
  }
  if (lastIndex < text.length) {
    pushText(text.substring(lastIndex));
  }
  return segments.length > 0 ? segments : [text];
}

// ---------------------------------------------------------------------------
// Answer content -> editorial sections
// ---------------------------------------------------------------------------
type AnswerData = NonNullable<ManuscriptEntry['answerData']>;

export function buildAnswerData(content: string, stamp: string): AnswerData {
  const lines = content.replace(/\r\n/g, '\n').split('\n');
  const leadLines: string[] = [];
  const sections: AnswerData['sections'] = [];
  let currentParagraphs: string[] = [];
  let paragraphLines: string[] = [];
  let hasCompletedLead = false;

  const flushParagraph = () => {
    if (paragraphLines.length > 0) {
      currentParagraphs.push(paragraphLines.join(' '));
      paragraphLines = [];
    }
  };

  for (const rawLine of lines) {
    const line = rawLine.trim();

    const isNumberedHeading =
      /^(\d+\.|\b[IVXLCDM]+\.)\s+(.+)$/i.test(line) ||
      /^\*\*(\d+\.|\b[IVXLCDM]+\.)\s*([^*]+)\*\*$/i.test(line) ||
      /^(\d+|\b[IVXLCDM]+)\*\*\s*(.+)$/i.test(line) ||
      /^\*\*(\d+|\b[IVXLCDM]+)\.?\*\*\s*(.+)$/i.test(line) ||
      /^(\d+\.|\b[IVXLCDM]+\.)\s*\*\*(.+)\*\*?$/i.test(line);

    const isSectionHeading =
      (sections.length > 0 && /^#{1,4}\s+/.test(line)) ||
      /^#{2,4}\s+/.test(line) ||
      isNumberedHeading;

    if (isSectionHeading) {
      flushParagraph();
      currentParagraphs = [];
      let headingText = line
        .replace(/^#{1,4}\s+/, '')
        .replace(/^\*+|\*+$/g, '')
        .trim();
      let remainingParagraph = '';
      const colonIdx = headingText.indexOf(':');
      if (colonIdx > 0 && colonIdx < 80 && isNumberedHeading && !/^#{1,4}\s+/.test(line)) {
        remainingParagraph = headingText.slice(colonIdx + 1).trim();
        headingText = headingText.slice(0, colonIdx).trim();
      }

      const rnMatch = headingText.match(/^([IVXLCDM]+|\d+)(?:\.|\*\*|\.\s*\*+|\s*\*+)?\s*(.*)$/i);
      const rn = rnMatch
        ? (isNaN(Number(rnMatch[1]))
            ? rnMatch[1].toUpperCase()
            : (ROMAN[Number(rnMatch[1]) - 1] ?? rnMatch[1]))
        : (ROMAN[sections.length] ?? '§');
      const rawH = rnMatch ? rnMatch[2].trim() : headingText.trim();
      const h = rawH.replace(/^\*+|\*+$/g, '').trim();

      sections.push({
        rn,
        h,
        paragraphs: currentParagraphs,
      });
      hasCompletedLead = true;

      if (remainingParagraph) {
        paragraphLines.push(
          remainingParagraph
            .replace(/^\*\*\s+/, '')
            .replace(/\s+\*\*$/, '')
        );
      }
      continue;
    }

    if (!line) {
      if (!hasCompletedLead && leadLines.length > 0) {
        hasCompletedLead = true;
      }
      flushParagraph();
      continue;
    }

    // Clean dangling or orphaned markdown delimiters at line boundaries (e.g. "** Relying on..." -> "Relying on...")
    const cleanedLine = line
      .replace(/^\*\*\s+/, '')
      .replace(/\s+\*\*$/, '');

    // Lead block: first paragraph before any headings or paragraph breaks
    if (!hasCompletedLead) {
      leadLines.push(cleanedLine.replace(/^#\s*/, ''));
      continue;
    }

    // Body paragraphs following lead
    if (sections.length === 0) {
      sections.push({
        rn: '',
        h: '',
        paragraphs: currentParagraphs,
      });
    }

    paragraphLines.push(cleanedLine);
  }
  flushParagraph();

  const titled: AnswerData['sections'] = sections.filter((s) => s.h || s.paragraphs.length > 0);
  titled.forEach((sec, idx) => {
    if (!sec.rn && sec.h) sec.rn = ROMAN[idx] ?? '§';
  });

  const lead = leadLines.join(' ');
  return {
    lead,
    sections: titled,
    stamp,
  };
}

// ---------------------------------------------------------------------------
// Message history -> manuscript entries
// ---------------------------------------------------------------------------
export function entriesFromHistory(sessionId: string, messages: MessageRecord[]): ManuscriptEntry[] {
  const entries: ManuscriptEntry[] = [];

  for (const m of messages) {
    const time = new Date(m.created_at).toLocaleTimeString([], {
      hour: 'numeric',
      minute: '2-digit',
    });
    const modeLabel = modeToLabel(m.workflow_mode);

    if (m.role === 'user') {
      entries.push({
        id: m.id,
        kind: 'query',
        queryText: m.content,
        queryMeta: { time, modeLabel },
        createdAt: m.created_at,
      });
      continue;
    }

    if (m.status === 'cancelled') {
      // Struck runs are never persisted as answers; nothing to show.
      continue;
    }

    if (m.status === 'failed') {
      entries.push({
        id: m.id,
        kind: 'insufficient',
        noticeData: {
          kick: 'A previous run failed',
          paragraphs: [
            m.content ||
              'This run failed before it could be bound. Nothing unsourced was kept.',
          ],
          stamp: `${m.error_code || 'GENERATION_FAILED'} · ${m.model_id || m.provider || ''}`,
        },
        createdAt: m.created_at,
      });
      continue;
    }

    if (m.status !== 'complete' || !m.content) continue;

    const citations = buildCitations(sessionId, m.id, m.citations || []);
    const stamp = `Set in ${m.model_id || m.provider || 'the archive'} · ${
      m.provider || ''
    } — ${citations.length} citation${citations.length === 1 ? '' : 's'} verified`;
    const ansData = buildAnswerData(m.content, stamp);
    const writingPath = m.metadata?.writing_path ? String(m.metadata.writing_path) : undefined;
    entries.push({
      id: m.id,
      kind: 'answer',
      answerData: { ...ansData, writingPath },
      citations,
      createdAt: m.created_at,
    });
  }

  return entries;
}

export function modeToLabel(mode?: string | null): string {
  switch (mode) {
    case 'growth_brief':
      return 'Brief';
    case 'essay':
      return 'Essay';
    case 'artifact_markdown':
    case 'artifact_html':
      return 'Plate';
    default:
      return 'Query';
  }
}
