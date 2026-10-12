import { describe, it, expect } from 'vitest';
import {
  buildCitations,
  segmentTextWithCitations,
  buildAnswerData,
  entriesFromHistory,
  modeToLabel,
} from '../lib/citeInline';
import { CitationRecord, MessageRecord } from '../lib/api';

describe('buildCitations', () => {
  const records: CitationRecord[] = [
    {
      evidence_id: 'E3',
      source_id: 'src-3',
      chunk_id: 'chk-3',
      guest: 'Casey Winters',
      episode_title: 'Retention Curves',
      episode_url: null,
      publish_date: null,
      excerpt: 'Retention is the core of growth',
      supports: 'Cohort retention curves',
      retrieval_rank: 3,
      rrf_score: 0.017,
    },
    {
      evidence_id: 'E1',
      source_id: 'src-1',
      chunk_id: 'chk-1',
      guest: 'Rahul Vohra',
      episode_title: 'Superhuman PMF Engine',
      episode_url: 'https://example.com/ep1',
      publish_date: '2023-01-01',
      excerpt: 'Profile users who would be very disappointed',
      supports: 'PMF survey method',
      retrieval_rank: 1,
      rrf_score: 0.033,
    },
  ];

  it('builds unique DOM IDs, extracts E-number as refIndex, and sorts by rank', () => {
    // Input is in reversed order [E3, E1] — buildCitations must sort by evidence rank [E1, E3]
    const citations = buildCitations('sess-1', 'msg-1', records);
    expect(citations).toHaveLength(2);

    expect(citations[0]).toEqual({
      id: 'sn-sess-1-msg-1-E1',
      refIndex: 1,
      evidenceId: 'E1',
      speaker: 'Rahul Vohra',
      episodeTitle: 'Superhuman PMF Engine',
      episodeUrl: 'https://example.com/ep1',
      quote: 'Profile users who would be very disappointed',
      provenanceStamp: '[E1] PMF survey method',
      chunkId: 'chk-1',
      retrievalRank: 1,
      rrfScore: 0.033,
      denseRank: undefined,
      sparseRank: undefined,
    });

    expect(citations[1].id).toBe('sn-sess-1-msg-1-E3');
    expect(citations[1].refIndex).toBe(3);
    expect(citations[1].evidenceId).toBe('E3');
    expect(citations[1].provenanceStamp).toBe('[E3] Cohort retention curves');
    expect(citations[1].rrfScore).toBe(0.017);
  });
});

describe('segmentTextWithCitations', () => {
  const citations = [
    {
      id: 'sn-s1-m1-E1',
      refIndex: 1,
      evidenceId: 'E1',
      speaker: 'Speaker 1',
      episodeTitle: 'Title 1',
      quote: 'Quote 1',
      provenanceStamp: '[E1] Support 1',
      chunkId: 'c1',
    },
    {
      id: 'sn-s1-m1-E2',
      refIndex: 2,
      evidenceId: 'E2',
      speaker: 'Speaker 2',
      episodeTitle: 'Title 2',
      quote: 'Quote 2',
      provenanceStamp: '[E2] Support 2',
      chunkId: 'c2',
    },
  ];

  it('replaces [E1] and [E2] tokens with citation references matching their E-number', () => {
    const text = 'First claim [E1] and second claim [E2] are verified.';
    const segments = segmentTextWithCitations(text, citations);

    expect(segments).toEqual([
      'First claim ',
      { refIndex: 1, evidenceId: 'E1' },
      ' and second claim ',
      { refIndex: 2, evidenceId: 'E2' },
      ' are verified.',
    ]);
  });

  it('leaves bare bracketed numbers [1] as prose and does not hijack them (CIT6)', () => {
    const text = 'Cohort [1] analysis in [2024] showed improvements [E1].';
    const segments = segmentTextWithCitations(text, citations);

    expect(segments).toEqual([
      'Cohort [1] analysis in [2024] showed improvements ',
      { refIndex: 1, evidenceId: 'E1' },
      '.',
    ]);
  });

  it('preserves unknown tokens literally without discarding them', () => {
    const text = 'Known [E1] and unknown [E99] tokens.';
    const segments = segmentTextWithCitations(text, citations);

    expect(segments).toEqual([
      'Known ',
      { refIndex: 1, evidenceId: 'E1' },
      ' and unknown [E99] tokens.',
    ]);
  });

  it('handles multi-label citation clusters like [E1, E2] by splitting into individual reference buttons', () => {
    const text = 'Dual source evidence [E1, E2] confirms retention.';
    const segments = segmentTextWithCitations(text, citations);

    expect(segments).toEqual([
      'Dual source evidence ',
      { refIndex: 1, evidenceId: 'E1' },
      { refIndex: 2, evidenceId: 'E2' },
      ' confirms retention.',
    ]);
  });

  it('handles partially valid multi-label clusters [E1, E99] gracefully', () => {
    const text = 'Mixed citation [E1, E99] test.';
    const segments = segmentTextWithCitations(text, citations);

    expect(segments).toEqual([
      'Mixed citation ',
      { refIndex: 1, evidenceId: 'E1' },
      '[E99] test.',
    ]);
  });

  it('handles adjacent discrete citations [E1][E2] without swallowing punctuation', () => {
    const text = 'Consecutive citations [E1][E2].';
    const segments = segmentTextWithCitations(text, citations);

    expect(segments).toEqual([
      'Consecutive citations ',
      { refIndex: 1, evidenceId: 'E1' },
      { refIndex: 2, evidenceId: 'E2' },
      '.',
    ]);
  });

  it('handles text without any citation markers', () => {
    const text = 'Just plain text with no citations.';
    const segments = segmentTextWithCitations(text, citations);
    expect(segments).toEqual(['Just plain text with no citations.']);
  });
});

