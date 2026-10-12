import React, { useEffect, useRef, useCallback } from 'react';
import { prefersReducedMotion } from '../lib/motion';

interface LeaderLinesProps {
  sheetRef: React.RefObject<HTMLElement>;
}

export const LeaderLines: React.FC<LeaderLinesProps> = ({ sheetRef }) => {
  const svgRef = useRef<SVGSVGElement>(null);
  const knownNotes = useRef<Set<string>>(new Set());

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
    const activeLeadIds = new Set<string>();
    refs.forEach((btn, idx) => {
      const noteId = btn.dataset.note;
      if (noteId && document.getElementById(noteId)) {
        activeLeadIds.add(`${noteId}-${idx}`);
      }
    });

    Array.from(svg.querySelectorAll<SVGGElement>('g.lead')).forEach((g) => {
      const leadId = g.dataset.leadId;
      if (!leadId || !activeLeadIds.has(leadId)) {
        g.remove();
      }
    });

    refs.forEach((btn, idx) => {
      const noteId = btn.dataset.note;
      if (!noteId) return;

      const note = document.getElementById(noteId);
      if (!note || !btn.offsetParent || !note.offsetParent) return;

      const leadId = `${noteId}-${idx}`;

      const b = btn.getBoundingClientRect();
      const n = note.getBoundingClientRect();

      const x1 = b.right - sRect.left + 2;
      const y1 = b.top + b.height / 2 - sRect.top;
      const x2 = n.left - sRect.left - 2;
      const y2 = n.top + 20 - sRect.top;

      if (x2 - x1 < 10) return;

      const dx = Math.max(x2 - x1, 20);
      const cp1x = x1 + dx * 0.45;
      const cp2x = x2 - dx * 0.45;
      const d = `M ${x1.toFixed(1)} ${y1.toFixed(1)} C ${cp1x.toFixed(1)} ${y1.toFixed(1)}, ${cp2x.toFixed(1)} ${y2.toFixed(1)}, ${x2.toFixed(1)} ${y2.toFixed(1)}`;

      let g = svg.querySelector<SVGGElement>(`g.lead[data-lead-id="${leadId}"]`);
      let path: SVGPathElement;
      let dot: SVGCircleElement;

      if (!g) {
        g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        g.classList.add('lead');
        g.dataset.note = noteId;
        g.dataset.leadId = leadId;

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

      const isFirstAppearance = !knownNotes.current.has(leadId);
      if (isFirstAppearance) {
        knownNotes.current.add(leadId);
      }

      const shouldAnimate =
        (isFirstAppearance || (animateIds && animateIds.includes(noteId))) &&
        !prefersReducedMotion();

      if (shouldAnimate) {
        const len = path.getTotalLength();
        path.style.transition = 'none';
        path.style.strokeDasharray = String(len);
        path.style.strokeDashoffset = String(len);
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            path.style.transition = 'stroke-dashoffset 0.8s cubic-bezier(0.16, 1, 0.3, 1) 0.1s';
            path.style.strokeDashoffset = '0';
            setTimeout(() => {
              path.style.transition = '';
              path.style.strokeDasharray = '';
            }, 1200);
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
      const btns = document.querySelectorAll<HTMLElement>(`.sn-ref[data-note="${noteId}"]`);
      const note = document.getElementById(noteId);
      const leads = svgRef.current?.querySelectorAll<SVGGElement>(`g.lead[data-note="${noteId}"]`);

      btns.forEach((btn) => {
        btn.classList.toggle('hot', on);
        const p = btn.closest('p');
        if (p) p.classList.toggle('p-hot', on);
      });

      if (note) note.classList.toggle('hot', on);
      leads?.forEach((lead) => lead.classList.toggle('hot', on));
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
          if (note.classList.contains('collapsed')) {
            const toggleBtn = note.querySelector<HTMLButtonElement>('.snote-toggle-btn');
            if (toggleBtn) {
              toggleBtn.click();
            }
          }
          note.scrollIntoView({
            block: 'center',
            behavior: prefersReducedMotion() ? 'auto' : 'smooth',
          });
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
          b.scrollIntoView({
            block: 'center',
            behavior: prefersReducedMotion() ? 'auto' : 'smooth',
          });
        }
      }
    };

    const handleFocusIn = (e: FocusEvent) => {
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

    const handleFocusOut = (e: FocusEvent) => {
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

    document.addEventListener('mouseover', handleMouseOver);
    document.addEventListener('mouseout', handleMouseOut);
    document.addEventListener('focusin', handleFocusIn);
    document.addEventListener('focusout', handleFocusOut);
    document.addEventListener('click', handleClick);

    // MutationObserver to redraw when new entries/elements appear with rAF coalescing
    let rAfQueued = false;
    let rAfId: number | null = null;
    const observer = new MutationObserver(() => {
      if (rAfQueued) return;
      rAfQueued = true;
      rAfId = requestAnimationFrame(() => {
        rAfQueued = false;
        drawLines();
      });
    });

    if (sheetRef.current) {
      observer.observe(sheetRef.current, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['class', 'style'],
      });
    }

    return () => {
      clearTimeout(resizeTimer);
      if (rAfId !== null) cancelAnimationFrame(rAfId);
      window.removeEventListener('resize', handleResize);
      document.removeEventListener('mouseover', handleMouseOver);
      document.removeEventListener('mouseout', handleMouseOut);
      document.removeEventListener('focusin', handleFocusIn);
      document.removeEventListener('focusout', handleFocusOut);
      document.removeEventListener('click', handleClick);
      observer.disconnect();
    };
  }, [drawLines, sheetRef]);

  return <svg ref={svgRef} id="leaders" aria-hidden="true" />;
};
