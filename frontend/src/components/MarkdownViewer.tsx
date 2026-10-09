import React from 'react';

interface MarkdownViewerProps {
  content: string;
  className?: string;
}

/**
 * Safe, zero-dependency Markdown parser that renders clean semantic React elements.
 * Adheres strictly to IMPLEMENTATION_SPEC.md §9.2: escapes raw HTML, sanitizes URLs,
 * and preserves editorial typography.
 */
export const MarkdownViewer: React.FC<MarkdownViewerProps> = ({ content, className = 'pv-doc' }) => {
  const renderInline = (text: string): React.ReactNode[] => {
    // Escapes and handles bold, italic, code, links, and citation markers
    const nodes: React.ReactNode[] = [];
    let keyIdx = 0;

    // Pattern for inline markdown tokens:
    // 1. Bold: \*\*(.+?)\*\*
    // 2. Italic: \*([^*]+?)\* or _([^_]+?)_
    // 3. Inline code: `([^`]+)`
    // 4. Links: \[([^\]]+)\]\((https?:\/\/[^\s)]+)\)
    // 5. Citation tags: \[E(\d+)\] or \[(\d+)\]
    const regex = /(\*\*.*?\*\*|\*[^*]+?\*|`[^`]+`|\[[^\]]+\]\(https?:\/\/[^\s)]+\)|\[E?\d+\])/g;

    let match: RegExpExecArray | null;
    let lastIndex = 0;

    while ((match = regex.exec(text)) !== null) {
      if (match.index > lastIndex) {
        nodes.push(text.substring(lastIndex, match.index));
      }

      const token = match[0];
      if (token.startsWith('**') && token.endsWith('**')) {
        nodes.push(<strong key={keyIdx++}>{token.slice(2, -2)}</strong>);
      } else if (token.startsWith('*') && token.endsWith('*')) {
        nodes.push(<em key={keyIdx++}>{token.slice(1, -1)}</em>);
      } else if (token.startsWith('`') && token.endsWith('`')) {
        nodes.push(<code key={keyIdx++} style={{ fontFamily: 'var(--f-mono)', background: 'var(--canvas)', padding: '2px 4px', borderRadius: '4px' }}>{token.slice(1, -1)}</code>);
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
          <sup key={keyIdx++} className="sn-ref" style={{ color: 'var(--accent)', fontWeight: 600, marginLeft: '2px' }}>
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
        const fenceLines: string[] = [];
        i++;
        while (i < lines.length && !lines[i].trim().startsWith('```')) {
          fenceLines.push(lines[i]);
          i++;
        }
        i++; // skip closing fence
        blocks.push(
          <pre
            key={blockKey++}
            style={{
              background: 'var(--canvas)',
              border: '1px solid var(--border)',
              borderRadius: '8px',
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

      // Headings
      if (trimmed.startsWith('# ')) {
        blocks.push(<h1 key={blockKey++}>{renderInline(trimmed.slice(2))}</h1>);
        i++;
        continue;
      }
      if (trimmed.startsWith('## ')) {
        blocks.push(<h2 key={blockKey++}>{renderInline(trimmed.slice(3))}</h2>);
        i++;
        continue;
      }
      if (trimmed.startsWith('### ')) {
        blocks.push(<h3 key={blockKey++} style={{ font: '600 16px/1.3 var(--f-disp)', margin: '20px 0 8px' }}>{renderInline(trimmed.slice(4))}</h3>);
        i++;
        continue;
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
