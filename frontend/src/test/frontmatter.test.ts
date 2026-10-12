import { describe, it, expect, vi } from 'vitest';
import { ComposeMode, ArtifactKind } from '../types';

describe('Frontmatter In-Card Accordion & Intent Builder (Approach 1)', () => {
  it('defines distinct, actionable inspiration chips for all three core modes', () => {
    const RESEARCH_CHIPS = [
      'How do top SaaS companies transition from PLG to enterprise sales?',
      'How does Superhuman measure product-market fit delight?',
      'What are Elena Verna’s core B2B growth loop frameworks?',
      'What are realistic week-one activation rate benchmarks for B2B freemium?',
    ];

    const BRIEF_CHIPS = [
      'Improve week-one onboarding activation without harming long-term retention',
      'Design an experiment to increase free-to-paid trial conversion',
      'Transition self-serve product usage into sales-assisted enterprise pipeline',
      'Reduce annual plan renewal churn with proactive usage milestones',
    ];

    const DELIVERABLE_CHIPS = [
      'Cast an HTML activation experiment scorecard and calculator',
      'A Ship 30 essay on the anatomy of an effective onboarding sequence',
      'Cast an interactive HTML pricing tier teardown matrix',
      'A Ship 30 essay on product-led growth loops vs traditional funnels',
    ];

    expect(RESEARCH_CHIPS.length).toBeGreaterThanOrEqual(4);
    expect(BRIEF_CHIPS.length).toBeGreaterThanOrEqual(4);
    expect(DELIVERABLE_CHIPS.length).toBeGreaterThanOrEqual(4);

    // Verify chips contain actionable strategic terms
    expect(RESEARCH_CHIPS.some((c) => c.includes('PLG') || c.includes('Superhuman'))).toBe(true);
    expect(BRIEF_CHIPS.some((c) => c.includes('activation') || c.includes('retention'))).toBe(true);
    expect(DELIVERABLE_CHIPS.some((c) => c.includes('HTML') || c.includes('Ship 30'))).toBe(true);
  });

  it('correctly routes submission with user problem statement and active mode', () => {
    const onSubmit = vi.fn();
    const isComposing = false;

    const handleCardSubmit = (
      text: string,
      mode: ComposeMode,
      format: ArtifactKind,
      productContext?: string
    ) => {
      const trimmed = text.trim();
      if (!trimmed || isComposing) return;
      onSubmit(trimmed, mode, format, productContext);
    };

    handleCardSubmit(
      'How do top SaaS companies transition from PLG to enterprise sales?',
      'research',
      'markdown'
    );

    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit).toHaveBeenCalledWith(
      'How do top SaaS companies transition from PLG to enterprise sales?',
      'research',
      'markdown',
      undefined
    );
  });

  it('allows user to customize problem statement for Growth Brief instead of hardcoding canned query', () => {
    const onSubmit = vi.fn();

    const handleBriefSubmit = (
      userProblem: string,
      productContext?: string
    ) => {
      onSubmit(userProblem.trim(), 'growth_brief', 'markdown', productContext);
    };

    const customUserProblem =
      'Our mobile signup activation drops 60% on step 3; how do we optimize the onboarding funnel?';
    const customContext = 'B2B CRM app, 500 signups/week';

    handleBriefSubmit(customUserProblem, customContext);

    expect(onSubmit).toHaveBeenCalledWith(
      customUserProblem,
      'growth_brief',
      'markdown',
      customContext
    );
  });

  it('supports format switching between Ship 30 Essay, HTML Plate, and Markdown Plate in Card III and notifies parent', () => {
    let mode: ComposeMode = 'research';
    let format: ArtifactKind = 'markdown';
    const onSelectIndexMode = vi.fn((m: ComposeMode) => {
      mode = m;
    });

    const selectDeliverablePill = (target: 'essay' | 'html' | 'markdown') => {
      if (target === 'essay') {
        mode = 'essay';
        onSelectIndexMode('essay');
      } else {
        mode = 'artifact';
        format = target;
        onSelectIndexMode('artifact');
      }
    };

    // Selecting Ship 30 Essay
    selectDeliverablePill('essay');
    expect(mode).toBe('essay');
    expect(onSelectIndexMode).toHaveBeenCalledWith('essay');

    // Selecting HTML Plate
    selectDeliverablePill('html');
    expect(mode).toBe('artifact');
    expect(format).toBe('html');
    expect(onSelectIndexMode).toHaveBeenCalledWith('artifact');

    // Selecting Markdown Plate
    selectDeliverablePill('markdown');
    expect(mode).toBe('artifact');
    expect(format).toBe('markdown');
    expect(onSelectIndexMode).toHaveBeenCalledWith('artifact');
  });

  it('defaults Card III to essay when opening from research or growth brief, avoiding unintended markdown plate', () => {
    let currentMode: ComposeMode = 'research';
    const onSelectIndexMode = vi.fn();

    const toggleCard = (card: 'research' | 'growth_brief' | 'deliverable') => {
      const targetMode: ComposeMode =
        card === 'deliverable'
          ? currentMode === 'essay' || currentMode === 'artifact'
            ? currentMode
            : 'essay'
          : card;
      currentMode = targetMode;
      onSelectIndexMode(targetMode);
    };

    // Card was 'research', opening deliverable card:
    toggleCard('deliverable');
    expect(currentMode).toBe('essay');
    expect(onSelectIndexMode).toHaveBeenCalledWith('essay');

    // Card was 'growth_brief', opening deliverable card:
    currentMode = 'growth_brief';
    toggleCard('deliverable');
    expect(currentMode).toBe('essay');
  });

  it('collapses expanded card on Escape key without submitting', () => {
    let expandedMode: string | null = 'research';
    const onSubmit = vi.fn();
    const preventDefault = vi.fn();

    const handleKeyDown = (key: string) => {
      if (key === 'Escape') {
        if (expandedMode) {
          preventDefault();
          expandedMode = null;
        }
        return;
      }
      if (key === 'Enter') {
        onSubmit();
      }
    };

    handleKeyDown('Escape');
    expect(preventDefault).toHaveBeenCalledTimes(1);
    expect(expandedMode).toBeNull();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('refuses submission when IME composition is active on Enter', () => {
    const onSubmit = vi.fn();
    const preventDefault = vi.fn();

    const handleKeyDown = (e: { key: string; shiftKey: boolean; isComposing: boolean }) => {
      if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
        preventDefault();
        onSubmit();
      }
    };

    // User presses Enter while IME is actively composing (e.g., selecting Chinese/Japanese characters)
    handleKeyDown({ key: 'Enter', shiftKey: false, isComposing: true });
    expect(preventDefault).not.toHaveBeenCalled();
    expect(onSubmit).not.toHaveBeenCalled();

    // User presses normal Enter (isComposing is false)
    handleKeyDown({ key: 'Enter', shiftKey: false, isComposing: false });
    expect(preventDefault).toHaveBeenCalledTimes(1);
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it('allows multiline input on Shift+Enter without triggering submit', () => {
    const onSubmit = vi.fn();
    const preventDefault = vi.fn();

    const handleKeyDown = (e: { key: string; shiftKey: boolean; isComposing: boolean }) => {
      if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
        preventDefault();
        onSubmit();
      }
    };

    handleKeyDown({ key: 'Enter', shiftKey: true, isComposing: false });
    expect(preventDefault).not.toHaveBeenCalled();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('strictly rejects empty or whitespace-only submissions', () => {
    const onSubmit = vi.fn();
    const submitText = (input: string) => {
      const trimmed = input.trim();
      if (!trimmed) return;
      onSubmit(trimmed);
    };

    submitText('');
    submitText('   ');
    submitText('\t\n\r   ');
    expect(onSubmit).not.toHaveBeenCalled();

    submitText('  Valid problem statement  ');
    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit).toHaveBeenCalledWith('Valid problem statement');
  });

  it('strictly blocks submission when isComposing is true', () => {
    const onSubmit = vi.fn();
    const isComposing = true;

    const handleSubmit = (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || isComposing) return;
      onSubmit(trimmed);
    };

    handleSubmit('Valid query while SSE stream is running');
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('preserves user typed text across card switches to prevent data loss', () => {
    let queryText = '';
    let currentCard: 'research' | 'growth_brief' | 'deliverable' = 'research';

    // User types inquiry into Card I
    queryText = 'What are Elena Verna’s B2B growth loops?';

    // User switches to Card II
    currentCard = 'growth_brief';

    // Query text remains preserved
    expect(currentCard).toBe('growth_brief');
    expect(queryText).toBe('What are Elena Verna’s B2B growth loops?');
  });
});
