import React from 'react';
import { MermaidFrame } from './MermaidFrame';

interface MarkdownViewerProps {
  content: string;
  className?: string;
}

/**
 * Safe, zero-dependency Markdown parser that renders clean semantic React elements.
 * Adheres strictly to IMPLEMENTATION_SPEC.md §9.2: escapes raw HTML, sanitizes URLs,
 * and preserves editorial typography.
 * Supports GFM tables, horizontal rules, h1-h6 headings, figure fallbacks,
 * and isolated Mermaid diagram frames. Zero dangerouslySetInnerHTML.
 */
export const MarkdownViewer: React.FC<MarkdownViewerProps> = ({ content, className = 'pv-doc' }) => {
  const renderInline = (text: string): React.ReactNode[] => {
    const nodes: React.ReactNode[] = [];
    let keyIdx = 0;

    // Pattern for inline markdown tokens:
    // 1. Figures: !\[([^\]]*)\]\((https?:\/\/[^\s)]+)\)
    // 2. Bold: \*\*(.+?)\*\*
    // 3. Italic: \*([^*]+?)\*
    // 4. Inline code: `([^`]+)`
    // 5. Links: \[([^\]]+)\]\((https?:\/\/[^\s)]+)\)
    // 6. Citation tags: \[E(\d+)\] or \[(\d+)\]
    const regex = /(!\[[^\]]*\]\(https?:\/\/[^\s)]+\)|\*\*.*?\*\*|\*[^*]+?\*|`[^`]+`|\[[^\]]+\]\(https?:\/\/[^\s)]+\)|\[E?\d+\])/g;

    let match: RegExpExecArray | null;
    let lastIndex = 0;

    while ((match = regex.exec(text)) !== null) {
      if (match.index > lastIndex) {
        nodes.push(text.substring(lastIndex, match.index));
      }

      const token = match[0];
      if (token.startsWith('![') && token.includes('](')) {
        const figMatch = token.match(/^!\[([^\]]*)\]\((https?:\/\/[^\s)]+)\)$/);
        const alt = figMatch ? figMatch[1].trim() : '';
        nodes.push(
          <span key={keyIdx++} className="pv-figure-placeholder">
            [Figure: {alt || 'Untitled'}]
          </span>
        );
      } else if (token.startsWith('**') && token.endsWith('**')) {
        nodes.push(<strong key={keyIdx++}>{token.slice(2, -2)}</strong>);
      } else if (token.startsWith('*') && token.endsWith('*')) {
        nodes.push(<em key={keyIdx++}>{token.slice(1, -1)}</em>);
      } else if (token.startsWith('`') && token.endsWith('`')) {
        nodes.push(
          <code
            key={keyIdx++}
            style={{
              fontFamily: 'var(--f-mono)',
              background: 'var(--canvas)',
              padding: '2px 4px',
              borderRadius: 0,
            }}
          >
            {token.slice(1, -1)}
          </code>
        );
      } else if (token.startsWith('[') && token.includes('](')) {
        const linkMatch = token.match(/^\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)$/);
        if (linkMatch) {
          nodes.push(
            <a
              key={keyIdx++}
              href={linkMatch[2]}
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: 'var(--accent)', textDecoration: 'underline' }}
            >
              {linkMatch[1]}
            </a>
          );
        } else {
          nodes.push(token);
        }
      } else if (/^\[E?\d+\]$/.test(token)) {
        const num = token.replace(/[^0-9]/g, '');
        nodes.push(
          <sup
            key={keyIdx++}
            className="sn-ref"
            style={{ color: 'var(--accent)', fontWeight: 600, marginLeft: '2px' }}
          >
            [{num}]
          </sup>
        );
      } else {
        nodes.push(token);
      }

      lastIndex = regex.lastIndex;
    }

    if (lastIndex < text.length) {
      nodes.push(text.substring(lastIndex));
    }

    return nodes.length > 0 ? nodes : [text];
  };

  const parseBlocks = (markdown: string): React.ReactNode[] => {
    const lines = markdown.split('\n');
    const blocks: React.ReactNode[] = [];
    let i = 0;
    let blockKey = 0;

    const splitCells = (s: string): string[] => {
      let t = s.trim();
      if (t.startsWith('|')) t = t.slice(1);
      if (t.endsWith('|')) t = t.slice(0, -1);
      return t.split('|').map((c) => c.trim());
    };

    while (i < lines.length) {
      const line = lines[i];
      const trimmed = line.trim();

      // Skip blank lines
      if (!trimmed) {
        i++;
        continue;
      }

      // Code fence
      if (trimmed.startsWith('```')) {
        const lang = trimmed.slice(3).trim().toLowerCase();
        const fenceLines: string[] = [];
        i++;
        while (i < lines.length && !lines[i].trim().startsWith('```')) {
          fenceLines.push(lines[i]);
          i++;
        }
        i++; // skip closing fence

        if (lang === 'mermaid') {
          blocks.push(
            <MermaidFrame key={blockKey++} code={fenceLines.join('\n')} />
          );
          continue;
        }

        blocks.push(
          <pre
            key={blockKey++}
            style={{
              background: 'var(--canvas)',
              border: '1px solid var(--border)',
              borderRadius: 0,
              padding: '16px',
              overflowX: 'auto',
              fontFamily: 'var(--f-mono)',
              fontSize: '13px',
              lineHeight: 1.6,
            }}
          >
            <code>{fenceLines.join('\n')}</code>
          </pre>
        );
        continue;
      }

      // Horizontal rules (---, ***, ___)
      if (/^(?:---|[*]{3}|_{3})\s*$/.test(trimmed)) {
        blocks.push(<hr key={blockKey++} className="pv-hr" />);
        i++;
        continue;
      }

      // Headings (check h6 down to h1)
      if (trimmed.startsWith('###### ')) {
        blocks.push(
          <h6 key={blockKey++} className="pv-h6" style={{ font: '600 11px/1.3 var(--f-ui)', textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--muted-ink)', margin: '14px 0 6px' }}>
            {renderInline(trimmed.slice(7))}
          </h6>
        );
        i++;
        continue;
      }
      if (trimmed.startsWith('##### ')) {
        blocks.push(
          <h5 key={blockKey++} className="pv-h5" style={{ font: '600 12px/1.3 var(--f-ui)', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--ink)', margin: '16px 0 6px' }}>
            {renderInline(trimmed.slice(6))}
          </h5>
        );
        i++;
        continue;
      }
      if (trimmed.startsWith('#### ')) {
        blocks.push(
          <h4 key={blockKey++} className="pv-h4" style={{ font: '600 14px/1.3 var(--f-disp)', margin: '18px 0 8px', color: 'var(--ink)' }}>
            {renderInline(trimmed.slice(5))}
          </h4>
        );
        i++;
        continue;
      }
      if (trimmed.startsWith('### ')) {
        blocks.push(
          <h3 key={blockKey++} className="pv-h3" style={{ font: '600 16px/1.3 var(--f-disp)', margin: '20px 0 8px' }}>
            {renderInline(trimmed.slice(4))}
          </h3>
        );
        i++;
        continue;
      }
      if (trimmed.startsWith('## ')) {
        blocks.push(<h2 key={blockKey++} className="pv-h2">{renderInline(trimmed.slice(3))}</h2>);
        i++;
        continue;
      }
      if (trimmed.startsWith('# ')) {
        blocks.push(<h1 key={blockKey++} className="pv-h1">{renderInline(trimmed.slice(2))}</h1>);
        i++;
        continue;
      }

      // GFM Tables
      if (trimmed.includes('|') && i + 1 < lines.length) {
        const nextTrimmed = lines[i + 1].trim();
        const isSeparator = /^\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)+\|?$/.test(nextTrimmed);
        if (isSeparator) {
          const rawHeaders = splitCells(trimmed);
          const rawSeps = splitCells(nextTrimmed);
          const alignments: Array<'left' | 'center' | 'right'> = rawSeps.map((sep) => {
            if (sep.startsWith(':') && sep.endsWith(':')) return 'center';
            if (sep.endsWith(':')) return 'right';
            return 'left';
          });

          i += 2; // skip header and separator
          const rows: string[][] = [];
          while (i < lines.length && lines[i].trim() && lines[i].includes('|')) {
            rows.push(splitCells(lines[i]));
            i++;
          }

          blocks.push(
            <div key={blockKey++} className="pv-table-wrap">
              <table className="pv-table">
                <thead>
                  <tr>
                    {rawHeaders.map((h, hIdx) => (
                      <th key={hIdx} style={{ textAlign: alignments[hIdx] || 'left' }}>
                        {renderInline(h)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, rIdx) => (
                    <tr key={rIdx}>
                      {rawHeaders.map((_, cIdx) => (
                        <td key={cIdx} style={{ textAlign: alignments[cIdx] || 'left' }}>
                          {renderInline(row[cIdx] || '')}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
          continue;
        }
      }

      // Blockquotes
      if (trimmed.startsWith('> ')) {
        const quoteLines: string[] = [trimmed.slice(2)];
        i++;
        while (i < lines.length && lines[i].trim().startsWith('> ')) {
          quoteLines.push(lines[i].trim().slice(2));
          i++;
        }
        blocks.push(
          <blockquote
            key={blockKey++}
            style={{
              borderLeft: '3px solid var(--accent)',
              paddingLeft: '16px',
              margin: '16px 0',
              fontStyle: 'italic',
              color: 'var(--muted-ink)',
            }}
          >
            {quoteLines.map((ql, qIdx) => (
              <p key={qIdx} style={{ margin: '4px 0' }}>{renderInline(ql)}</p>
            ))}
          </blockquote>
        );
        continue;
      }

      // Numbered List
      if (/^\d+\.\s/.test(trimmed)) {
        const items: string[] = [];
        while (i < lines.length && /^\d+\.\s/.test(lines[i].trim())) {
          items.push(lines[i].trim().replace(/^\d+\.\s*/, ''));
          i++;
        }
        blocks.push(
          <ol key={blockKey++}>
            {items.map((item, itemIdx) => (
              <li key={itemIdx}>{renderInline(item)}</li>
            ))}
          </ol>
        );
        continue;
      }

      // Unordered List
      if (/^[-*]\s/.test(trimmed)) {
        const items: string[] = [];
        while (i < lines.length && /^[-*]\s/.test(lines[i].trim())) {
          items.push(lines[i].trim().replace(/^[-*]\s*/, ''));
          i++;
        }
        blocks.push(
          <ul key={blockKey++} style={{ paddingLeft: '22px', margin: '0 0 13px' }}>
            {items.map((item, itemIdx) => (
              <li key={itemIdx}>{renderInline(item)}</li>
            ))}
          </ul>
        );
        continue;
      }

      // Regular Paragraph (gather lines until blank line or next block)
      const pLines: string[] = [trimmed];
      i++;
      while (
        i < lines.length &&
        lines[i].trim() &&
        !lines[i].trim().startsWith('#') &&
        !lines[i].trim().startsWith('```') &&
        !lines[i].trim().startsWith('> ') &&
        !/^(?:---|[*]{3}|_{3})\s*$/.test(lines[i].trim()) &&
        !(
          lines[i].includes('|') &&
          i + 1 < lines.length &&
          /^\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)+\|?$/.test(lines[i + 1].trim())
        ) &&
        !/^\d+\.\s/.test(lines[i].trim()) &&
        !/^[-*]\s/.test(lines[i].trim())
      ) {
        pLines.push(lines[i].trim());
        i++;
      }
      blocks.push(
        <p key={blockKey++}>
          {renderInline(pLines.join(' '))}
        </p>
      );
    }

    return blocks;
  };

  return <div className={className}>{parseBlocks(content)}</div>;
};
