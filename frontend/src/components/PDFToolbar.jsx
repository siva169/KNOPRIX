import React from 'react';
import {
  ZoomIn, ZoomOut, ChevronLeft, ChevronRight, BookOpen, Layers, Printer,
  Bookmark, BookmarkCheck, Eraser, MessageSquare, Maximize2, Minimize2,
  MousePointer2, Type, Highlighter, Underline, Strikethrough, StickyNote,
  MessageSquareText, Settings2, MoreHorizontal, PanelLeft, ScanText
} from 'lucide-react';
import { useApp } from '../context/AppContext.jsx';

const ANNOTATION_TOOLS = [
  { id: 'yellow', label: 'Yellow Highlighter', shortcut: '1', icon: Highlighter, color: '#fde047' },
  { id: 'green', label: 'Green Highlighter', shortcut: '2', icon: Highlighter, color: '#4ade80' },
  { id: 'underline', label: 'Underline', shortcut: '3', icon: Underline },
  { id: 'strikethrough', label: 'Strikethrough', shortcut: '4', icon: Strikethrough },
  { id: 'inline-text', label: 'Inline Text', shortcut: '5', icon: Type },
  { id: 'inline-note', label: 'Inline Note', shortcut: '6', icon: StickyNote },
  { id: 'popup-note', label: 'Pop-up Note', shortcut: '7', icon: MessageSquareText },
];

