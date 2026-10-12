import React, { useState, useEffect, useId, useRef } from 'react';
import mermaid from 'mermaid';

interface MermaidFrameProps {
  code: string;
}

let mermaidInitialized = false;

function ensureMermaidInitialized() {
  if (mermaidInitialized) return;
  try {
    mermaid.initialize({
      startOnLoad: false,
      securityLevel: 'strict',
      theme: 'base',
      themeVariables: {
        primaryColor: '#F2F0E9',
        primaryBorderColor: '#4A1F3D',
        primaryTextColor: '#161614',
        lineColor: '#A07B8E',
        secondaryColor: '#E8DEE3',
        tertiaryColor: '#FAF8F2',
        fontFamily: 'Newsreader, Georgia, serif',
      },
    });
    mermaidInitialized = true;
  } catch (err) {
    console.warn('Mermaid initialization error:', err);
  }
}

export const MermaidFrame: React.FC<MermaidFrameProps> = ({ code }) => {
  const rawId = useId();
  const frameId = `mm-${rawId.replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const [svgContent, setSvgContent] = useState<string | null>(null);
  const [hasError, setHasError] = useState(false);
  const [frameHeight, setFrameHeight] = useState<number>(180);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    let cancelled = false;

    // Sanitization guard: Strip in-band %%{init directives before calling mermaid.render
    const sanitizedCode = code.replace(/%%\{[\s\S]*?\}%%/g, '').trim();

    async function renderDiagram() {
      try {
        ensureMermaidInitialized();

        // Polyfill getBBox for test / headless environments if needed
        const svgProto = typeof SVGElement !== 'undefined' ? (SVGElement.prototype as any) : null;
        if (svgProto && !svgProto.getBBox) {
          svgProto.getBBox = () => ({
            x: 0,
            y: 0,
            width: 300,
            height: 150,
            top: 0,
            bottom: 150,
            left: 0,
            right: 300,
            toJSON: () => {},
          });
        }

        const renderId = `mmsvg-${frameId}-${Math.floor(Math.random() * 100000)}`;
        const { svg } = await mermaid.render(renderId, sanitizedCode);
        if (!cancelled) {
          setSvgContent(svg);
          setHasError(false);
        }
      } catch (err) {
        if (!cancelled) {
          console.warn('Mermaid render failure:', err);
          setHasError(true);
        }
      }
    }

    renderDiagram();

    return () => {
      cancelled = true;
    };
  }, [code, frameId]);

  useEffect(() => {
    const handleMessage = (e: MessageEvent) => {
      if (iframeRef.current && e.source !== iframeRef.current.contentWindow) {
        return;
      }
      if (
        e.data &&
        e.data.t === 'mm-height' &&
        e.data.id === frameId &&
        typeof e.data.h === 'number'
      ) {
        setFrameHeight(Math.max(60, Math.min(e.data.h + 16, 1200)));
      }
    };

    window.addEventListener('message', handleMessage);
    return () => {
      window.removeEventListener('message', handleMessage);
    };
  }, [frameId]);

  if (hasError) {
    return (
      <div className="pv-mermaid-fallback" role="figure" aria-label="Mermaid diagram error fallback">
        <div className="pv-mermaid-banner">
          Diagram could not be rendered — source preserved below
        </div>
        <pre style={{ margin: 0, overflowX: 'auto', fontFamily: 'var(--f-mono)', fontSize: '13px', lineHeight: 1.5 }}>
          <code>{code}</code>
        </pre>
      </div>
    );
  }

  if (!svgContent) {
    return (
      <div
        className="pv-mermaid-frame pv-mermaid-loading"
        style={{
          height: '100px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'var(--muted-ink)',
          font: 'italic 13px var(--f-text)',
        }}
      >
        Rendering diagram...
      </div>
    );
  }

  const srcDoc = `<!doctype html>
<html>
<head>
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'self' 'unsafe-inline' blob:; style-src 'unsafe-inline'; img-src data: blob:; connect-src 'none'; font-src 'none';">
  <style>
    body {
      margin: 0;
      padding: 16px;
      display: flex;
      justify-content: center;
      align-items: center;
      background: transparent;
      overflow: hidden;
    }
    svg {
      max-width: 100%;
      height: auto;
      display: block;
    }
  </style>
</head>
<body>
  ${svgContent}
  <script>
    function sendHeight() {
      var h = Math.max(document.body.scrollHeight, document.documentElement.scrollHeight);
      if (window.parent && window.parent.postMessage) {
        window.parent.postMessage({ t: 'mm-height', h: h, id: '${frameId}' }, '*');
      }
    }
    window.addEventListener('load', sendHeight);
    if (window.ResizeObserver) {
      new ResizeObserver(sendHeight).observe(document.body);
    }
    sendHeight();
  </script>
</body>
</html>`;

  return (
    <iframe
      ref={iframeRef}
      className="pv-mermaid-frame"
      title="Mermaid diagram"
      sandbox="allow-scripts"
      style={{ height: `${frameHeight}px`, border: '1px solid var(--border)' }}
      srcDoc={srcDoc}
    />
  );
};
