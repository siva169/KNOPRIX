import React from 'react';
import { ZoomIn, ZoomOut, ChevronLeft, ChevronRight, BookOpen, Layers, Printer, Bookmark, BookmarkCheck, Eraser, MessageSquare } from 'lucide-react';
import { useApp } from '../context/AppContext.jsx';

export default function PDFToolbar({ numPages, viewMode, setViewMode, currentPageSaved = false, onBookmarkPage, eraseMode = false, setEraseMode, highlightCount = 0, onOpenChat }) {
  const { currentPage, setCurrentPage, zoomLevel, setZoomLevel, activeDocument } = useApp();

  const total = numPages || 1;

  return (
    <div className="h-12 border-b border-glass-borderDark glass-panel px-2 sm:px-4 flex items-center justify-between gap-2 sm:gap-3 text-xs select-none w-full z-10 shrink-0 overflow-x-auto">
      <div className="flex items-center gap-2 truncate max-w-xs shrink-0">
        <span className="uppercase px-2 py-0.5 rounded bg-secondary/15 text-secondary font-bold text-[10px]">
          {activeDocument?.file_type || 'PDF'}
        </span>
        <span className="font-semibold text-ivory truncate">{activeDocument?.file_name}</span>
      </div>

      <div className="flex items-center gap-1.5 sm:gap-2 bg-midnight-panel px-2 sm:px-3 py-1 rounded-xl border border-glass-borderDark shrink-0">
        <button
          onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
          disabled={currentPage <= 1}
          className="p-1 rounded hover:bg-white/10 text-ivory/70 disabled:opacity-30 transition"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
        <span className="text-ivory font-mono font-medium flex items-center gap-1">
          Page
          <input
            type="number"
            min={1}
            max={total}
            value={currentPage}
            onChange={(e) => {
              const v = Number(e.target.value);
              if (v >= 1 && v <= total) setCurrentPage(v);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') (e.target).blur();
            }}
            title="Type a page number and press Enter to jump"
            className="w-12 text-center rounded-lg bg-midnight/60 border border-glass-borderDark text-accent font-bold py-0.5 focus:outline-none focus:border-primary transition"
          />
          of {total}
        </span>
        <button
          onClick={() => setCurrentPage(Math.min(total, currentPage + 1))}
          disabled={currentPage >= total}
          className="p-1 rounded hover:bg-white/10 text-ivory/70 disabled:opacity-30 transition"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>

      <div className="flex items-center gap-1 sm:gap-2 shrink-0">
        <button
          onClick={onBookmarkPage}
          title={currentPageSaved ? 'This page is bookmarked — click to remove it' : 'Bookmark this page'}
          className={`p-1.5 rounded-xl border transition flex items-center gap-1.5 font-semibold ${
            currentPageSaved
              ? 'bg-primary text-white border-primary shadow-lg shadow-primary/30'
              : 'bg-midnight-panel hover:bg-white/10 text-ivory/70 border-glass-borderDark'
          }`}
        >
          {currentPageSaved ? <BookmarkCheck className="w-3.5 h-3.5" /> : <Bookmark className="w-3.5 h-3.5" />}
          <span className="hidden md:inline text-[10px]">{currentPageSaved ? 'Saved' : 'Bookmark page'}</span>
        </button>
        {setEraseMode && highlightCount > 0 && (
          <button
            onClick={() => setEraseMode(!eraseMode)}
            title={eraseMode ? 'Click a highlight to remove it (eraser ON)' : 'Toggle eraser to remove highlights'}
            className={`p-1.5 rounded-xl border transition flex items-center gap-1.5 font-semibold ${
              eraseMode
                ? 'bg-rose-500/20 text-rose-300 border-rose-400/50 shadow-lg shadow-rose-500/20'
                : 'bg-midnight-panel hover:bg-white/10 text-ivory/70 border-glass-borderDark'
            }`}
          >
            <Eraser className="w-3.5 h-3.5" />
            <span className="hidden md:inline text-[10px]">{eraseMode ? 'Erasing' : 'Erase'}</span>
          </button>
        )}
        <div className="flex items-center gap-1 bg-midnight-panel px-2 py-1 rounded-xl border border-glass-borderDark">
          <button onClick={() => setZoomLevel(Math.max(50, zoomLevel - 10))} className="p-1 rounded hover:bg-white/10 text-ivory/70" title="Zoom out">
            <ZoomOut className="w-3.5 h-3.5" />
          </button>
          <span className="text-[11px] font-mono text-ivory/70 w-10 text-center">{zoomLevel}%</span>
          <button onClick={() => setZoomLevel(Math.min(200, zoomLevel + 10))} className="p-1 rounded hover:bg-white/10 text-ivory/70" title="Zoom in">
            <ZoomIn className="w-3.5 h-3.5" />
          </button>
        </div>
        <button
          onClick={() => setViewMode(viewMode === 'continuous' ? 'single' : 'continuous')}
          className="p-1.5 rounded-xl bg-midnight-panel hover:bg-white/10 text-ivory/70 border border-glass-borderDark transition"
          title={viewMode === 'continuous' ? 'Single page' : 'Continuous scroll'}
        >
          {viewMode === 'continuous' ? <BookOpen className="w-3.5 h-3.5" /> : <Layers className="w-3.5 h-3.5" />}
        </button>
        <button
          onClick={() => { window.print(); }}
          className="p-1.5 rounded-xl bg-midnight-panel hover:bg-white/10 text-ivory/70 border border-glass-borderDark transition"
          title="Print"
        >
          <Printer className="w-3.5 h-3.5" />
        </button>
        {onOpenChat && (
          <button
            onClick={onOpenChat}
            className="p-1.5 rounded-xl bg-primary text-white border border-primary shadow-lg shadow-primary/30 transition flex items-center gap-1.5 font-semibold hover:brightness-110"
            title="Chat with your documents"
          >
            <MessageSquare className="w-3.5 h-3.5" />
            <span className="hidden md:inline text-[10px]">Chat</span>
          </button>
        )}
      </div>
    </div>
  );
}
