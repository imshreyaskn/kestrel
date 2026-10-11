import React, { useState } from 'react';
import { Citation } from '../types';

interface SideNoteProps {
  citation: Citation;
  onNoteClick?: () => void;
  defaultExpanded?: boolean;
}

export const SideNote: React.FC<SideNoteProps> = ({
  citation,
  onNoteClick,
  defaultExpanded = false,
}) => {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);

  const toggleExpand = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsExpanded((prev) => !prev);
    // Notify leader lines to recalculate anchor coordinates
    requestAnimationFrame(() => {
      window.dispatchEvent(new Event('resize'));
    });
    if (onNoteClick) onNoteClick();
  };

  return (
    <aside
      className={`snote ${isExpanded ? 'open' : 'collapsed'}`}
      id={citation.id}
      tabIndex={-1}
      aria-label={`Evidence note ${citation.refIndex} — ${citation.speaker}`}
      data-n={citation.refIndex}
      onClick={toggleExpand}
    >
      <div className="snote-in">
        <div className="snote-top">
          <span className="snote-n">{citation.refIndex}</span>
          <p className="snote-src">
            {citation.speaker}
            {citation.affiliation ? ` · ${citation.affiliation}` : ''}
          </p>
          <button
            type="button"
            className="snote-toggle-btn"
            aria-expanded={isExpanded}
            onClick={toggleExpand}
            aria-label={isExpanded ? 'Collapse note' : 'Expand note'}
          >
            {isExpanded ? '−' : '+'}
          </button>
        </div>

        {!isExpanded && citation.episodeTitle && (
          <span className="snote-ep-chip" title={citation.episodeTitle}>
            {citation.episodeTitle}
          </span>
        )}

        <div className="snote-body" style={{ display: isExpanded ? 'block' : 'none' }}>
          <blockquote className="snote-q">“{citation.quote}”</blockquote>
          {citation.episodeTitle && (
            <a
              className="snote-ep"
              href={citation.episodeUrl || '#'}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
            >
              {citation.episodeTitle} ↗
            </a>
          )}
          <div className="snote-meta-row">
            <p className="stamp snote-stamp">{citation.provenanceStamp}</p>
            {citation.rrfScore !== undefined && (
              <span className="stamp snote-rrf">
                Rank #{citation.retrievalRank ?? citation.refIndex} · Fused {citation.rrfScore.toFixed(3)}
              </span>
            )}
          </div>
        </div>
      </div>
    </aside>
  );
};
