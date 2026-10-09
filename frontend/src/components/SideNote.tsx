import React from 'react';
import { Citation } from '../types';

interface SideNoteProps {
  citation: Citation;
  onNoteClick?: () => void;
}

export const SideNote: React.FC<SideNoteProps> = ({ citation, onNoteClick }) => {
  return (
    <aside
      className="snote"
      id={citation.id}
      tabIndex={-1}
      aria-label={`Evidence — ${citation.speaker}`}
      onClick={onNoteClick}
      data-n={citation.refIndex}
    >
      <div className="snote-in">
        <div className="snote-top">
          <span className="snote-n">{citation.refIndex}</span>
          <p className="snote-src">
            {citation.speaker}
            {citation.affiliation ? ` · ${citation.affiliation}` : ''}
          </p>
        </div>
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
        <p className="stamp snote-stamp">{citation.provenanceStamp}</p>
      </div>
    </aside>
  );
};
