import React from 'react';
import { ArtifactData } from '../types';
import { CSP_HEADER } from '../lib/demoData';

interface PlateAsideProps {
  artifact: ArtifactData;
  plateNumber: string;
  onExamine: () => void;
}

export const PlateAside: React.FC<PlateAsideProps> = ({
  artifact,
  plateNumber,
  onExamine,
}) => {
  const safeSrcDoc = (artifact.mdHtml || artifact.src).includes('<head>')
    ? (artifact.mdHtml || artifact.src).replace('<head>', `<head>${CSP_HEADER}`)
    : `<!doctype html><html><head>${CSP_HEADER}<style>body{margin:0;font-family:serif;font-size:12px;padding:12px;}</style></head><body>${artifact.src}</body></html>`;

  return (
    <aside className="plate" aria-label={`Margin plate ${plateNumber}`}>
      <div className="plate-in">
        <div className="plate-mini" aria-hidden="true">
          <iframe
            sandbox=""
            tabIndex={-1}
            title={`Plate miniature — ${artifact.file}`}
            srcDoc={safeSrcDoc}
          />
        </div>
        <div className="plate-cap">
          <span className="stamp">
            Plate {plateNumber} · {artifact.file} · {artifact.impression}
          </span>
        </div>
        <div className="plate-open">
          <button type="button" className="tbtn" onClick={onExamine}>
            Examine →
          </button>
        </div>
      </div>
    </aside>
  );
};
