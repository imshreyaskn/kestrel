import { describe, it, expect } from 'vitest';
import {
  extractSSEEvents,
  mapComposeRequest,
  briefRecordToData,
  briefDataToRecordPatch,
  isUuid,
  GrowthBriefRecord,
} from '../lib/api';
import { GrowthBriefData } from '../types';

describe('extractSSEEvents pure parser', () => {
  it('parses a clean single SSE event block', () => {
    const raw = 'event: stage\ndata: {"stage":"retrieving","label":"Searching archive..."}\n\n';
    const { events, remainder } = extractSSEEvents(raw);
    expect(events).toHaveLength(1);
    expect(events[0].event).toBe('stage');
    expect(JSON.parse(events[0].data)).toEqual({
      stage: 'retrieving',
      label: 'Searching archive...',
    });
    expect(remainder).toBe('');
  });

  it('handles multiple events in one chunk', () => {
    const raw =
      'event: run_started\ndata: {"run_id":"r1"}\n\nevent: stage\ndata: {"stage":"drafting"}\n\n';
    const { events, remainder } = extractSSEEvents(raw);
    expect(events).toHaveLength(2);
    expect(events[0].event).toBe('run_started');
    expect(events[1].event).toBe('stage');
    expect(remainder).toBe('');
  });

  it('buffers partial events in remainder until completed', () => {
    const chunk1 = 'event: stage\ndata: {"stage":"load';
    const res1 = extractSSEEvents(chunk1);
    expect(res1.events).toHaveLength(0);
    expect(res1.remainder).toBe('event: stage\ndata: {"stage":"load');

    const chunk2 = res1.remainder + 'ing"}\n\n';
    const res2 = extractSSEEvents(chunk2);
    expect(res2.events).toHaveLength(1);
    expect(res2.events[0].event).toBe('stage');
    expect(JSON.parse(res2.events[0].data)).toEqual({ stage: 'loading' });
    expect(res2.remainder).toBe('');
  });

  it('joins multi-line data lines correctly', () => {
    const raw = 'event: completed\ndata: {"line1":1,\ndata: "line2":2}\n\n';
    const { events } = extractSSEEvents(raw);
    expect(events).toHaveLength(1);
    expect(events[0].data).toBe('{"line1":1,\n"line2":2}');
    expect(JSON.parse(events[0].data)).toEqual({ line1: 1, line2: 2 });
  });

  it('ignores comments and normalizes CRLF', () => {
    const raw = ': ping keepalive\r\nevent: stage\r\ndata: {"stage":"done"}\r\n\r\n';
    const { events, remainder } = extractSSEEvents(raw);
    expect(events).toHaveLength(1);
    expect(events[0].event).toBe('stage');
    expect(remainder).toBe('');
  });
});

describe('mapComposeRequest', () => {
  it('maps research mode with artifact_format=null', () => {
    const req = mapComposeRequest({
      content: 'How did Superhuman onboarding work?',
      mode: 'research',
      format: 'markdown',
      provider: 'local',
    });
    expect(req).toEqual({
      content: 'How did Superhuman onboarding work?',
      mode: 'research',
      provider: 'local',
      cloud_provider: null,
      model_id: null,
      artifact_format: null,
      product_context: null,
      stream: true,
    });
  });

  it('maps artifact mode with format=html to artifact_html', () => {
    const req = mapComposeRequest({
      content: 'Create an experiment one-pager',
      mode: 'artifact',
      format: 'html',
      provider: 'cloud',
      productContext: 'B2B SaaS',
    });
    expect(req).toEqual({
      content: 'Create an experiment one-pager',
      mode: 'artifact_html',
      provider: 'cloud',
      cloud_provider: null,
      model_id: null,
      artifact_format: 'html',
      product_context: 'B2B SaaS',
      stream: true,
    });
  });

  it('maps artifact mode with format=markdown to artifact_markdown', () => {
    const req = mapComposeRequest({
      content: 'Create an experiment brief',
      mode: 'artifact',
      format: 'markdown',
      provider: 'local',
    });
    expect(req).toEqual({
      content: 'Create an experiment brief',
      mode: 'artifact_markdown',
      provider: 'local',
      cloud_provider: null,
      model_id: null,
      artifact_format: 'markdown',
      product_context: null,
      stream: true,
    });
  });
});

describe('Growth Brief wire conversion round-trip', () => {
  const wireRecord: GrowthBriefRecord = {
    id: 'b1',
    session_id: 's1',
    title: 'Activation Brief',
    version: 1,
    status: 'draft',
    created_at: '2026-10-10T00:00:00Z',
    updated_at: '2026-10-10T00:00:00Z',
    product_context: null,
    data: {
      problem: 'Activation drops 14%',
      research_summary: 'Consensus from Vohra and Winters',
      recommendation: 'Refocus on day 1 core habit',
      assumptions: ['Email deliverability is high', 'User intent is real'],
      experiment: {
        hypothesis: 'Simpler first run speeds time to aha',
        change: 'Remove team invite step',
        segment: 'Self-serve signups',
        success_metric: 'Day 1 Core Action',
        guardrail_metric: 'Week 4 retention',
        decision_rule: 'Ship if metric +10% with 0 drop in retention',
      },
      risks: ['Initial viral invites drop'],
      next_deliverable: 'Plate: One-pager',
    },
  };

  it('converts GrowthBriefRecord to GrowthBriefData', () => {
    const data = briefRecordToData(wireRecord);
    expect(data.id).toBe('b1');
    expect(data.sessionId).toBe('s1');
    expect(data.title).toBe('Activation Brief');
    expect(data.version).toBe(1);
    expect(data.isDemo).toBe(false);
    expect(data.problem).toBe('Activation drops 14%');
    expect(data.assumptions.split('\n')).toHaveLength(2);
    expect(data.experiment.hypothesis).toBe('Simpler first run speeds time to aha');
  });

  it('converts GrowthBriefData to PATCH payload', () => {
    const data: GrowthBriefData = briefRecordToData(wireRecord);
    data.problem = 'Updated problem statement';
    data.experiment.change = 'New change description';

    const patch = briefDataToRecordPatch(data);
    expect(patch.title).toBe('Activation Brief');
    expect(patch.data.problem).toBe('Updated problem statement');
    expect(patch.data.experiment?.change).toBe('New change description');
    expect(patch.data.research_summary).toBe('Consensus from Vohra and Winters');
  });
});

describe('isUuid validation', () => {
  it('accepts standard UUID v4', () => {
    expect(isUuid('bd9812e0-b696-4256-b33e-e0e1dd508148')).toBe(true);
  });

  it('rejects demo string ids and malformed inputs', () => {
    expect(isUuid('live-act')).toBe(false);
    expect(isUuid('pricing')).toBe(false);
    expect(isUuid('')).toBe(false);
    expect(isUuid('not-a-uuid')).toBe(false);
  });
});
