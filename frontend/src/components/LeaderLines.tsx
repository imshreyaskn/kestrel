import React, { useEffect, useRef, useCallback } from 'react';

interface LeaderLinesProps {
  sheetRef: React.RefObject<HTMLElement>;
}

export const LeaderLines: React.FC<LeaderLinesProps> = ({ sheetRef }) => {
  const svgRef = useRef<SVGSVGElement>(null);

  const drawLines = useCallback((animateIds?: string[]) => {
    if (!svgRef.current || !sheetRef.current) return;
    if (window.innerWidth < 1121) {
      svgRef.current.innerHTML = '';
      return;
    }

    const sheet = sheetRef.current;
    const svg = svgRef.current;
    const w = sheet.scrollWidth;
    const h = sheet.scrollHeight;

    svg.setAttribute('width', String(w));
    svg.setAttribute('height', String(h));
    svg.style.width = `${w}px`;
    svg.style.height = `${h}px`;

    const sRect = sheet.getBoundingClientRect();
    const refs = Array.from(sheet.querySelectorAll<HTMLElement>('.sn-ref'));

    // Clear stale lines
    const activeNoteIds = new Set<string>();
    refs.forEach((btn) => {
      const noteId = btn.dataset.note;
      if (noteId && document.getElementById(noteId)) {
        activeNoteIds.add(noteId);
      }
    });

    Array.from(svg.querySelectorAll<SVGGElement>('g.lead')).forEach((g) => {
      if (!g.dataset.note || !activeNoteIds.has(g.dataset.note)) {
        g.remove();
      }
    });

    refs.forEach((btn) => {
      const noteId = btn.dataset.note;
      if (!noteId) return;
      const note = document.getElementById(noteId);
      if (!note || !btn.offsetParent || !note.offsetParent) return;

      const b = btn.getBoundingClientRect();
      const n = note.getBoundingClientRect();

      const x1 = b.right - sRect.left + 2;
      const y1 = b.top + b.height / 2 - sRect.top;
      const x2 = n.left - sRect.left - 2;
      const y2 = n.top + 20 - sRect.top;

      if (x2 - x1 < 10) return;

      const mx = (x1 + x2) / 2;
      const d = `M ${x1.toFixed(1)} ${y1.toFixed(1)} C ${mx.toFixed(1)} ${y1.toFixed(1)}, ${mx.toFixed(1)} ${y2.toFixed(1)}, ${x2.toFixed(1)} ${y2.toFixed(1)}`;

      let g = svg.querySelector<SVGGElement>(`g.lead[data-note="${noteId}"]`);
      let path: SVGPathElement;
      let dot: SVGCircleElement;

      if (!g) {
        g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        g.classList.add('lead');
        g.dataset.note = noteId;

        path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        dot = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        dot.setAttribute('r', '2.4');

        g.append(path, dot);
        svg.append(g);
      } else {
        path = g.querySelector('path')!;
        dot = g.querySelector('circle')!;
      }

      path.setAttribute('d', d);
      dot.setAttribute('cx', String(x2));
      dot.setAttribute('cy', String(y2));

      if (animateIds && animateIds.includes(noteId)) {
        const len = path.getTotalLength();
        path.style.transition = 'none';
        path.style.strokeDasharray = String(len);
        path.style.strokeDashoffset = String(len);
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            path.style.transition = 'stroke-dashoffset 1s ease .25s';
            path.style.strokeDashoffset = '0';
            setTimeout(() => {
              path.style.transition = '';
              path.style.strokeDasharray = '';
            }, 1500);
          });
        });
      }
    });
  }, [sheetRef]);

  useEffect(() => {
    // Initial draw and fonts check
    drawLines();
    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(() => drawLines());
    }

    let resizeTimer: ReturnType<typeof setTimeout>;
    const handleResize = () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => drawLines(), 100);
    };

    window.addEventListener('resize', handleResize);

    // Two-way hover / focus handlers
    const setHotState = (noteId: string, on: boolean) => {
      const btn = document.querySelector(`.sn-ref[data-note="${noteId}"]`);
      const note = document.getElementById(noteId);
      const lead = svgRef.current?.querySelector(`g.lead[data-note="${noteId}"]`);

      if (btn) btn.classList.toggle('hot', on);
      if (note) note.classList.toggle('hot', on);
      if (lead) lead.classList.toggle('hot', on);

      if (btn) {
        const p = btn.closest('p');
        if (p) p.classList.toggle('p-hot', on);
      }
    };

    const handleMouseOver = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      const btn = target.closest<HTMLElement>('.sn-ref');
      if (btn?.dataset.note) {
        setHotState(btn.dataset.note, true);
        return;
      }
      const note = target.closest<HTMLElement>('.snote');
      if (note?.id) {
        setHotState(note.id, true);
      }
    };

    const handleMouseOut = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      const btn = target.closest<HTMLElement>('.sn-ref');
      if (btn?.dataset.note) {
        setHotState(btn.dataset.note, false);
        return;
      }
      const note = target.closest<HTMLElement>('.snote');
      if (note?.id) {
        setHotState(note.id, false);
      }
    };

    const handleClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      const btn = target.closest<HTMLElement>('.sn-ref');
      if (btn?.dataset.note) {
        const note = document.getElementById(btn.dataset.note);
        if (note) {
          note.scrollIntoView({ block: 'center', behavior: 'smooth' });
          note.classList.remove('flash');
          void note.offsetWidth;
          note.classList.add('flash');
          setTimeout(() => note.classList.remove('flash'), 1400);
        }
        return;
      }

      const note = target.closest<HTMLElement>('.snote');
      if (note?.id) {
        const b = document.querySelector<HTMLElement>(`.sn-ref[data-note="${note.id}"]`);
        if (b) {
          b.scrollIntoView({ block: 'center', behavior: 'smooth' });
        }
      }
    };

    document.addEventListener('mouseover', handleMouseOver);
    document.addEventListener('mouseout', handleMouseOut);
    document.addEventListener('click', handleClick);

    // MutationObserver to redraw when new entries/elements appear
    const observer = new MutationObserver(() => {
      drawLines();
    });

    if (sheetRef.current) {
      observer.observe(sheetRef.current, {
        childList: true,
        subtree: true,
      });
    }

    return () => {
      window.removeEventListener('resize', handleResize);
      document.removeEventListener('mouseover', handleMouseOver);
      document.removeEventListener('mouseout', handleMouseOut);
      document.removeEventListener('click', handleClick);
      observer.disconnect();
    };
  }, [drawLines, sheetRef]);

  return <svg ref={svgRef} id="leaders" aria-hidden="true" />;
};
