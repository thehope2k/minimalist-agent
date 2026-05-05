import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { Minus, Plus, RotateCcw } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * ZoomPan — scroll-to-zoom + drag-to-pan container.
 *
 * Design decisions:
 *   - Pan and drag state are kept in a ref and applied directly to the DOM
 *     via `innerRef.current.style.transform` — no re-render on every
 *     mousemove, so scrolling/dragging stays buttery smooth.
 *   - Only the zoom level (needed for the % readout) and the dragging flag
 *     (needed for the cursor class) live in React state.
 *   - Wheel zoom is cursor-centred: the point under the cursor stays fixed
 *     as you scroll in/out, matching every map/canvas UX the user knows.
 *   - The floating controls pill sits at the bottom-centre and doesn't
 *     intercept drag events (`onMouseDown` with stopPropagation).
 */

const MIN_ZOOM = 0.05;
const MAX_ZOOM = 8;

function clamp(v: number, lo: number, hi: number) {
  return Math.min(Math.max(v, lo), hi);
}

interface ZoomPanProps {
  children: ReactNode;
  className?: string;
  /**
   * Auto-scale content to fill the container on first render (like object-fit: contain).
   * The reset button will return to this fitted zoom rather than 100%.
   */
  fitOnMount?: boolean;
}

export function ZoomPan({ children, className, fitOnMount }: ZoomPanProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);

  // Mutable state that must never be stale in event handlers.
  const s = useRef({ zoom: 1, x: 0, y: 0, dragging: false, startX: 0, startY: 0, originX: 0, originY: 0 });

  // React state — only for things that trigger visible re-renders.
  const [zoom, setZoomDisplay] = useState(1);
  const [dragging, setDragging] = useState(false);

  // The "home" zoom level: 1 normally, or the fit-to-container zoom when fitOnMount is set.
  const homeZoomRef = useRef(1);

  /** Apply transform to the DOM and sync the % readout. */
  const apply = useCallback((zoom: number, x: number, y: number) => {
    s.current.zoom = zoom;
    s.current.x = x;
    s.current.y = y;
    if (innerRef.current) {
      innerRef.current.style.transform = `translate(${x}px, ${y}px) scale(${zoom})`;
    }
    setZoomDisplay(zoom);
  }, []);

  const reset = useCallback(() => apply(homeZoomRef.current, 0, 0), [apply]);

  /** On mount, compute and apply a fit-to-container zoom so the content fills the space. */
  useEffect(() => {
    if (!fitOnMount) return;
    // rAF ensures the browser has laid out the SVG at natural dimensions first.
    const raf = requestAnimationFrame(() => {
      const container = containerRef.current;
      const inner = innerRef.current;
      if (!container || !inner) return;
      const cw = container.clientWidth;
      const ch = container.clientHeight;
      const iw = inner.scrollWidth;
      const ih = inner.scrollHeight;
      if (iw === 0 || ih === 0) return;
      // Scale to fill ~90 % of the shorter axis (like object-fit: contain with padding).
      const fitZoom = clamp(Math.min(cw / iw, ch / ih) * 0.92, MIN_ZOOM, MAX_ZOOM);
      homeZoomRef.current = fitZoom;
      apply(fitZoom, 0, 0);
    });
    return () => cancelAnimationFrame(raf);
  }, [fitOnMount, apply]);

  /** Wheel zoom — centred on cursor position relative to container. */
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const { zoom, x, y } = s.current;
      const rect = el.getBoundingClientRect();
      // Mouse position relative to the container centre.
      const mx = e.clientX - rect.left - rect.width / 2;
      const my = e.clientY - rect.top - rect.height / 2;
      const factor = e.deltaY < 0 ? 1.12 : 1 / 1.12;
      const newZoom = clamp(zoom * factor, MIN_ZOOM, MAX_ZOOM);
      const ratio = newZoom / zoom;
      // Shift offset so the point under the cursor stays fixed.
      apply(newZoom, mx + (x - mx) * ratio, my + (y - my) * ratio);
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [apply]);

  /** Drag handlers. */
  const onMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return;
    e.preventDefault();
    Object.assign(s.current, {
      dragging: true,
      startX: e.clientX,
      startY: e.clientY,
      originX: s.current.x,
      originY: s.current.y,
    });
    setDragging(true);
  };

  const onMouseMove = (e: React.MouseEvent) => {
    if (!s.current.dragging) return;
    const nx = s.current.originX + (e.clientX - s.current.startX);
    const ny = s.current.originY + (e.clientY - s.current.startY);
    s.current.x = nx;
    s.current.y = ny;
    if (innerRef.current) {
      innerRef.current.style.transform =
        `translate(${nx}px, ${ny}px) scale(${s.current.zoom})`;
    }
  };

  const stopDrag = () => {
    s.current.dragging = false;
    setDragging(false);
  };

  /** Button handlers — stopPropagation so they don't start a drag. */
  const onZoomIn = (e: React.MouseEvent) => {
    e.stopPropagation();
    apply(clamp(s.current.zoom * 1.3, MIN_ZOOM, MAX_ZOOM), s.current.x, s.current.y);
  };
  const onZoomOut = (e: React.MouseEvent) => {
    e.stopPropagation();
    apply(clamp(s.current.zoom / 1.3, MIN_ZOOM, MAX_ZOOM), s.current.x, s.current.y);
  };
  const onReset = (e: React.MouseEvent) => {
    e.stopPropagation();
    reset();
  };

  return (
    <div
      ref={containerRef}
      className={cn(
        'relative flex items-center justify-center overflow-hidden select-none',
        dragging ? 'cursor-grabbing' : 'cursor-grab',
        className,
      )}
      onMouseDown={onMouseDown}
      onMouseMove={onMouseMove}
      onMouseUp={stopDrag}
      onMouseLeave={stopDrag}
    >
      {/* Transformed content */}
      <div ref={innerRef} style={{ transformOrigin: 'center center', willChange: 'transform' }}>
        {children}
      </div>

      {/* Floating controls pill */}
      <div
        className={cn(
          'absolute bottom-3 left-1/2 z-10 -translate-x-1/2',
          'flex items-center gap-0.5 rounded-full',
          'border border-border bg-panel/90 px-1.5 py-1 shadow-lg backdrop-blur-sm',
          'transition-opacity',
          zoom === 1 ? 'opacity-40 hover:opacity-100' : 'opacity-100',
        )}
        // Prevent clicks/mousedowns on controls from starting a drag.
        onMouseDown={(e) => e.stopPropagation()}
      >
        <ControlBtn onClick={onZoomOut} label="Zoom out" disabled={zoom <= MIN_ZOOM}>
          <Minus className="h-3 w-3" strokeWidth={2} />
        </ControlBtn>

        <button
          type="button"
          onClick={onReset}
          title="Reset to fit"
          className="min-w-[3rem] rounded-full px-1.5 py-0.5 text-center font-mono text-[10px] text-fg-muted transition-colors hover:bg-elevated hover:text-fg"
        >
          {Math.round(zoom * 100)}%
        </button>

        <ControlBtn onClick={onZoomIn} label="Zoom in" disabled={zoom >= MAX_ZOOM}>
          <Plus className="h-3 w-3" strokeWidth={2} />
        </ControlBtn>

        <div className="mx-0.5 h-3 w-px bg-border" />

        <ControlBtn onClick={onReset} label="Reset view">
          <RotateCcw className="h-3 w-3" strokeWidth={1.75} />
        </ControlBtn>
      </div>
    </div>
  );
}

function ControlBtn({
  children,
  onClick,
  label,
  disabled,
}: {
  children: ReactNode;
  onClick: (e: React.MouseEvent) => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      disabled={disabled}
      className="grid h-5 w-5 place-items-center rounded-full text-fg-subtle transition-colors hover:bg-elevated hover:text-fg disabled:opacity-30 disabled:hover:bg-transparent"
    >
      {children}
    </button>
  );
}
