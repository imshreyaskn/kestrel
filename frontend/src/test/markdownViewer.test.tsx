import { describe, it, expect, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { MarkdownViewer } from '../components/MarkdownViewer';
import { PlateAside } from '../components/PlateAside';
import { ArtifactData } from '../types';

describe('MarkdownViewer (AR3 & MM1)', () => {
  it('parses and renders GFM tables with column alignments', () => {
    const md = `
| Metric | Baseline | Target | Status |
| :--- | :---: | ---: | :--- |
| Activation | 23% | 35% | In Flight |
| Day-7 Retention | 14% | 20% | Planned |
`;
    const html = renderToStaticMarkup(<MarkdownViewer content={md} />);
    expect(html).toContain('<table class="pv-table"');
    expect(html).toContain('<th style="text-align:left">Metric</th>');
    expect(html).toContain('<th style="text-align:center">Baseline</th>');
    expect(html).toContain('<th style="text-align:right">Target</th>');
    expect(html).toContain('<td style="text-align:right">35%</td>');
    expect(html).toContain('<td style="text-align:center">23%</td>');
    expect(html).toContain('Day-7 Retention');
  });

  it('parses horizontal rules for ---, ***, and ___', () => {
    const md = `
First section
---
Second section
***
Third section
___
Final section
`;
    const html = renderToStaticMarkup(<MarkdownViewer content={md} />);
    const hrCount = (html.match(/<hr class="pv-hr"/g) || []).length;
    expect(hrCount).toBe(3);
  });

  it('renders heading levels from h1 through h6 unbroken', () => {
    const md = `
# Title Level 1
## Section Level 2
### Subhead Level 3
#### Metric Group Level 4
##### Technical Note Level 5
###### Footnote Level 6
`;
    const html = renderToStaticMarkup(<MarkdownViewer content={md} />);
    expect(html).toContain('<h1 class="pv-h1">Title Level 1</h1>');
    expect(html).toContain('<h2 class="pv-h2">Section Level 2</h2>');
    expect(html).toContain('<h3 class="pv-h3"');
    expect(html).toContain('Subhead Level 3</h3>');
    expect(html).toContain('<h4 class="pv-h4"');
    expect(html).toContain('Metric Group Level 4</h4>');
    expect(html).toContain('<h5 class="pv-h5"');
    expect(html).toContain('Technical Note Level 5</h5>');
    expect(html).toContain('<h6 class="pv-h6"');
    expect(html).toContain('Footnote Level 6</h6>');
  });

  it('converts markdown images into styled figure placeholders instead of raw links or img tags', () => {
    const md = 'Here is the diagram: ![Product Funnel Diagram](https://example.com/funnel.png) and an empty alt: ![](https://example.com/chart.png)';
    const html = renderToStaticMarkup(<MarkdownViewer content={md} />);
    expect(html).not.toContain('<img');
    expect(html).toContain('<span class="pv-figure-placeholder">[Figure: Product Funnel Diagram]</span>');
    expect(html).toContain('<span class="pv-figure-placeholder">[Figure: Untitled]</span>');
  });

  it('distinguishes between standard code fences and mermaid diagram blocks', () => {
    const standardCodeMd = '```typescript\nconst score: number = 42;\n```';
    const standardHtml = renderToStaticMarkup(<MarkdownViewer content={standardCodeMd} />);
    expect(standardHtml).toContain('<pre');
    expect(standardHtml).toContain('<code>const score: number = 42;</code>');
    expect(standardHtml).not.toContain('pv-mermaid');

    const mermaidMd = '```mermaid\nflowchart LR\nA[Signup] --> B[Activation]\n```';
    const mermaidHtml = renderToStaticMarkup(<MarkdownViewer content={mermaidMd} />);
    // In SSR, MermaidFrame initially renders loading/frame container without throwing
    expect(mermaidHtml).toContain('pv-mermaid-frame');
  });

  it('maintains zero dangerouslySetInnerHTML and escapes inline HTML tags', () => {
    const maliciousMd = 'Text with <script>alert("xss")</script> inside';
    const html = renderToStaticMarkup(<MarkdownViewer content={maliciousMd} />);
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;');
  });
});

describe('PlateAside margin miniature rendering (AR2)', () => {
  it('renders scaled MarkdownViewer for markdown artifacts instead of an iframe', () => {
    const mdArtifact: ArtifactData = {
      id: 'art-md-1',
      file: 'activation-plan.md',
      title: 'Activation Plan',
      kind: 'markdown',
      src: '# Plan Title\n\n- Step one\n- Step two',
      version: 1,
      impression: 'Plate 1 · MD',
    };

    const html = renderToStaticMarkup(
      <PlateAside artifact={mdArtifact} plateNumber="1" onExamine={vi.fn()} />
    );

    expect(html).toContain('plate-mini plate-mini-md');
    expect(html).toContain('plate-mini-scale');
    expect(html).toContain('pv-doc mini');
    expect(html).toContain('<h1 class="pv-h1">Plan Title</h1>');
    expect(html).not.toContain('<iframe');
  });

  it('renders sandboxed iframe for HTML artifacts', () => {
    const htmlArtifact: ArtifactData = {
      id: 'art-html-1',
      file: 'tear-sheet.html',
      title: 'Tear Sheet',
      kind: 'html',
      src: '<h1>HTML Deliverable</h1>',
      version: 1,
      impression: 'Plate 1 · HTML',
    };

    const html = renderToStaticMarkup(
      <PlateAside artifact={htmlArtifact} plateNumber="1" onExamine={vi.fn()} />
    );

    expect(html).toContain('<iframe');
    expect(html).toContain('sandbox=""');
    expect(html).not.toContain('plate-mini-md');
  });
});
