import React, { useEffect, useRef } from 'react';
import { AlertTriangle } from 'lucide-react';

const label = (document) =>
  document.title || document.filename || document.file_name || 'Untitled document';

export default function ChatContextConsentDialog({
  open,
  providerName,
  modelName,
  documents,
  question,
  savedChatContext,
  searchAvailable,
  keyHandlingNotice,
  busy,
  onConfirm,
  onClose,
}) {
  const dialogRef = useRef(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby="chat-context-title"
      aria-describedby="chat-context-description"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClose={onClose}
      className="m-auto max-h-[88dvh] w-[min(94vw,38rem)] overflow-y-auto rounded-2xl border border-glass-borderDark bg-midnight-panel p-0 text-ivory shadow-2xl backdrop:bg-midnight-deep/80"
    >
      <div className="border-b border-glass-borderDark px-5 py-4">
        <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-accent">
          Per-request AI context
        </p>
        <h2 id="chat-context-title" className="mt-1 text-lg font-semibold">
          Review what goes to AI
        </h2>
        <p id="chat-context-description" className="mt-2 text-sm leading-relaxed text-ivory/70">
          Your question will be sent to {providerName} using {modelName}. Knoprix
          may add only relevant passages from the authorized documents below and
          up to six relevant messages from your own saved chats.
        </p>
      </div>

      <div className="space-y-4 px-5 py-4">
        <blockquote className="line-clamp-3 rounded-lg border border-glass-borderDark bg-midnight-deep/70 px-3 py-2 text-sm text-ivory/80">
          {question}
        </blockquote>

        {documents.length > 0 ? (
          <div>
            <p className="mb-2 text-xs font-semibold text-ivory/80">
              Authorized document passages · {documents.length}
            </p>
            <ul className="max-h-40 space-y-2 overflow-y-auto" aria-label="Authorized documents that may provide relevant passages">
              {documents.map((document) => (
                <li
                  key={document.id}
                  className="rounded-lg border border-glass-borderDark bg-midnight-deep/70 px-3 py-2"
                >
                  <span className="block truncate text-sm font-medium">{label(document)}</span>
                  <span className="text-[11px] text-ivory/50">
                    Relevant extracted passages only · original files and visuals stay here
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <p className="rounded-lg border border-glass-borderDark px-3 py-2 text-xs text-ivory/60">
            No document passages will be sent with this question.
          </p>
        )}

        {savedChatContext && (
          <p className="rounded-lg border border-glass-borderDark px-3 py-2 text-xs leading-relaxed text-ivory/65">
            Relevant messages from your saved chats may be included. Only chats
            owned by your account are considered; full conversation histories
            are not sent.
          </p>
        )}

        <div className="rounded-lg border border-amber-300/25 bg-amber-300/5 p-3 text-xs leading-relaxed text-amber-100/90">
          <p className="flex items-start gap-2">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <span>
              Provider data handling applies. Usage may consume quota or incur
              charges; Knoprix cannot provide a reliable price estimate.
            </span>
          </p>
          {searchAvailable && (
            <p className="mt-2 pl-6">
              {providerName} may use live web search for this question; search
              usage may have separate provider charges.
            </p>
          )}
        </div>
        <p className="text-xs leading-relaxed text-ivory/60">{keyHandlingNotice}</p>
      </div>

      <div className="flex flex-wrap justify-end gap-2 border-t border-glass-borderDark px-5 py-4">
        <button
          type="button"
          onClick={onClose}
          disabled={busy}
          autoFocus
          className="min-h-11 rounded-lg border border-glass-borderDark px-4 text-sm text-ivory/80 hover:bg-white/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-secondary disabled:opacity-50"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={onConfirm}
          disabled={busy}
          className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-accent px-4 text-sm font-semibold text-midnight-deep hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-secondary disabled:opacity-50"
        >
          {busy ? 'Sending…' : 'Confirm and send'}
        </button>
      </div>
    </dialog>
  );
}
