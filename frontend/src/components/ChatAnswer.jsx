import React from 'react';
import { ExternalLink } from 'lucide-react';

function safeWebUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password
      ? url.href
      : null;
  } catch {
    return null;
  }
}

export default function ChatAnswer({ content, citations = [], onDocumentCitation }) {
  const replacements = [];
  const insertions = new Map();
  const fallbacks = [];
  let searchFrom = 0;
  let webNumber = 0;

  citations.forEach((citation) => {
    if (citation.sourceType === 'web') {
      webNumber += 1;
      const href = safeWebUrl(citation.url);
      const start = citation.startIndex;
      const end = citation.endIndex;
      if (
        href
        && Number.isSafeInteger(start)
        && Number.isSafeInteger(end)
        && start >= 0
        && end >= start
        && end <= content.length
      ) {
        const items = insertions.get(end) || [];
        items.push({ citation, href, number: webNumber });
        insertions.set(end, items);
      } else {
        fallbacks.push({ citation, href, number: webNumber, type: 'web' });
      }
      return;
    }

    if (!citation.documentId) return;
    const page = citation.pageNumber || citation.page;
    const marker = `[${citation.fileName || 'Source'}, p. ${page}]`;
    const index = content.indexOf(marker, searchFrom);
    if (index < 0) {
      fallbacks.push({ citation, type: 'document' });
      return;
    }
    replacements.push({
      start: index,
      end: index + marker.length,
      citation,
      marker,
    });
    searchFrom = index + marker.length;
  });

  const events = [
    ...replacements,
    ...Array.from(insertions, ([start, items]) => ({ start, end: start, items })),
  ].sort((left, right) => left.start - right.start || right.end - left.end);
  const parts = [];
  let cursor = 0;

  events.forEach((event, index) => {
    if (event.start < cursor) return;
    if (event.start > cursor) parts.push(content.slice(cursor, event.start));
    if (event.items) {
      event.items.forEach((item) => {
        parts.push(
          <a
            key={`web-${index}-${item.number}`}
            href={item.href}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`Web source ${item.number}: ${item.citation.title || item.href}`}
            title={item.citation.title || item.href}
            className="mx-0.5 inline-flex items-center gap-0.5 rounded px-1 text-accent underline decoration-accent/40 underline-offset-2 hover:bg-accent/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-secondary"
          >
            [{item.number}<ExternalLink className="h-3 w-3" aria-hidden="true" />]
          </a>,
        );
      });
      cursor = event.start;
      return;
    }

    parts.push(
      <button
        key={`document-${index}`}
        type="button"
        onClick={() => onDocumentCitation(event.citation)}
        title={`Open ${event.citation.fileName || 'document'} at page ${event.citation.pageNumber || event.citation.page}`}
        className="mx-0.5 inline rounded px-1 text-accent underline decoration-accent/40 underline-offset-2 hover:bg-accent/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-secondary"
      >
        {event.marker}
      </button>,
    );
    cursor = event.end;
  });

  if (cursor < content.length) parts.push(content.slice(cursor));
  fallbacks.forEach((item, index) => {
    parts.push(' ');
    if (item.type === 'web') {
      parts.push(item.href ? (
        <a
          key={`web-fallback-${item.number}`}
          href={item.href}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`Web source ${item.number}: ${item.citation.title || item.href}`}
          className="inline-flex items-center gap-0.5 rounded px-1 text-accent underline underline-offset-2 hover:bg-accent/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-secondary"
        >
          [{item.number}<ExternalLink className="h-3 w-3" aria-hidden="true" />]
        </a>
      ) : (
        <span key={`web-unlinked-${item.number}`} className="text-ivory/55">
          [Web source {item.number} unavailable]
        </span>
      ));
      return;
    }
    parts.push(
      <button
        key={`document-fallback-${index}`}
        type="button"
        onClick={() => onDocumentCitation(item.citation)}
        className="inline rounded px-1 text-accent underline underline-offset-2 hover:bg-accent/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-secondary"
      >
        [{item.citation.fileName || 'Document'}, p. {item.citation.pageNumber || item.citation.page}]
      </button>,
    );
  });

  return <div className="whitespace-pre-wrap">{parts}</div>;
}
