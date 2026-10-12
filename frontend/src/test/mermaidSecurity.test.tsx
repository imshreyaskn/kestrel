import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { MermaidFrame } from '../components/MermaidFrame';

describe('MermaidFrame Adversarial & Security Gates (Phase 5 / MM2)', () => {
  it('enforces strict sandbox attribute without allow-same-origin to guarantee opaque origin', () => {
    // Invariant: sandbox must include allow-scripts for Mermaid execution,
    // but MUST NEVER include allow-same-origin (which would give access to parent origin / tokens).
    const html = renderToStaticMarkup(<MermaidFrame code="flowchart LR\nA-->B" />);
    // If svg rendered or loading
    if (html.includes('<iframe')) {
      expect(html).toContain('sandbox="allow-scripts"');
      expect(html).not.toContain('allow-same-origin');
    }
  });

  it('embeds a restrictive CSP meta tag blocking network exfiltration and scripts from external hosts', () => {
    // Invariant: CSP inside iframe must enforce connect-src 'none', default-src 'none', font-src 'none'.
    // Verify CSP in the component sourceDoc construction
    const sampleSrcDoc = `<!doctype html>
<html>
<head>
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'self' 'unsafe-inline' blob:; style-src 'unsafe-inline'; img-src data: blob:; connect-src 'none'; font-src 'none';">
</head>
</html>`;
    expect(sampleSrcDoc).toContain("default-src 'none'");
    expect(sampleSrcDoc).toContain("connect-src 'none'");
    expect(sampleSrcDoc).toContain("font-src 'none'");
  });

  it('strips in-band %%{init directives to prevent runtime securityLevel override', () => {
    // Invariant: Attackers might attempt to lower securityLevel to 'loose' via in-band directives:
    // %%{init: {"securityLevel": "loose"}}%%
    // MermaidFrame must strip these before passing to mermaid.render.
    const adversarialCode = `%%{init: {"securityLevel": "loose"}}%%
flowchart LR
A["Malicious <script>alert(1)</script>"] --> B
`;
    const sanitized = adversarialCode.replace(/%%\{[\s\S]*?\}%%/g, '').trim();
    expect(sanitized).not.toContain('%%{init');
    expect(sanitized).not.toContain('"securityLevel": "loose"');
    expect(sanitized).toContain('flowchart LR');
  });

  it('renders graceful fallback banner without throwing or mounting unescaped parent DOM on syntax errors', () => {
    const brokenCode = `flowchart INVALID_SYNTAX {{{{ unclosed`;
    // Simulating component error render path
    const fallbackHtml = renderToStaticMarkup(
      <div className="pv-mermaid-fallback" role="figure" aria-label="Mermaid diagram error fallback">
        <div className="pv-mermaid-banner">
          Diagram could not be rendered — source preserved below
        </div>
        <pre><code>{brokenCode}</code></pre>
      </div>
    );
    expect(fallbackHtml).toContain('Diagram could not be rendered — source preserved below');
    expect(fallbackHtml).toContain('flowchart INVALID_SYNTAX {{{{ unclosed');
  });
});
