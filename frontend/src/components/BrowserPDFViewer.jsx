import React, { useEffect, useRef, useState, useCallback } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import { motion, AnimatePresence } from 'framer-motion';
import { FileText, Bookmark, Copy, AlertTriangle, BookmarkCheck, Sparkles, Highlighter, Eraser, Volume2, Square } from 'lucide-react';
import { useApp } from '../context/AppContext.jsx';
import PDFToolbar from './PDFToolbar.jsx';
import SlideViewer from './SlideViewer.jsx';
import api, { ACCESS_KEY } from '../api';
import { API_BASE } from '../config';
import { HIGHLIGHT_COLORS, colorById } from '../highlights';

// Worker served locally (frontend/public/) — no CDN dependency, works offline
pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.js';

export default function BrowserPDFViewer({ onOpenChat }) {
  const {
    activeDocument, currentPage, setCurrentPage, zoomLevel,
    highlightSnippet, notify, activeProject, fetchBookmarks
  } = useApp();

  const [numPages, setNumPages] = useState(0);
  const [pdfDoc, setPdfDoc] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [viewMode, setViewMode] = useState('continuous');
  const [selection, setSelection] = useState(null); // {text, x, y, page}
  const [savedPages, setSavedPages] = useState(new Set());
  const [highlights, setHighlights] = useState([]);
  const [colorMenuOpen, setColorMenuOpen] = useState(false);
  const [matchAllMode, setMatchAllMode] = useState(false); // paint every occurrence
  const [eraseMode, setEraseMode] = useState(false);
  const [markMenu, setMarkMenu] = useState(null); // {id, x, y}
  const highlightsRef = useRef([]);

  // Keep a ref in sync so renderPage can read the latest highlights without
  // being re-created (and re-rendering every page) on every highlight change.
  useEffect(() => {
    highlightsRef.current = highlights;
  }, [highlights]);

  const pageCanvasRefs = useRef({});
  const pageTextLayerRefs = useRef({});
  const containerRef = useRef(null);

  // ── Track which pages of this document are bookmarked ─────────────────────
  const refreshSavedPages = useCallback(async () => {
    if (!activeProject || !activeDocument) return;
    try {
      const { data } = await api.get(`/projects/${activeProject.id}/bookmarks`);
      const pages = new Set(
        data.bookmarks
          .filter((b) => b.document_id === activeDocument.id && b.bookmark_type === 'page')
          .map((b) => b.page_number)
      );
      setSavedPages(pages);
    } catch {
      /* ignore */
    }
  }, [activeProject, activeDocument]);

  useEffect(() => {
    setSavedPages(new Set());
    refreshSavedPages();
  }, [activeDocument, refreshSavedPages]);

  // ── Saved highlight markers for this document (separate from bookmarks) ──
  const refreshHighlights = useCallback(async () => {
    if (!activeDocument) {
      setHighlights([]);
      return;
    }
    try {
      const { data } = await api.get(`/documents/${activeDocument.id}/highlights`);
      // API returns snake_case columns — normalize to the camelCase shape the
      // renderers expect ({ id, pageNumber, text, color }).
      setHighlights(
        (data.highlights || []).map((h) => ({
          id: h.id,
          pageNumber: h.page_number,
          text: h.text,
          color: h.color,
          matchAll: !!h.match_all,
        }))
      );
    } catch {
      setHighlights([]);
    }
  }, [activeDocument]);

  useEffect(() => {
    setHighlights([]);
    refreshHighlights();
  }, [activeDocument, refreshHighlights]);

  // ── Load PDF ───────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!activeDocument) {
      setPdfDoc(null);
      setNumPages(0);
      setError(null);
      return;
    }
    const fileType = (activeDocument.file_type || '').toLowerCase();
    if (fileType !== 'pdf') {
      setPdfDoc(null);
      setError(null);
      // Reset the page count so the toolbar never shows the previous
      // document's "of N" (slides re-set it via onSlidesLoaded after parsing).
      setNumPages(activeDocument.page_count || 1);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    setPdfDoc(null);

    const token = localStorage.getItem(ACCESS_KEY);
    pdfjsLib
      .getDocument({
        url: `${API_BASE}/documents/${activeDocument.id}/stream`,
        httpHeaders: token ? { Authorization: `Bearer ${token}` } : {},
      })
      .promise.then((doc) => {
        if (cancelled) return;
        setPdfDoc(doc);
        setNumPages(doc.numPages);
        setCurrentPage(1);
        setLoading(false);
      })
      .catch(() => {
        if (cancelled) return;
        setError('pdf_load_failed');
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [activeDocument]);

  // ── Render pages ───────────────────────────────────────────────────────────
  const renderPage = useCallback(
    async (pageNum) => {
      if (!pdfDoc) return;
      const canvas = pageCanvasRefs.current[pageNum];
      const textLayer = pageTextLayerRefs.current[pageNum];
      if (!canvas) return;
      try {
        const page = await pdfDoc.getPage(pageNum);
        // Display scale: 100% = the PDF's natural size, zoomLevel scales it.
        const zoom = zoomLevel / 100;
        // Backing resolution: supersample by 1.5× (and device pixels) so text
        // stays crisp even on 1x displays, then scale the canvas down to its
        // display size. "100%" keeps meaning the real page size.
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        const ss = 1.5;
        const scale = zoom * dpr * ss;
        const viewport = page.getViewport({ scale });
        // The text layer uses the display viewport: pdfjs lays its spans out
        // at viewport.scale × devicePixelRatio, and the layer is scaled back
        // down by 1/dpr — so selection/highlights align at every dpr.
        const displayViewport = page.getViewport({ scale: zoom });
        const displayW = viewport.width / (dpr * ss);
        const displayH = viewport.height / (dpr * ss);
        canvas.width = Math.floor(viewport.width);
        canvas.height = Math.floor(viewport.height);
        canvas.style.width = `${displayW}px`;
        canvas.style.height = `${displayH}px`;
        const ctx = canvas.getContext('2d');
        await page.render({ canvasContext: ctx, viewport }).promise;

        if (textLayer) {
          textLayer.innerHTML = '';
          textLayer.style.width = `${displayW}px`;
          textLayer.style.height = `${displayH}px`;
          textLayer.style.position = 'absolute';
          textLayer.style.top = '0';
          textLayer.style.left = '0';
          textLayer.style.transform = `scale(${1 / dpr})`;
          // Must match the viewport scale passed to renderTextLayer (pdfjs
          // warns otherwise).
          textLayer.style.setProperty('--scale-factor', String(zoom));
          try {
            const textContent = await page.getTextContent();
            await pdfjsLib.renderTextLayer({
              textContentSource: textContent,
              container: textLayer,
              viewport: displayViewport,
              textDivs: [],
            }).promise;
          } catch {
            /* text layer is best-effort */
          }
          applyPageHighlights(textLayer, pageNum, highlightsRef.current);
        }
      } catch {
        /* skip broken page */
      }
    },
    [pdfDoc, zoomLevel]
  );

  // Re-render pages whenever highlights change too — renderPage reads the
  // fresh highlights ref and rebuilds each text layer, so added marks appear
  // and removed marks disappear without a manual refresh.
  useEffect(() => {
    if (!pdfDoc || numPages === 0) return;
    if (viewMode === 'continuous') {
      for (let p = 1; p <= numPages; p++) renderPage(p);
    } else {
      renderPage(currentPage);
    }
  }, [pdfDoc, numPages, viewMode, currentPage, renderPage, highlights]);

  // Scroll the viewer so the current page is actually visible when the user
  // clicks next/prev or types a page number (continuous mode renders every
  // page, but the viewport previously stayed where it was).
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const pageEl = el.querySelector(`[data-page="${currentPage}"]`);
    if (pageEl) pageEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [currentPage, activeDocument]);

  // ── Per-page bookmarking ──────────────────────────────────────────────────
  const bookmarkPage = async (pageNum) => {
    if (!activeProject || !activeDocument) return;
    const existing = savedPages.has(pageNum);
    try {
      if (existing) {
        const { data } = await api.get(`/projects/${activeProject.id}/bookmarks`);
        const bm = data.bookmarks.find(
          (b) => b.document_id === activeDocument.id && b.bookmark_type === 'page' && b.page_number === pageNum
        );
        if (bm) {
          await api.delete(`/bookmarks/${bm.id}`);
          notify(`Removed page ${pageNum} bookmark`, 'info');
        }
      } else {
        await api.post('/bookmarks', {
          projectId: activeProject.id,
          documentId: activeDocument.id,
          pageNumber: pageNum,
          highlightedText: '',
          bookmarkType: 'page'
        });
        notify(`Bookmarked page ${pageNum}`, 'success');
      }
    } catch {
      notify('Could not update page bookmark', 'error');
    }
    refreshSavedPages();
    fetchBookmarks(activeProject.id);
  };

  const PageBookmarkButton = ({ pageNum }) => {
    const saved = savedPages.has(pageNum);
    return (
      <button
        onClick={() => bookmarkPage(pageNum)}
        title={saved ? `Page ${pageNum} bookmarked — click to remove it` : `Bookmark page ${pageNum}`}
        className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-[10px] font-bold uppercase tracking-wider border transition shadow-lg ${
          saved
            ? 'bg-primary text-white border-primary shadow-primary/40'
            : 'bg-midnight/80 text-ivory/80 border-white/15 hover:border-primary/60 hover:text-secondary'
        }`}
      >
        {saved ? <BookmarkCheck className="w-3 h-3" /> : <Bookmark className="w-3 h-3" />}
        {saved ? 'Saved' : 'Bookmark'}
      </button>
    );
  };

  // ── Selection → action popover ─────────────────────────────────────────────
  const handleMouseUp = (e) => {
    // Clicking an existing highlight marker opens the remove menu instead of
    // the selection popover.
    if (e?.target?.closest?.('mark[data-hlid]')) {
      setSelection(null);
      return;
    }
    const sel = window.getSelection();
    const text = sel?.toString().trim();
    if (text && text.length > 0) {
      const range = sel.getRangeAt(0);
      const rect = range.getBoundingClientRect();
      const pageEl = range.startContainer?.parentElement?.closest?.('[data-page]');
      const page = pageEl ? Number(pageEl.dataset.page) : currentPage;
      // Clamp so the popover never renders off-screen (mobile / edge selections).
      // Half-width follows the viewport: 4 buttons need ~185px each side on
      // phones, ~150px on desktop (fewer, roomier rows).
      const half = window.innerWidth < 640 ? 185 : 150;
      const x = Math.min(
        Math.max(rect.left + rect.width / 2, half + 8),
        window.innerWidth - half - 8,
      );
      const y = Math.min(Math.max(rect.top - 8, 8), window.innerHeight - 170);
      setSelection({ text, x, y, page });
      setColorMenuOpen(false);
      setMatchAllMode(false);
      setMarkMenu(null);
    } else {
      setSelection(null);
    }
  };

  const saveBookmark = async (sel) => {
    if (!activeProject || !activeDocument) return;
    try {
      await api.post('/bookmarks', {
        projectId: activeProject.id,
        documentId: activeDocument.id,
        pageNumber: sel.page || currentPage,
        highlightedText: sel.text,
        notes: '',
        colorTag: 'yellow',
        bookmarkType: 'text',
        tags: ['selected']
      });
      notify('Bookmark added to your collection', 'success');
      setSelection(null);
      fetchBookmarks(activeProject.id);
    } catch {
      notify('Could not save bookmark', 'error');
    }
  };

  const copyText = async (sel) => {
    await navigator.clipboard.writeText(sel.text);
    notify('Copied to clipboard', 'success');
    setSelection(null);
  };

  // ── Read aloud (browser speech — offline, no key) ──────────────────────────
  const [speaking, setSpeaking] = useState(false);

  const speakSelection = (sel) => {
    if (!('speechSynthesis' in window)) {
      notify('Speech not supported in this browser', 'error');
      return;
    }
    window.speechSynthesis.cancel();
    const text = sel.text.replace(/\s+/g, ' ').trim().slice(0, 2000);
    if (!text) return;
    const u = new SpeechSynthesisUtterance(text);
    u.rate = 1;
    u.onend = () => setSpeaking(false);
    u.onerror = () => setSpeaking(false);
    setSpeaking(true);
    window.speechSynthesis.speak(u);
  };

  const stopSpeaking = () => {
    if ('speechSynthesis' in window) window.speechSynthesis.cancel();
    setSpeaking(false);
  };

  // ── Highlight save / remove ────────────────────────────────────────────────
  const saveHighlight = async (sel, color) => {
    if (!activeProject || !activeDocument) return;
    // Collapse newlines / repeated spaces to a single space so selections
    // that span a line break still match when the mark is rendered.
    const text = sel.text.replace(/\s+/g, ' ').trim();
    if (!text) return;
    try {
      const { data } = await api.post('/highlights', {
        projectId: activeProject.id,
        documentId: activeDocument.id,
        pageNumber: sel.page || currentPage,
        text,
        color,
        matchAll: matchAllMode,
      });
      setHighlights((h) => [
        ...h,
        { id: data.id, pageNumber: sel.page || currentPage, text, color, matchAll: matchAllMode },
      ]);
      notify('Highlighted — saved for this document', 'success');
      setSelection(null);
      setColorMenuOpen(false);
    } catch {
      notify('Could not save highlight', 'error');
    }
  };

  const removeHighlight = async (id) => {
    try {
      await api.delete(`/highlights/${id}`);
      setHighlights((h) => h.filter((x) => x.id !== id));
      notify('Highlight removed', 'info');
      setMarkMenu(null);
    } catch {
      notify('Could not remove highlight', 'error');
    }
  };

  // Clicking a highlighted <mark>: open a small remove menu, or erase right
  // away when the eraser toggle is on.
  const handleMarkClick = (e) => {
    const mark = e.target.closest?.('mark[data-hlid]');
    if (!mark) {
      setMarkMenu(null);
      setColorMenuOpen(false);
      return;
    }
    e.preventDefault();
    e.stopPropagation();
    const rect = mark.getBoundingClientRect();
    if (eraseMode) {
      removeHighlight(mark.dataset.hlid);
    } else {
      setMarkMenu({
        id: mark.dataset.hlid,
        x: rect.left + rect.width / 2,
        y: rect.top - 8,
      });
    }
  };

  // ── PDF text-layer highlight application ──────────────────────────────────
  // Wraps matching text across pdfjs text-layer spans in <mark> elements with
  // the highlight color — called after each renderPage so highlights persist
  // across zoom changes (the text layer is rebuilt each time).
  const wrapOffsets = (nodes, start, end, hlId, bg) => {
    let offset = 0;
    for (const node of nodes) {
      const len = node.textContent.length;
      const nodeStart = offset;
      const nodeEnd = offset + len;
      if (nodeEnd <= start || nodeStart >= end) {
        offset = nodeEnd;
        continue;
      }
      const s = Math.max(nodeStart, start) - nodeStart;
      const e = Math.min(nodeEnd, end) - nodeStart;
      if (s === 0 && e === len) {
        const mark = document.createElement('mark');
        mark.className = 'kn-hl';
        mark.dataset.hlid = hlId;
        mark.style.setProperty('--hl-bg', bg);
        node.replaceWith(mark);
        mark.appendChild(node);
      } else {
        const before = node.splitText(s);
        before.splitText(e - s);
        const mark = document.createElement('mark');
        mark.className = 'kn-hl';
        mark.dataset.hlid = hlId;
        mark.style.setProperty('--hl-bg', bg);
        before.replaceWith(mark);
        mark.appendChild(before);
      }
      offset = nodeEnd;
    }
  };

  const applyPageHighlights = (textLayer, pageNum, hlList) => {
    if (!textLayer) return;
    const pageHighlights = hlList.filter((h) => h.pageNumber === pageNum);
    if (!pageHighlights.length) return;
    // Collect text nodes outside existing marks (idempotent).
    const textNodes = Array.from(textLayer.querySelectorAll('span'))
      .flatMap((span) => Array.from(span.childNodes))
      .filter(
        (n) => n.nodeType === Node.TEXT_NODE && !n.parentElement.closest('mark')
      );
    if (!textNodes.length) return;
    const full = textNodes.map((n) => n.textContent).join('');
    // ── Fast path: whitespace-insensitive exact match ─────────────────────
    // pdfjs breaks lines across spans with no separator, so a selection that
    // spans lines (or has spacing quirks like "Over view" vs "Overview") only
    // matches when whitespace is ignored. Maps the match back to raw offsets.
    const stripped = full.replace(/\s+/g, '');
    const rawPos = [];
    for (let i = 0; i < full.length; i++) {
      if (!/\s/.test(full[i])) rawPos.push(i);
    }

    // ── Fallback: word-sequence matching ──────────────────────────────────
    // When punctuation differs (quotes, dashes) the exact match misses, so
    // fall back to the longest run of needle words present in order. Word
    // tokens carry raw offsets so the wrapped range still maps to the text.
    const wordRe = /\S+/g;
    const tokens = [];
    let wm;
    while ((wm = wordRe.exec(full))) tokens.push({ s: wm.index, e: wm.index + wm[0].length, w: wm[0].toLowerCase() });
    const layerWords = tokens.map((t) => t.w);

    // Longest consecutive run of needle words present in order in the layer.
    // Edge words may match partially (selections often start/end mid-word);
    // middle words match by prefix so small spacing quirks still pass.
    const findBestRun = (needleWords) => {
      let best = null;
      for (let start = 0; start < needleWords.length; start++) {
        const maxLen = needleWords.length - start;
        if (best && maxLen <= best.len) break;
        for (let len = maxLen; len >= 1; len--) {
          if (best && len <= best.len) break;
          const run = needleWords.slice(start, start + len);
          for (let ti = 0; ti + len <= layerWords.length; ti++) {
            let ok = true;
            for (let k = 0; k < len; k++) {
              const tw = layerWords[ti + k];
              const nw2 = run[k];
              const isEdge = k === 0 || k === len - 1;
              if (isEdge ? !tw.includes(nw2) : !(tw.startsWith(nw2) || nw2.startsWith(tw))) {
                ok = false;
                break;
              }
            }
            if (ok) { best = { startTok: ti, endTok: ti + len - 1, len }; break; }
          }
        }
      }
      return best;
    };

    for (const h of pageHighlights) {
      const needle = h.text.replace(/\s+/g, '');
      if (needle) {
        let wrapped = false;
        let cursor = 0;
        while (true) {
          const idx = stripped.toLowerCase().indexOf(needle.toLowerCase(), cursor);
          if (idx === -1) break;
          const start = rawPos[idx];
          const end = rawPos[idx + needle.length - 1] + 1;
          wrapOffsets(textNodes, start, end, h.id, colorById(h.color).bg);
          wrapped = true;
          cursor = idx + needle.length;
          if (!h.matchAll) break; // precise mode: first occurrence only
        }
        if (wrapped) continue;
      }
      // Word-run fallback (single occurrence) when the exact text differs.
      const needleWords = h.text.match(/\S+/g) || [];
      if (!needleWords.length) continue;
      const best = findBestRun(needleWords.map((w) => w.toLowerCase()));
      if (best) {
        wrapOffsets(textNodes, tokens[best.startTok].s, tokens[best.endTok].e, h.id, colorById(h.color).bg);
      }
    }
  };

  // ── Plain-text line rendering with saved highlights (page 1 docs) ─────────

  // Longest consecutive run of needle words (in order) present on a line — so
  // a selection that wraps across two lines still paints the part of it that
  // sits on each line. Returns the painted range or { len: 0 }.
  const bestRunInLine = (line, words) => {
    let best = { s: -1, e: -1, len: 0 };
    for (let start = 0; start < words.length; start++) {
      for (let end = words.length; end > start && end - start > best.len; end--) {
        const phrase = words.slice(start, end).join(' ');
        const idx = line.indexOf(phrase.toLowerCase());
        if (idx !== -1) {
          best = { s: idx, e: idx + phrase.length, len: end - start };
          break;
        }
      }
    }
    return best;
  };

  const lineMarks = (line, lineIndex) => {
    const ph = highlights.filter((h) => h.pageNumber === 1);
    if (!ph.length) return null;
    const low = line.toLowerCase();
    const ranges = [];
    for (const h of ph) {
      const needle = h.text.replace(/\s+/g, ' ').trim();
      if (!needle) continue;
      const words = needle.split(' ');
      if (h.matchAll) {
        // All-matches mode: paint every occurrence of the phrase on this line.
        const needleLow = needle.toLowerCase();
        let cursor = 0;
        let found = false;
        while (true) {
          const idx = low.indexOf(needleLow, cursor);
          if (idx === -1) break;
          ranges.push({ s: idx, e: idx + needle.length, color: colorById(h.color).bg, id: h.id });
          cursor = idx + needle.length;
          found = true;
        }
        if (found) continue;
      }
      const best = bestRunInLine(low, words);
      if (best.len === 0) continue;
      if (!h.matchAll) {
        // Precise mode: paint only the FIRST line that contains the words.
        let earlier = false;
        for (let li = 0; li < lineIndex; li++) {
          if (bestRunInLine(viewerLines[li].toLowerCase(), words).len > 0) {
            earlier = true;
            break;
          }
        }
        if (earlier) continue;
      }
      ranges.push({ s: best.s, e: best.e, color: colorById(h.color).bg, id: h.id });
    }
    if (!ranges.length) return null;
    ranges.sort((a, b) => a.s - b.s);
    const merged = [];
    for (const r of ranges) {
      const last = merged[merged.length - 1];
      if (last && r.s <= last.e) {
        if (r.e > last.e) last.e = r.e;
      } else {
        merged.push({ ...r });
      }
    }
    const segs = [];
    let pos = 0;
    for (const r of merged) {
      if (r.s > pos) segs.push({ text: line.slice(pos, r.s) });
      segs.push({ text: line.slice(r.s, r.e), mark: true, color: r.color, id: r.id });
      pos = r.e;
    }
    if (pos < line.length) segs.push({ text: line.slice(pos) });
    return segs;
  };

  // ── Empty state ────────────────────────────────────────────────────────────
  if (!activeDocument) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
        <motion.div
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="w-20 h-20 rounded-3xl bg-gradient-to-tr from-primary/25 to-accent/20 border border-primary/30 flex items-center justify-center mb-5"
        >
          <FileText className="w-10 h-10 text-accent" />
        </motion.div>
        <h3 className="text-lg font-bold font-display">No Document Selected</h3>
        <p className="text-xs text-ivory/60 max-w-sm mt-1">
          Pick a document from the sidebar, or upload a PDF / PPTX / DOCX / TXT to
          read with the DSA engine.
        </p>
      </div>
    );
  }

  const fileType = (activeDocument.file_type || '').toLowerCase();
  const isPdf = fileType === 'pdf';
  const isSlideshow = fileType === 'pptx' || fileType === 'ppt';
  const displayText = activeDocument.extracted_text || '';
  const viewerLines = displayText.split('\n');

  // ── Non-PDF text viewer (TXT / DOCX / PPTX / images) ─────────────────────
  const renderTextViewer = () => (
    <div ref={containerRef} onMouseUp={handleMouseUp} onClick={handleMarkClick} className="flex-1 overflow-auto p-2 sm:p-8 bg-midnight/60 relative">
      <div className="w-full max-w-4xl mx-auto p-4 sm:p-10 rounded-2xl border border-glass-borderDark bg-midnight-panel shadow-2xl">
        <div className="flex items-center justify-between border-b border-glass-borderDark pb-4 mb-6 text-xs text-ivory/60 font-mono">
          <span className="uppercase px-2 py-0.5 rounded bg-secondary/15 text-secondary font-bold text-[10px]">
            {activeDocument.file_type || 'DOC'}
          </span>
          <span className="font-semibold text-ivory">{activeDocument.file_name}</span>
          <span className="flex items-center gap-3">
            <span>Page {currentPage} of {activeDocument.page_count || 1}</span>
            <PageBookmarkButton pageNum={1} />
          </span>
        </div>
        <div className="text-sm leading-relaxed whitespace-pre-wrap" style={{ fontSize: `${zoomLevel}%` }}>
          {viewerLines.map((line, i) => {
            const segs = lineMarks(line, i);
            return (
              <p key={i} className="my-1.5">
                {segs
                  ? segs.map((seg, j) =>
                      seg.mark ? (
                        <mark key={j} data-hlid={seg.id} className="kn-hl-plain" style={{ background: seg.color }}>
                          {seg.text}
                        </mark>
                      ) : (
                        <span key={j}>{seg.text || '\u00a0'}</span>
                      )
                    )
                  : line || '\u00a0'}
              </p>
            );
          })}
        </div>
      </div>
    </div>
  );

  // ── PPTX slide viewer (renders like PowerPoint) ────────────────────────────
  const renderSlidesViewer = () => (
    <SlideViewer
      documentId={activeDocument.id}
      onSlidesLoaded={setNumPages}
      savedPages={savedPages}
      onBookmarkPage={bookmarkPage}
      onMouseUp={handleMouseUp}
      onMarkClick={handleMarkClick}
      viewMode={viewMode}
      fallbackText={displayText}
      highlights={highlights}
    />
  );

  // ── PDF canvas viewer ──────────────────────────────────────────────────────
  const renderPDFViewer = () => (
    <div ref={containerRef} onMouseUp={handleMouseUp} onClick={handleMarkClick} className="flex-1 overflow-auto p-2 sm:p-6 bg-midnight/60 relative">
      {highlightSnippet && (
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          className="absolute top-4 left-1/2 -translate-x-1/2 z-30 px-4 py-2 rounded-xl bg-accent/15 border border-accent/40 text-secondary text-xs flex items-center gap-2 shadow-lg"
        >
          <Sparkles className="w-3.5 h-3.5" /> Jumped to: <strong>"{highlightSnippet}"</strong>
        </motion.div>
      )}

      {error === 'pdf_load_failed' && (
        <div className="max-w-4xl mx-auto mb-4 p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs flex items-center gap-2">
          <AlertTriangle className="w-4 h-4" /> PDF stream unavailable — showing extracted text preview instead.
        </div>
      )}

      {loading && (
        <div className="flex flex-col items-center justify-center py-24">
          <div className="w-12 h-12 border-4 border-accent border-t-transparent rounded-full animate-spin" />
          <span className="text-sm text-ivory/70 mt-4">Rendering PDF canvas…</span>
        </div>
      )}

      {pdfDoc && !loading && (
        <div className="flex flex-col items-center gap-4">
          {(viewMode === 'continuous'
            ? Array.from({ length: numPages }, (_, i) => i + 1)
            : [currentPage]
          ).map((pageNum) => (
            <motion.div
              key={pageNum}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="relative shadow-2xl rounded-xl overflow-visible border border-white/10 bg-white"
            >
              <div className="absolute top-2 right-3 z-10 text-[10px] font-mono text-slate-500 bg-white/85 px-2 py-0.5 rounded">
                Page {pageNum} / {numPages}
              </div>
              <div className="absolute top-2 left-3 z-10">
                <PageBookmarkButton pageNum={pageNum} />
              </div>
              <canvas ref={(el) => { pageCanvasRefs.current[pageNum] = el; }} className="block rounded-xl" />
              {/* data-page lets handleMouseUp attribute a selection to the
                  page it was actually made on (continuous scroll otherwise
                  records currentPage, which can be wrong). */}
              <div ref={(el) => { pageTextLayerRefs.current[pageNum] = el; }} data-page={pageNum} className="pdf-text-layer" />
            </motion.div>
          ))}
        </div>
      )}

      {error === 'pdf_load_failed' && (
        <div className="max-w-4xl mx-auto p-10 rounded-2xl border border-glass-borderDark bg-midnight-panel">
          <div className="text-sm whitespace-pre-wrap">
            {displayText.split('\n').map((line, i) => (
              <p key={i} className="my-1">{line || '\u00a0'}</p>
            ))}
          </div>
        </div>
      )}

    </div>
  );

  return (
    <div className="flex-1 flex flex-col h-full relative overflow-hidden w-full">
      <PDFToolbar
        numPages={numPages || activeDocument.page_count || 1}
        viewMode={viewMode}
        setViewMode={setViewMode}
        currentPageSaved={savedPages.has(currentPage)}
        onBookmarkPage={() => bookmarkPage(currentPage)}
        eraseMode={eraseMode}
        setEraseMode={setEraseMode}
        highlightCount={highlights.length}
        onOpenChat={onOpenChat}
      />
      {isPdf ? renderPDFViewer() : isSlideshow ? renderSlidesViewer() : renderTextViewer()}

      {/* Selection → action popover (shared across PDF / text / slides) */}
      <AnimatePresence>
        {selection && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            style={{ top: selection.y, left: selection.x }}
            className="fixed z-50 -translate-x-1/2 glass-panel rounded-xl px-1.5 py-1 shadow-2xl flex flex-col gap-0.5 border border-primary/40 max-w-[94vw]"
          >
            <div className="flex items-center gap-0.5 overflow-x-auto">
              <button onClick={() => saveBookmark(selection)} className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium text-ivory hover:bg-primary/20 hover:text-secondary transition">
                <Bookmark className="w-3.5 h-3.5 text-amber-400" /> <span className="hidden sm:inline">Bookmark</span>
              </button>
              <button onClick={() => copyText(selection)} className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium text-ivory hover:bg-primary/20 hover:text-secondary transition">
                <Copy className="w-3.5 h-3.5" /> <span className="hidden sm:inline">Copy</span>
              </button>
              {speaking ? (
                <button onClick={stopSpeaking} className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium text-secondary bg-primary/20 transition">
                  <Square className="w-3.5 h-3.5" /> <span className="hidden sm:inline">Stop</span>
                </button>
              ) : (
                <button onClick={() => speakSelection(selection)} title="Read this aloud" className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium text-ivory hover:bg-primary/20 hover:text-secondary transition">
                  <Volume2 className="w-3.5 h-3.5 text-accent" /> <span className="hidden sm:inline">Speak</span>
                </button>
              )}
              <button
                onClick={() => setColorMenuOpen((o) => !o)}
                title="Highlight this selection"
                className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium transition ${
                  colorMenuOpen ? 'text-secondary bg-primary/20' : 'text-ivory hover:bg-primary/20 hover:text-secondary'
                }`}
              >
                <Highlighter className="w-3.5 h-3.5 text-amber-400" /> <span className="hidden sm:inline">Highlight</span>
              </button>
            </div>
            {colorMenuOpen && (
              <div className="flex flex-col gap-1.5 px-2.5 pb-2 pt-1.5 border-t border-white/10">
                <button
                  onClick={() => setMatchAllMode((m) => !m)}
                  title="Paint every occurrence of this text, not just the selected spot"
                  className={`flex items-center gap-1.5 text-[10px] font-semibold tracking-wide transition ${
                    matchAllMode ? 'text-secondary' : 'text-ivory/60 hover:text-ivory'
                  }`}
                >
                  <span
                    className={`w-3 h-3 rounded border flex items-center justify-center text-[8px] ${
                      matchAllMode ? 'bg-secondary border-secondary text-midnight' : 'border-white/30'
                    }`}
                  >
                    {matchAllMode ? '✓' : ''}
                  </span>
                  Highlight all matches
                </button>
                <div className="flex items-center gap-1.5">
                {HIGHLIGHT_COLORS.map((c) => (
                  <button
                    key={c.id}
                    title={c.name}
                    onClick={() => saveHighlight(selection, c.id)}
                    className="w-5 h-5 rounded-full border border-white/25 hover:scale-110 hover:border-white transition"
                    style={{ background: c.swatch }}
                  />
                ))}
                </div>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Clicked highlight → remove menu */}
      <AnimatePresence>
        {markMenu && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            style={{ top: markMenu.y, left: markMenu.x }}
            className="fixed z-50 -translate-x-1/2 glass-panel rounded-xl px-2 py-1.5 shadow-2xl flex items-center gap-2 border border-rose-400/40"
          >
            {(() => {
              const hl = highlights.find((h) => h.id === markMenu.id);
              return (
                <>
                  <span
                    className="w-3.5 h-3.5 rounded-full shrink-0"
                    style={{ background: colorById(hl?.color).swatch }}
                  />
                  <span className="text-ivory/80 max-w-[180px] truncate font-medium text-xs">
                    {hl?.text}
                  </span>
                  {hl?.matchAll && (
                    <span className="px-1.5 py-0.5 rounded bg-secondary/20 text-secondary text-[9px] font-bold tracking-wider">
                      ALL
                    </span>
                  )}
                  <button
                    onClick={() => removeHighlight(markMenu.id)}
                    className="flex items-center gap-1 px-2 py-1 rounded-lg text-rose-300 hover:bg-rose-500/15 font-semibold transition"
                  >
                    <Eraser className="w-3.5 h-3.5" /> Remove
                  </button>
                </>
              );
            })()}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