describe('buildAnswerData', () => {
  it('splits lead paragraph and Roman numeral sections from markdown', () => {
    const markdown = `# Answer Lead
This is the core insight on onboarding activation.

## I. First Principles
Find the moment worth speeding toward [E1].

## II. Sequencing
Read the retention curve first [2].
`;
    const answer = buildAnswerData(markdown, 'test stamp');
    expect(answer.lead).toContain('This is the core insight');
    expect(answer.sections).toHaveLength(2);
    expect(answer.sections[0].rn).toBe('I');
    expect(answer.sections[0].h).toBe('First Principles');
    expect(answer.sections[0].paragraphs[0]).toContain('Find the moment worth speeding toward');
    expect(answer.sections[1].rn).toBe('II');
    expect(answer.sections[1].h).toBe('Sequencing');
    expect(answer.stamp).toBe('test stamp');
  });

  it('parses numbered strategies with inline colons into structured sections', () => {
    const text = `Growing an Instagram account effectively requires compounding growth loops [E1, E2].

1. Prioritize Early Human Connection over Celebrities for Retention: While celebrity partnerships are powerful, Kaba emphasizes retention [E1].

2. Layer Multiple Growth Loops: Avoid relying on just one acquisition channel [E2].`;

    const answer = buildAnswerData(text, 'stamp 1');
    expect(answer.lead).toBe('Growing an Instagram account effectively requires compounding growth loops [E1, E2].');
    expect(answer.sections).toHaveLength(2);
    expect(answer.sections[0].rn).toBe('I');
    expect(answer.sections[0].h).toBe('Prioritize Early Human Connection over Celebrities for Retention');
    expect(answer.sections[0].paragraphs[0]).toContain('While celebrity partnerships are powerful');
    expect(answer.sections[1].rn).toBe('II');
    expect(answer.sections[1].h).toBe('Layer Multiple Growth Loops');
    expect(answer.sections[1].paragraphs[0]).toContain('Avoid relying on just one acquisition channel');
  });

  it('preserves multi-paragraph body text cleanly when no headings are present', () => {
    const text = `First paragraph is the lead.

Second paragraph is a separate body block.

Third paragraph is another point.`;

    const answer = buildAnswerData(text, 'stamp 2');
    expect(answer.lead).toBe('First paragraph is the lead.');
    expect(answer.sections).toHaveLength(1);
    expect(answer.sections[0].paragraphs).toHaveLength(2);
    expect(answer.sections[0].paragraphs[0]).toBe('Second paragraph is a separate body block.');
    expect(answer.sections[0].paragraphs[1]).toBe('Third paragraph is another point.');
  });

  it('correctly normalizes Gemini malformed headings and cleans dangling paragraph asterisks', () => {
    const rawGeminiOutput = `Building on [E1], here is how top-of-funnel and retention work together:

I**Layered Acquisition Channels
** Relying on a single acquisition channel creates a leaky bucket if retention fails [E1]. Instagram utilized multi-layered loops [E1].

II**The Connection Pivot (Early Retention)
** Early growth tactics often over-index on celebrity reach [E2]. Ensuring new users connect with friends right away changes retention [E2].

III**Frictionless Account Access
** Growth is heavily bottlenecked by preventable churn [E3].`;

    const answer = buildAnswerData(rawGeminiOutput, 'gemini stamp');
    expect(answer.lead).toContain('Building on [E1], here is how top-of-funnel and retention work together:');
    expect(answer.sections).toHaveLength(3);

    expect(answer.sections[0].rn).toBe('I');
    expect(answer.sections[0].h).toBe('Layered Acquisition Channels');
    expect(answer.sections[0].paragraphs[0]).toBe(
      'Relying on a single acquisition channel creates a leaky bucket if retention fails [E1]. Instagram utilized multi-layered loops [E1].'
    );

    expect(answer.sections[1].rn).toBe('II');
    expect(answer.sections[1].h).toBe('The Connection Pivot (Early Retention)');
    expect(answer.sections[1].paragraphs[0]).toBe(
      'Early growth tactics often over-index on celebrity reach [E2]. Ensuring new users connect with friends right away changes retention [E2].'
    );

    expect(answer.sections[2].rn).toBe('III');
    expect(answer.sections[2].h).toBe('Frictionless Account Access');
    expect(answer.sections[2].paragraphs[0]).toBe(
      'Growth is heavily bottlenecked by preventable churn [E3].'
    );
  });

  it('preserves legitimate inline bold formatting within paragraphs', () => {
    const text = `Lead overview here.

1. First Strategy
This paragraph includes **valid bold text** and regular text [E1].`;

    const answer = buildAnswerData(text, 'stamp');
    expect(answer.sections[0].paragraphs[0]).toBe(
      'This paragraph includes **valid bold text** and regular text [E1].'
    );
  });
});

