import React from 'react';
import { SessionData } from '../types';

interface IndexRailProps {
  sessions: SessionData[];
  activeSessionId: string | null;
  onSelectSession: (id: string) => void;
  onDeleteSession: (id: string) => void;
  onNewDossier: () => void;
  isMobileOpen: boolean;
  onCloseMobile: () => void;
}

export const IndexRail: React.FC<IndexRailProps> = ({
  sessions,
  activeSessionId,
  onSelectSession,
  onDeleteSession,
  onNewDossier,
  isMobileOpen,
  onCloseMobile,
}) => {
  const openNow = sessions.filter((s) => s.kind === 'live');
  const earlier = sessions.filter((s) => s.kind === 'demo');

  return (
    <>
      <nav
        className={`rail ${isMobileOpen ? 'open' : ''}`}
        id="rail"
        aria-label="Dossier index"
      >
        <button
          className="rail-new"
          id="newBtn"
          onClick={() => {
            onNewDossier();
            onCloseMobile();
          }}
        >
          <span className="plus">
            <svg className="icon" aria-hidden="true" viewBox="0 0 24 24">
              <path d="M12 5v14M5 12h14" />
            </svg>
          </span>
          <span className="rl-t">Open a new dossier</span>
        </button>

        <div className="rail-list" id="railList">
          {openNow.length > 0 && (
            <>
              <p className="rl-group">Open now</p>
              {openNow.map((s, idx) => {
                const displayNum = String(idx + 1).padStart(2, '0');
                const isActive = s.id === activeSessionId;
                return (
                  <div className={`rl-item-wrap ${isActive ? 'active' : ''}`} key={s.id}>
                    <button
                      className={`rl-item ${isActive ? 'active' : ''}`}
                      onClick={() => {
                        onSelectSession(s.id);
                        onCloseMobile();
                      }}
                    >
                      <span className="rl-num">{displayNum}</span>
                      <span className="rl-t">{s.title}</span>
                    </button>
                    <button
                      className="rl-del"
                      aria-label={`Delete dossier “${s.title}”`}
                      title="Delete this dossier and everything bound to it"
                      onClick={(e) => {
                        e.stopPropagation();
                        onDeleteSession(s.id);
                      }}
                    >
                      ×
                    </button>
                  </div>
                );
              })}
            </>
          )}

          {earlier.length > 0 && (
            <>
              <p className="rl-group">Design tour — not persisted</p>
              {earlier.map((s, idx) => {
                const displayNum = s.num || `T${idx + 1}`;
                const isActive = s.id === activeSessionId;
                return (
                  <div className={`rl-item-wrap ${isActive ? 'active' : ''}`} key={s.id}>
                    <button
                      className={`rl-item ${isActive ? 'active' : ''}`}
                      onClick={() => {
                        onSelectSession(s.id);
                        onCloseMobile();
                      }}
                    >
                      <span className="rl-num">{displayNum}</span>
                      <span className="rl-t">{s.title}</span>
                    </button>
                  </div>
                );
              })}
            </>
          )}
        </div>

        <span className="rail-spine" aria-hidden="true">
          Kestrel — growth dossiers
        </span>
        <span className="rail-protolabel" aria-hidden="true">
          research folio
        </span>
      </nav>

      {/* Scrim for mobile drawer */}
      <div
        className={`scrim ${isMobileOpen ? 'show' : ''}`}
        id="scrim"
        onClick={onCloseMobile}
        aria-hidden="true"
      />
    </>
  );
};
