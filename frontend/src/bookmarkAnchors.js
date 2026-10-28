function normalizeBookmarkText(value) {
  return String(value || '')
    .replace(/\u00a0/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLocaleLowerCase();
}

function buildNormalizedText(rawText) {
  let normalized = '';
  const rawOffsets = [];

  for (let index = 0; index < rawText.length; index += 1) {
    const char = rawText[index];
    if (/\s/.test(char)) {
      if (normalized && !normalized.endsWith(' ')) {
        normalized += ' ';
        rawOffsets.push(index);
      }
      continue;
    }
    normalized += char;
    rawOffsets.push(index);
  }

  if (normalized.endsWith(' ')) {
    normalized = normalized.slice(0, -1);
    rawOffsets.pop();
  }

  return { normalized, rawOffsets };
}

function getTextContent(root) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let text = '';
  let node;
  while ((node = walker.nextNode())) text += node.textContent;
  return text;
}

export function getSelectionOffsets(root, range) {
  if (
    !root ||
    !range ||
    !root.contains(range.startContainer) ||
    !root.contains(range.endContainer)
  ) {
    return null;
  }

  const prefix = document.createRange();
  prefix.selectNodeContents(root);
  prefix.setEnd(range.startContainer, range.startOffset);
  const start = prefix.toString().length;
  return { start, end: start + range.toString().length };
}

function rangeAtTextOffsets(root, start, end) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let offset = 0;
  let startNode = null;
  let endNode = null;
  let startOffset = 0;
  let endOffset = 0;
  let node;

  while ((node = walker.nextNode())) {
    const nextOffset = offset + node.textContent.length;
    // At a text-node boundary, start from the next node. Starting at the end
    // of the previous block makes Range.toString() include that block's
    // rendered separator in the selection.
    if (!startNode && start < nextOffset) {
      startNode = node;
      startOffset = start - offset;
    }
    if (end <= nextOffset) {
      endNode = node;
      endOffset = end - offset;
      break;
    }
    offset = nextOffset;
  }

  if (!startNode || !endNode) return null;
  const range = document.createRange();
  range.setStart(startNode, startOffset);
  range.setEnd(endNode, endOffset);
  return range;
}

export function rangeAtOffsets(root, start, end) {
  if (!root || !Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end <= start) {
    return null;
  }
  const paragraphs = [...root.querySelectorAll('p[data-line]')];
  if (!paragraphs.length) return rangeAtTextOffsets(root, start, end);

  const pointAt = (offset) => {
    let lineStart = 0;
    for (const paragraph of paragraphs) {
      const lineLength = Number.isFinite(Number(paragraph.dataset.lineLength))
        ? Number(paragraph.dataset.lineLength)
        : paragraph.textContent.length;
      if (offset >= lineStart && offset <= lineStart + lineLength) {
        const walker = document.createTreeWalker(paragraph, NodeFilter.SHOW_TEXT);
        let node;
        let localOffset = 0;
        while ((node = walker.nextNode())) {
          const nextOffset = localOffset + node.textContent.length;
          if (offset - lineStart <= nextOffset) {
            return [node, offset - lineStart - localOffset];
          }
          localOffset = nextOffset;
        }
        return null;
      }
      lineStart += lineLength + 1;
    }
    return null;
  };
  const startPoint = pointAt(start);
  const endPoint = pointAt(end);
  if (!startPoint || !endPoint) return null;

  const range = document.createRange();
  range.setStart(...startPoint);
  range.setEnd(...endPoint);
  return range;
}

export function findBookmarkRange(root, start, end, quote) {
  const savedQuote = normalizeBookmarkText(quote);
  const anchoredRange = rangeAtOffsets(root, start, end);
  if (
    anchoredRange &&
    savedQuote &&
    normalizeBookmarkText(anchoredRange.toString()) === savedQuote
  ) {
    return anchoredRange;
  }
  if (!root || !savedQuote) return null;

  const fullText = getTextContent(root);
  const { normalized, rawOffsets } = buildNormalizedText(fullText);

  const normalizedIndex = normalized.toLocaleLowerCase().indexOf(savedQuote);
  if (normalizedIndex === -1) return null;
  return rangeAtTextOffsets(
    root,
    rawOffsets[normalizedIndex],
    rawOffsets[normalizedIndex + savedQuote.length - 1] + 1,
  );
}

export function emphasizeBookmarkRange(range) {
  if (!range) return () => {};
  range.startContainer.parentElement?.scrollIntoView?.({ behavior: 'smooth', block: 'center' });
  const ancestor = range.commonAncestorContainer.nodeType === Node.ELEMENT_NODE
    ? range.commonAncestorContainer
    : range.commonAncestorContainer.parentElement;
  const emphasisRoot = ancestor?.closest?.('[data-page], .pdf-text-layer') || ancestor;
  emphasisRoot?.classList.add('bookmark-jump-active');
  const selection = window.getSelection();
  selection?.removeAllRanges();
  selection?.addRange(range);

  const clear = () => {
    emphasisRoot?.classList.remove('bookmark-jump-active');
    if (matchesCurrentSelection()) selection.removeAllRanges();
  };
  const matchesCurrentSelection = () => {
    if (!selection?.rangeCount) return false;
    const current = selection.getRangeAt(0);
    return (
      current.startContainer === range.startContainer &&
      current.startOffset === range.startOffset &&
      current.endContainer === range.endContainer &&
      current.endOffset === range.endOffset
    );
  };
  const timer = window.setTimeout(clear, 2500);

  return () => {
    window.clearTimeout(timer);
    clear();
  };
}