export default function PDFToolbar({
  numPages, viewMode, setViewMode, currentPageSaved = false, onBookmarkPage,
  eraseMode = false, setEraseMode, highlightCount = 0, onOpenChat,
  focusMode = false, onToggleFocusMode, browseMode, setBrowseMode,
  annotationTool, setAnnotationTool, thumbnailsOpen, onToggleThumbnails,
}) {
  const { currentPage, setCurrentPage, zoomLevel, setZoomLevel, activeDocument } = useApp();
  const [annotationMenuOpen, setAnnotationMenuOpen] = React.useState(false);
  const [viewMenuOpen, setViewMenuOpen] = React.useState(false);

  const total = numPages || 1;
  const progress = Math.round((Math.min(currentPage, total) / total) * 100);
  const activeAnnotation = ANNOTATION_TOOLS.find((tool) => tool.id === annotationTool) || ANNOTATION_TOOLS[0];
  const ActiveAnnotationIcon = activeAnnotation.icon;

  return (
    <div className="min-h-12 border-b border-glass-borderDark glass-panel px-2 sm:px-4 py-1 flex items-center justify-between gap-2 sm:gap-3 text-xs select-none w-full z-10 shrink-0 overflow-x-auto">
      <div className="flex items-center gap-2 truncate max-w-xs shrink-0">
        <span className="uppercase px-2 py-0.5 rounded bg-secondary/15 text-secondary font-bold text-[10px]">
          {activeDocument?.file_type || 'PDF'}
        </span>
        <span className="font-semibold text-ivory truncate">{activeDocument?.file_name}</span>
      </div>

      <div className="flex items-center gap-1.5 sm:gap-2 bg-midnight-panel px-2 sm:px-3 py-1 rounded-xl border border-glass-borderDark shrink-0">
        <span className="hidden lg:inline font-mono text-[10px] text-secondary/80" aria-label={`${progress}% read`}>
          {progress}% read
        </span>
        <button
          onClick={() => setCurrentPage(1)}
          disabled={currentPage <= 1}
          className="p-1 rounded hover:bg-white/10 text-ivory/70 disabled:opacity-30 transition"
          title="First page"
          aria-label="First page"
        >
          <ChevronLeft className="w-3.5 h-3.5" />
        </button>
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
        <button
          onClick={() => setCurrentPage(total)}
          disabled={currentPage >= total}
          className="p-1 rounded hover:bg-white/10 text-ivory/70 disabled:opacity-30 transition"
          title="Last page"
          aria-label="Last page"
        >
          <ChevronRight className="w-3.5 h-3.5" />
        </button>
      </div>

      <div className="flex items-center gap-1 sm:gap-2 shrink-0">
        <button
          onClick={() => setBrowseMode(!browseMode)}
          className={`p-1.5 rounded-xl border transition flex items-center gap-1.5 font-semibold ${
            browseMode
              ? 'bg-primary/20 text-secondary border-primary/60'
              : 'bg-midnight-panel text-ivory/70 border-glass-borderDark hover:bg-white/10'
          }`}
          title={browseMode ? 'Browse mode: click and select text to annotate' : 'Text selection mode'}
          aria-label={browseMode ? 'Switch to text selection mode' : 'Switch to browse mode'}
        >
          {browseMode ? <MousePointer2 className="w-3.5 h-3.5" /> : <ScanText className="w-3.5 h-3.5" />}
          <span className="hidden xl:inline text-[10px]">{browseMode ? 'Browse' : 'Text Selection'}</span>
        </button>
        <div className="relative">
          <button
            onClick={() => setAnnotationMenuOpen((open) => !open)}
            className="p-1.5 rounded-xl bg-midnight-panel hover:bg-white/10 text-ivory/80 border border-glass-borderDark transition flex items-center gap-1.5 font-semibold"
            title="Choose annotation tool"
            aria-haspopup="menu"
            aria-expanded={annotationMenuOpen}
          >
            <ActiveAnnotationIcon className="w-3.5 h-3.5" style={activeAnnotation.color ? { color: activeAnnotation.color } : undefined} />
            <span className="hidden xl:inline text-[10px]">{activeAnnotation.label}</span>
            <ChevronRight className={`w-3 h-3 transition-transform ${annotationMenuOpen ? 'rotate-90' : ''}`} />
          </button>
          {annotationMenuOpen && (
            <div className="absolute right-0 top-full mt-2 w-64 rounded-xl border border-glass-borderDark bg-midnight-panel shadow-2xl p-2 z-30" role="menu">
              {ANNOTATION_TOOLS.map((tool) => {
                const Icon = tool.icon;
                return (
                  <button
                    key={tool.id}
                    onClick={() => { setAnnotationTool(tool.id); setAnnotationMenuOpen(false); }}
                    className={`w-full flex items-center gap-2 px-2 py-2 rounded-lg text-left transition ${
                      annotationTool === tool.id ? 'bg-primary/20 text-secondary' : 'text-ivory/80 hover:bg-white/10'
                    }`}
                    role="menuitem"
                  >
                    <span className="w-4 h-4 rounded-full border border-white/20 flex items-center justify-center">
                      {annotationTool === tool.id && <span className="w-2 h-2 rounded-full bg-secondary" />}
                    </span>
                    <Icon className="w-3.5 h-3.5" style={tool.color ? { color: tool.color } : undefined} />
                    <span className="text-[11px] flex-1">{tool.label}</span>
                    <kbd className="text-[9px] text-ivory/40">{tool.shortcut}</kbd>
                  </button>
                );
              })}
              <div className="border-t border-white/10 mt-1 pt-1">
                <button
                  onClick={() => { setAnnotationMenuOpen(false); }}
                  className="w-full flex items-center gap-2 px-2 py-2 rounded-lg text-ivory/70 hover:bg-white/10 text-left"
                  role="menuitem"
                >
                  <MoreHorizontal className="w-3.5 h-3.5" />
                  <span className="text-[11px]">Show more annotation tools</span>
                </button>
                <button
                  onClick={() => { setAnnotationMenuOpen(false); }}
                  className="w-full flex items-center gap-2 px-2 py-2 rounded-lg text-ivory/70 hover:bg-white/10 text-left"
                  role="menuitem"
                >
                  <Settings2 className="w-3.5 h-3.5" />
                  <span className="text-[11px]">Configure annotations</span>
                </button>
              </div>
            </div>
          )}
        </div>
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
        <div className="relative">
          <button
            onClick={() => setViewMenuOpen((open) => !open)}
            className="p-1.5 rounded-xl bg-midnight-panel hover:bg-white/10 text-ivory/70 border border-glass-borderDark transition flex items-center gap-1"
            title="View mode"
            aria-haspopup="menu"
            aria-expanded={viewMenuOpen}
          >
            {viewMode === 'continuous' ? <Layers className="w-3.5 h-3.5" /> : <BookOpen className="w-3.5 h-3.5" />}
            <span className="hidden xl:inline text-[10px]">View Mode</span>
          </button>
          {viewMenuOpen && (
            <div className="absolute right-0 top-full mt-2 w-44 rounded-xl border border-glass-borderDark bg-midnight-panel shadow-2xl p-1.5 z-30" role="menu">
              {[
                ['single', 'Single Page', BookOpen],
                ['continuous', 'Continuous', Layers],
              ].map(([mode, label, Icon]) => (
                <button
                  key={mode}
                  onClick={() => { setViewMode(mode); setViewMenuOpen(false); }}
                  className={`w-full flex items-center gap-2 px-2 py-2 rounded-lg text-left text-[11px] transition ${
                    viewMode === mode ? 'bg-primary/20 text-secondary' : 'text-ivory/80 hover:bg-white/10'
                  }`}
                  role="menuitem"
                >
                  <Icon className="w-3.5 h-3.5" />
                  {label}
                </button>
              ))}
            </div>
          )}
        </div>
        {onToggleThumbnails && (
          <button
            onClick={onToggleThumbnails}
            className={`p-1.5 rounded-xl border transition ${thumbnailsOpen ? 'bg-primary/20 text-secondary border-primary/60' : 'bg-midnight-panel text-ivory/70 border-glass-borderDark hover:bg-white/10'}`}
            title={thumbnailsOpen ? 'Hide page thumbnails' : 'Show page thumbnails'}
            aria-label={thumbnailsOpen ? 'Hide page thumbnails' : 'Show page thumbnails'}
          >
            <PanelLeft className="w-3.5 h-3.5" />
          </button>
        )}
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
        {onToggleFocusMode && (
          <button
            onClick={onToggleFocusMode}
            title={focusMode ? 'Exit focus mode (Escape)' : 'Enter focus mode'}
            aria-label={focusMode ? 'Exit focus mode' : 'Enter focus mode'}
            className="p-1.5 rounded-xl border border-glass-borderDark text-ivory/70 hover:text-secondary hover:bg-white/10 transition"
          >
            {focusMode ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
          </button>
        )}
      </div>
    </div>
  );
}
