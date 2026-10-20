import React, { useEffect, useRef } from 'react';
import { AlertTriangle } from 'lucide-react';

const label = (document) =>
  document.title || document.filename || document.file_name || 'Untitled document';

export default function DocumentContextConsentDialog({
  open,
  providerName,
  modelName,
  documents,
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
      aria-labelledby="document-context-title"
      aria-describedby="document-context-description"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClose={onClose}
      className="m-auto max-h-[88dvh] w-[min(94vw,38rem)] overflow-y-auto rounded-2xl border border-glass-borderDark bg-midnight-panel p-0 text-ivory shadow-2xl backdrop:bg-midnight-deep/80"
    >
      <div className="border-b border-glass-borderDark px-5 py-4">
        <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-accent">
          Per-request document consent
        </p>
        <h2 id="document-context-title" className="mt-1 text-lg font-semibold">
          Send extracted text?
        </h2>
        <p id="document-context-description" className="mt-2 text-sm leading-relaxed text-ivory/70">
          Your question and the extracted text from these AI-authorized documents
          will be sent to {providerName} using {modelName}. The original files,
          images, charts, and visual layout will not be sent. Confirm separately
          for each question.
        </p>
      </div>

      <div className="space-y-4 px-5 py-4">
        <ul className="max-h-48 space-y-2 overflow-y-auto" aria-label="Documents whose extracted text will be sent">
          {documents.map((document) => (
            <li
              key={document.id}
              className="rounded-lg border border-glass-borderDark bg-midnight-deep/70 px-3 py-2"
            >
              <span className="block truncate text-sm font-medium">{label(document)}</span>
              <span className="text-[11px] text-ivory/50">
                {document.page_count || 1} pages · extracted text only
              </span>
            </li>
          ))}
        </ul>

        <div className="rounded-lg border border-amber-300/25 bg-amber-300/5 p-3 text-xs leading-relaxed text-amber-100/90">
          <p className="flex items-start gap-2">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <span>
              Provider data handling applies. Usage may consume quota or incur
              charges; Knoprix cannot provide a reliable price estimate.
            </span>
          </p>
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
          disabled={busy || documents.length === 0}
          className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-accent px-4 text-sm font-semibold text-midnight-deep hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-secondary disabled:opacity-50"
        >
          {busy ? 'Sending…' : 'Confirm and ask AI'}
        </button>
      </div>
    </dialog>
  );
}
