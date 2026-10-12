import { describe, it, expect, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { ArtifactsDock } from '../components/ArtifactsDock';
import { ArtifactData, GrowthBriefData } from '../types';

describe('ArtifactsDock (Right-Side Deliverables Shelf)', () => {
  const dummyBrief: GrowthBriefData = {
    id: 'brief-1',
    sessionId: 'sess-1',
    title: 'Instagram Account Growth Playbook',
    problem: 'Acquisition without early retention is a leaky bucket.',
    recommendation: 'Focus on peer-to-peer connection within day one.',
    researchSummary: 'Research findings on Instagram loops.',
    assumptions: 'Users invite peers.',
    experiment: {
      hypothesis: 'Connecting to friends improves retention.',
      change: 'Onboarding friend graph prompt',
      segment: 'New signups',
      success_metric: 'D7 Retention',
      guardrail_metric: 'Churn rate',
      decision_rule: '+15% relative lift',
    },
    risks: 'Privacy friction',
    nextDeliverable: 'Onboarding spec',
    productContext: null,
    status: 'draft',
    version: 2,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const dummyArtifact: ArtifactData = {
    id: 'art-1',
    file: 'activation-matrix.md',
    title: 'Activation Scorecard Matrix',
    kind: 'markdown',
    src: '# Matrix',
    version: 1,
    impression: 'Plate 1 · MD',
  };

  it('renders empty-state message when there are no brief and no artifacts', () => {
    const html = renderToStaticMarkup(
      <ArtifactsDock
        activeBrief={null}
        artifacts={[]}
        onOpenBrief={vi.fn()}
        onExaminePlate={vi.fn()}
      />
    );
    // Dock is always present — shows empty-state text instead of returning null.
    expect(html).toContain('class="artifacts-dock"');
    expect(html).toContain('No deliverables bound yet');
    expect(html).toContain('art-dock-count">0</span>');
  });

  it('renders right-side deliverables dock with Growth Brief and Artifact items', () => {
    const html = renderToStaticMarkup(
      <ArtifactsDock
        activeBrief={dummyBrief}
        artifacts={[dummyArtifact]}
        onOpenBrief={vi.fn()}
        onExaminePlate={vi.fn()}
      />
    );

    expect(html).toContain('class="artifacts-dock"');
    expect(html).toContain('Deliverables');
    expect(html).toContain('<span class="art-dock-count">2</span>');
    expect(html).toContain('Instagram Account Growth Playbook');
    expect(html).toContain('v2 · draft');
    expect(html).toContain('Examine Brief →');
    expect(html).toContain('Activation Scorecard Matrix');
    expect(html).toContain('Plate 1 · MARKDOWN');
    expect(html).toContain('Examine Plate →');
  });

  it('displays the star glyph in the dock title header', () => {
    const html = renderToStaticMarkup(
      <ArtifactsDock
        activeBrief={dummyBrief}
        artifacts={[]}
        onOpenBrief={vi.fn()}
        onExaminePlate={vi.fn()}
      />
    );

    expect(html).toContain('✳');
  });
});
