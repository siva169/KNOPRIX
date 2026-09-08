import React, { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { Bookmark, BookmarkCheck, FileText, AlertTriangle } from 'lucide-react';
import api from '../api';
import { useApp } from '../context/AppContext.jsx';
import { colorById, matchSegments } from '../highlights';

const DEFAULT_TEXT = '#262626';

// PowerPoint colors text against the slide — pick black/white by background
// luminance so theme-colored (inherited) text stays readable on any slide.
function contrastText(hex) {
  if (!hex) return DEFAULT_TEXT;
  const h = hex.replace('#', '');
  if (h.length < 6) return DEFAULT_TEXT;
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return lum > 0.62 ? '#262626' : '#ffffff';
}

function runSegments(text, pageHighlights) {
  for (const h of pageHighlights) {
    const segs = matchSegments(text, h.text, h.matchAll);
    if (segs.some((s) => s.highlighted)) {
      return segs.map((s) =>
        s.highlighted
          ? { text: s.text, mark: true, color: colorById(h.color).bg, id: h.id }
          : { text: s.text }
      );
    }
  }
  return [{ text }];
}

function TextShape({ s, defaultColor, pageHighlights = [] }) {
  const anchor = s.anchor || 'top';
  const justify =
    anchor === 'middle' ? 'center' : anchor === 'bottom' ? 'flex-end' : 'flex-start';
  const base = s.bg ? contrastText(s.bg) : defaultColor;

  // Join every run in this shape (separated by '\n') so a selection spanning
  // several paragraphs / runs — e.g. an author name block — still paints.
  // Painted ranges are recorded against the joined string, then clipped back
  // to each run when rendering.
  const runs = s.paras.flatMap((p) => p.runs);
  const runMeta = [];
  let full = '';
  runs.forEach((r) => {
    runMeta.push({ start: full.length, len: r.t.length });
    full += r.t + '\n';
  });
  const paintRanges = [];
  for (const h of pageHighlights) {
    const segs = matchSegments(full, h.text, h.matchAll);
    let pos = 0;
    for (const seg of segs) {
      if (seg.highlighted) {
        paintRanges.push({ s: pos, e: pos + seg.text.length, id: h.id, color: colorById(h.color).bg });
      }
      pos += seg.text.length;
    }
  }

  const paintRun = (start, len) => {
    const runEnd = start + len;
    const parts = [];
    let prevEnd = start;
    let painted = false;
    for (const r of paintRanges) {
      const rs = Math.max(r.s, start);
      const re = Math.min(r.e, runEnd);
      if (re <= rs) continue;
      if (rs > prevEnd) parts.push({ text: full.slice(prevEnd, rs) });
      parts.push({ text: full.slice(rs, re), mark: true, color: r.color, id: r.id });
      prevEnd = re;
      painted = true;
    }
    if (!painted) return null;
    if (prevEnd < runEnd) parts.push({ text: full.slice(prevEnd, runEnd) });
    return parts;
  };

  let runIdx = 0;
  return (
    <div
      style={{
        position: 'absolute',
        left: `${s.x}%`,
        top: `${s.y}%`,
        width: `${s.w}%`,
        height: `${s.h}%`,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: justify,
        overflow: 'visible',
        color: base,
        ...(s.bg ? { background: `#${s.bg}` } : {}),
        ...(s.rot ? { transform: `rotate(${s.rot}deg)`, transformOrigin: '50% 50%' } : {})
      }}
    >
      {s.paras.map((p, i) => {
        const indent = (p.level || 0) * 18;
        return (
          <div
            key={i}
            style={{
              textAlign: p.align || 'left',
              paddingLeft: indent,
              lineHeight: 1.18,
              wordBreak: 'break-word'
            }}
          >
            {p.runs.map((r, j) => {
              const meta = runMeta[runIdx];
              runIdx += 1;
              const segs = paintRun(meta.start, meta.len) || [{ text: r.t }];
              return (
                <span
                  key={j}
                  style={{
                    fontWeight: r.bold ? 700 : 400,
                    fontStyle: r.italic ? 'italic' : 'normal',
                    fontSize: r.size || 18,
                    color: r.color ? `#${r.color}` : base,
                    fontFamily: r.font ? `'${r.font}', 'Segoe UI', sans-serif` : undefined
                  }}
                >
                  {segs.map((seg, k) =>
                    seg.mark ? (
                      <mark key={k} data-hlid={seg.id} className="kn-hl-plain" style={{ background: seg.color, color: 'inherit' }}>
                        {seg.text}
                      </mark>
                    ) : (
                      seg.text
                    )
                  )}
                </span>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}

function TableShape({ s, pageHighlights = [] }) {
  return (
    <div
      style={{
        position: 'absolute',
        left: `${s.x}%`,
        top: `${s.y}%`,
        width: `${s.w}%`,
        height: `${s.h}%`,
        overflow: 'hidden',
        ...(s.rot ? { transform: `rotate(${s.rot}deg)`, transformOrigin: '50% 50%' } : {})
      }}
    >
      <table
        style={{
          width: '100%',
          height: '100%',
          borderCollapse: 'collapse',
          tableLayout: 'fixed',
          fontSize: 12
        }}
      >
        <colgroup>
          {s.cols.map((c, i) => <col key={i} style={{ width: `${c}%` }} />)}
        </colgroup>
        <tbody>
          {s.rows.map((row, i) => (
            <tr key={i}>
              {row.map((cell, j) => (
                <td
                  key={j}
                  style={{
                    border: '1px solid rgba(120,120,120,0.55)',
                    padding: '5px 7px',
                    verticalAlign: 'top',
                    wordBreak: 'break-word'
                  }}
                >
                  {cell.paras.map((p, k) => (
                    <div key={k} style={{ textAlign: p.align || 'left', lineHeight: 1.2 }}>
                      {p.runs.map((r, l) => {
                        const segs = runSegments(r.t, pageHighlights);
                        return (
                          <span
                            key={l}
                            style={{
                              fontWeight: r.bold ? 700 : 400,
                              fontStyle: r.italic ? 'italic' : 'normal',
                              fontSize: r.size || 12,
                              color: r.color ? `#${r.color}` : DEFAULT_TEXT
                            }}
                          >
                            {segs.map((seg, m) =>
                              seg.mark ? (
                                <mark key={m} data-hlid={seg.id} className="kn-hl-plain" style={{ background: seg.color, color: 'inherit' }}>
                                  {seg.text}
                                </mark>
                              ) : (
                                seg.text
                              )
                            )}
                          </span>
                        );
                      })}
                    </div>
                  ))}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SlideCanvas({ slide, pageNum, pageHighlights = [] }) {
  const defaultColor = contrastText(slide.bg);
  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        position: 'relative',
        overflow: 'hidden',
        background: slide.bg ? `#${slide.bg}` : '#ffffff',
        borderRadius: 6
      }}
    >
      {slide.shapes.map((s, i) => {
        if (s.type === 'text') return <TextShape key={i} s={s} defaultColor={defaultColor} pageHighlights={pageHighlights} />;
        if (s.type === 'box') {
          return (
            <div
              key={i}
              style={{
                position: 'absolute',
                left: `${s.x}%`,
                top: `${s.y}%`,
                width: `${s.w}%`,
                height: `${s.h}%`,
                background: `#${s.bg}`,
                ...(s.rot ? { transform: `rotate(${s.rot}deg)`, transformOrigin: '50% 50%' } : {})
              }}
            />
          );
        }
        if (s.type === 'image') {
          return (
            <img
              key={i}
              src={s.src}
              alt=""
              draggable={false}
              style={{
                position: 'absolute',
                left: `${s.x}%`,
                top: `${s.y}%`,
                width: `${s.w}%`,
                height: `${s.h}%`,
                objectFit: 'fill',
                ...(s.rot ? { transform: `rotate(${s.rot}deg)`, transformOrigin: '50% 50%' } : {})
              }}
            />
          );
        }
        if (s.type === 'table') return <TableShape key={i} s={s} pageHighlights={pageHighlights} />;
        return null;
      })}
    </div>
  );
}

function SlidePage({ slide, pageNum, designW, designH, zoom, saved, onBookmarkPage, single, highlights }) {
  const pageHighlights = highlights.filter((h) => h.pageNumber === pageNum);
  const wrapRef = useRef(null);
  const [fit, setFit] = useState(1);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const parent = el.parentElement;
    const update = () => setFit(Math.min((parent.clientWidth - 16) / designW, 1.4));
    update();
    const ro = new ResizeObserver(update);
    ro.observe(parent);
    return () => ro.disconnect();
  }, [designW]);

  const scale = fit * (zoom / 100);

  return (
    // data-page lets handleMouseUp attribute a selection to the slide it was
    // actually made on (scrolling in continuous mode otherwise records
    // currentPage — always 1 until you click the page controls).
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      data-page={pageNum}
      className={`relative w-full flex justify-center ${single ? '' : 'py-1'}`}
    >
      <div
        ref={wrapRef}
        className="w-full flex justify-center relative"
        style={{ height: designH * scale }}
      >
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: '50%',
            marginLeft: -(designW * scale) / 2,
            width: designW * scale,
            height: designH * scale,
            boxShadow: '0 18px 48px -18px rgba(0,0,0,0.65)',
            borderRadius: 6
          }}
        >
          <div
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: designW,
              height: designH,
              transform: `scale(${scale})`,
              transformOrigin: 'top left'
            }}
          >
            <SlideCanvas slide={slide} pageNum={pageNum} pageHighlights={pageHighlights} />
          </div>

          {/* chrome — unscaled */}
          <div className="absolute top-2 right-3 z-10 text-[10px] font-mono text-slate-500 bg-white/85 px-2 py-0.5 rounded">
            Slide {pageNum}
          </div>
          {pageHighlights.length > 0 && (
            <div className="absolute top-2 left-1/2 -translate-x-1/2 z-10 flex items-center gap-1 px-2 py-0.5 rounded bg-amber-500/20 border border-amber-400/30">
              <span className="text-[9px] font-bold text-amber-700">{pageHighlights.length} highlight{pageHighlights.length > 1 ? 's' : ''}</span>
            </div>
          )}
          <div className="absolute top-2 left-3 z-10">
            <button
              onClick={() => onBookmarkPage(pageNum)}
              title={saved ? `Slide ${pageNum} bookmarked — click to remove it` : `Bookmark slide ${pageNum}`}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-[10px] font-bold uppercase tracking-wider border transition shadow-lg ${
                saved
                  ? 'bg-primary text-white border-primary shadow-primary/40'
                  : 'bg-midnight/80 text-ivory/80 border-white/15 hover:border-primary/60 hover:text-secondary'
              }`}
            >
              {saved ? <BookmarkCheck className="w-3 h-3" /> : <Bookmark className="w-3 h-3" />}
              {saved ? 'Saved' : 'Bookmark'}
            </button>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

export default function SlideViewer({
  documentId,
  onSlidesLoaded,
  savedPages,
  onBookmarkPage,
  onMouseUp,
  viewMode = 'continuous',
  fallbackText = '',
  highlights = [],
  onMarkClick
}) {
  const { currentPage, zoomLevel } = useApp();
  const [state, setState] = useState({ loading: true, error: false, slides: [], widthPt: 960, heightPt: 540 });
  const rootRef = useRef(null);

  // Scroll the deck so the current slide is visible when the user navigates
  // with the arrows or types a page number (continuous mode renders every
  // slide but the viewport previously stayed where it was).
  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const slideEl = el.querySelector(`[data-page="${currentPage}"]`);
    if (slideEl) slideEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [currentPage]);

  useEffect(() => {
    let cancelled = false;
    setState((s) => ({ ...s, loading: true, error: false }));
    api
      .get(`/documents/${documentId}/slides`)
      .then(({ data }) => {
        if (cancelled) return;
        setState({ loading: false, error: false, slides: data.slides, widthPt: data.widthPt, heightPt: data.heightPt });
        onSlidesLoaded?.(data.slides.length);
      })
      .catch(() => {
        if (!cancelled) setState((s) => ({ ...s, loading: false, error: true }));
      });
    return () => { cancelled = true; };
  }, [documentId]);

  if (state.loading) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center">
        <div className="w-12 h-12 border-4 border-accent border-t-transparent rounded-full animate-spin" />
        <span className="text-sm text-ivory/70 mt-4">Rendering slides…</span>
      </div>
    );
  }

  if (state.error) {
    return (
      <div className="flex-1 overflow-auto p-8" onMouseUp={onMouseUp}>
        <div className="max-w-4xl mx-auto mb-4 p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs flex items-center gap-2">
          <AlertTriangle className="w-4 h-4" /> Couldn't render these slides — showing extracted text instead.
        </div>
        <div className="max-w-4xl mx-auto p-10 rounded-2xl border border-glass-borderDark bg-midnight-panel shadow-2xl">
          <div className="text-sm whitespace-pre-wrap leading-relaxed">
            {fallbackText.split('\n').map((line, i) => (
              <p key={i} className="my-1.5">{line || '\u00a0'}</p>
            ))}
          </div>
        </div>
      </div>
    );
  }

  const pages = viewMode === 'single'
    ? state.slides.filter((_, i) => i + 1 === currentPage)
    : state.slides;

  return (
    <div ref={rootRef} onMouseUp={onMouseUp} onClick={onMarkClick} className="flex-1 overflow-auto p-6 bg-midnight/60 relative">
      <div className="max-w-5xl mx-auto space-y-4">
        {pages.length === 0 && (
          <div className="text-center py-16">
            <FileText className="w-10 h-10 text-ivory/20 mx-auto mb-3" />
            <p className="text-xs text-ivory/60">No slides to display.</p>
          </div>
        )}
        {pages.map((slide, i) => {
          const pageNum = viewMode === 'single' ? currentPage : i + 1;
          return (
            <SlidePage
              key={pageNum}
              slide={slide}
              pageNum={pageNum}
              designW={state.widthPt}
              designH={state.heightPt}
              zoom={zoomLevel}
              saved={savedPages.has(pageNum)}
              onBookmarkPage={onBookmarkPage}
              single={viewMode === 'single'}
              highlights={highlights}
            />
          );
        })}
      </div>
    </div>
  );
}
