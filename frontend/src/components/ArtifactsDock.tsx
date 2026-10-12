import React, { useState } from 'react';
import { ArtifactData, GrowthBriefData } from '../types';

interface ArtifactsDockProps {
  activeBrief: GrowthBriefData | null;
  artifacts: ArtifactData[];
  onOpenBrief: () => void;
  onExaminePlate: (artId: string, originRect?: DOMRect) => void;
  isColophonOpen?: boolean;
}

export const ArtifactsDock: React.FC<ArtifactsDockProps> = ({
  activeBrief,
  artifacts,
  onOpenBrief,
  onExaminePlate,
  isColophonOpen = false,
}) => {
  const [isCollapsed, setIsCollapsed] = useState(false);

  const totalCount = (activeBrief ? 1 : 0) + artifacts.length;

  if (totalCount === 0) {
    return null;
  }

  if (isCollapsed) {
    return (
      <div
        className={`artifacts-dock collapsed${isColophonOpen ? ' pushed-down' : ''}`}
        aria-label="Folio deliverables dock"
      >
        <button
          type="button"
          className="art-dock-collapsed-btn"
          onClick={() => setIsCollapsed(false)}
          title="Open folio deliverables list"
        >
          <span style={{ color: 'var(--accent)' }} aria-hidden="true">✳</span>
          <span>Deliverables</span>
          <span className="art-dock-count">{totalCount}</span>
        </button>
      </div>
    );
  }

  return (
    <aside
      className={`artifacts-dock${isColophonOpen ? ' pushed-down' : ''}`}
      aria-label="Folio deliverables dock"
    >
      <header className="art-dock-header">
        <div className="art-dock-title">
          <span style={{ color: 'var(--accent)' }} aria-hidden="true">✳</span>
          <span>Deliverables</span>
          <span className="art-dock-count">{totalCount}</span>
        </div>
        <button
          type="button"
          className="art-dock-toggle"
          onClick={() => setIsCollapsed(true)}
          aria-label="Collapse deliverables dock"
          title="Collapse deliverables"
        >
          −
        </button>
      </header>

      <div className="art-dock-list">
        {activeBrief && (
          <div
            className="art-dock-item"
            role="button"
            tabIndex={0}
            onClick={onOpenBrief}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onOpenBrief();
              }
            }}
          >
            <span className="art-dock-tag">Growth Brief</span>
            <h4 className="art-dock-name" title={activeBrief.title}>
              {activeBrief.title}
            </h4>
            <span className="art-dock-meta">
              v{activeBrief.version} · {activeBrief.status}
            </span>
            <button
              type="button"
              className="art-dock-btn"
              onClick={(e) => {
                e.stopPropagation();
                onOpenBrief();
              }}
            >
              Examine Brief →
            </button>
          </div>
        )}

        {artifacts.map((art, idx) => (
          <div
            key={art.id}
            className="art-dock-item"
            role="button"
            tabIndex={0}
            onClick={(e) => {
              const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
              onExaminePlate(art.id, rect);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onExaminePlate(art.id);
              }
            }}
          >
            <span className="art-dock-tag">
              Plate {idx + 1} · {art.kind.toUpperCase()}
            </span>
            <h4 className="art-dock-name" title={art.title}>
              {art.title}
            </h4>
            <span className="art-dock-meta">
              {art.file} · {art.impression}
            </span>
            <button
              type="button"
              className="art-dock-btn"
              onClick={(e) => {
                e.stopPropagation();
                const itemEl = (e.currentTarget as HTMLElement).closest('.art-dock-item');
                const rect = itemEl ? (itemEl as HTMLElement).getBoundingClientRect() : undefined;
                onExaminePlate(art.id, rect);
              }}
            >
              Examine Plate →
            </button>
          </div>
        ))}

        {totalCount === 0 && (
          <p className="art-dock-empty">
            No deliverables bound yet. Compose a Growth Brief or Digital Essay to file one here.
          </p>
        )}
      </div>
    </aside>
  );
};
