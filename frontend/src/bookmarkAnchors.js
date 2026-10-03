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

export function rangeAtOffsets(root, start, end) {
  if (!root || !Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end <= start) {
    return null;
  }

  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let offset = 0;
  let startNode = null;
  let endNode = null;
  let startOffset = 0;
  let endOffset = 0;
  let node;

  while ((node = walker.nextNode())) {
    const nextOffset = offset + node.textContent.length;
    if (!startNode && start <= nextOffset) {
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

export function findBookmarkRange(root, start, end, quote) {
  const savedQuote = (quote || '').replace(/\s+/g, ' ').trim().toLocaleLowerCase();
  const anchoredRange = rangeAtOffsets(root, start, end);
  if (
    anchoredRange &&
    savedQuote &&
    anchoredRange.toString().replace(/\s+/g, ' ').trim().toLocaleLowerCase() === savedQuote
  ) {
    return anchoredRange;
  }
  if (!root || !savedQuote) return null;

  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let fullText = '';
  let node;
  while ((node = walker.nextNode())) {
    fullText += node.textContent;
  }

  const exactIndex = fullText.toLocaleLowerCase().indexOf((quote || '').toLocaleLowerCase());
  if (exactIndex !== -1) {
    return rangeAtOffsets(root, exactIndex, exactIndex + quote.length);
  }

  let normalized = '';
  const rawOffsets = [];
  for (let i = 0; i < fullText.length; i += 1) {
    const char = fullText[i];
    if (/\s/.test(char)) {
      if (normalized && !normalized.endsWith(' ')) {
        normalized += ' ';
        rawOffsets.push(i);
      }
    } else {
      normalized += char;
      rawOffsets.push(i);
    }
  }
  if (normalized.endsWith(' ')) {
    normalized = normalized.slice(0, -1);
    rawOffsets.pop();
  }

  const normalizedIndex = normalized.toLocaleLowerCase().indexOf(savedQuote);
  if (normalizedIndex === -1) return null;
  return rangeAtOffsets(
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