describe('entriesFromHistory', () => {
  it('skips cancelled runs and maps user queries and completed answers', () => {
    const messages: MessageRecord[] = [
      {
        id: 'm1',
        session_id: 's1',
        role: 'user',
        content: 'How did Superhuman grow?',
        status: 'complete',
        created_at: '2026-10-10T12:00:00Z',
      },
      {
        id: 'm2',
        session_id: 's1',
        role: 'assistant',
        content: '',
        status: 'cancelled',
        created_at: '2026-10-10T12:00:01Z',
      },
      {
        id: 'm3',
        session_id: 's1',
        role: 'assistant',
        content: '## I. Summary\nSuperhuman focused on PMF [1].',
        status: 'complete',
        provider: 'local',
        model_id: 'qwen2.5:1.5b',
        created_at: '2026-10-10T12:00:02Z',
        citations: [
          {
            evidence_id: '1',
            source_id: 'src-1',
            chunk_id: 'chk-1',
            guest: 'Rahul Vohra',
            episode_title: 'Superhuman Engine',
            episode_url: null,
            publish_date: null,
            excerpt: 'Surveys show...',
            supports: 'PMF',
          },
        ],
      },
    ];

    const entries = entriesFromHistory('s1', messages);
    expect(entries).toHaveLength(2); // m1 (user query), m3 (assistant answer); m2 (cancelled) is skipped!
    expect(entries[0].kind).toBe('query');
    expect(entries[0].queryText).toBe('How did Superhuman grow?');
    expect(entries[1].kind).toBe('answer');
    expect(entries[1].citations).toHaveLength(1);
    expect(entries[1].citations?.[0].speaker).toBe('Rahul Vohra');
  });

  it('extracts writingPath from message metadata when present', () => {
    const messages: MessageRecord[] = [
      {
        id: 'm1',
        session_id: 's1',
        role: 'assistant',
        content: '## Essay Title\nContent here.',
        status: 'complete',
        workflow_mode: 'essay',
        created_at: '2026-10-10T12:00:00Z',
        metadata: {
          skill: 'ship-30-for-30@v1',
          writing_path: 'analytical',
        },
      },
    ];

    const entries = entriesFromHistory('s1', messages);
    expect(entries).toHaveLength(1);
    expect(entries[0].kind).toBe('answer');
    expect(entries[0].answerData?.writingPath).toBe('analytical');
  });
});

describe('modeToLabel', () => {
  it('maps modes to editorial labels', () => {
    expect(modeToLabel('research')).toBe('Query');
    expect(modeToLabel('growth_brief')).toBe('Brief');
    expect(modeToLabel('essay')).toBe('Essay');
    expect(modeToLabel('artifact_markdown')).toBe('Plate');
    expect(modeToLabel('artifact_html')).toBe('Plate');
  });
});
