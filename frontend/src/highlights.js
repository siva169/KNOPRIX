// Highlight markers — 6 colors, like a real highlighter set.
// `bg` is the translucent marker wash; `swatch` is the solid chip color used
// in pickers. Keep the ids in sync with backend VALID_COLORS.
export const HIGHLIGHT_COLORS = [
  { id: 'yellow', name: 'Yellow', bg: 'rgba(253, 224, 71, 0.52)',  swatch: '#fde047' },
  { id: 'green',  name: 'Green',  bg: 'rgba(134, 239, 172, 0.5)',  swatch: '#4ade80' },
  { id: 'blue',   name: 'Blue',   bg: 'rgba(147, 197, 253, 0.5)',  swatch: '#60a5fa' },
  { id: 'pink',   name: 'Pink',   bg: 'rgba(249, 168, 212, 0.5)',  swatch: '#f472b6' },
  { id: 'orange', name: 'Orange', bg: 'rgba(253, 186, 116, 0.55)', swatch: '#fb923c' },
  { id: 'purple', name: 'Purple', bg: 'rgba(196, 181, 253, 0.5)',  swatch: '#a78bfa' },
];

export const colorById = (id) =>
  HIGHLIGHT_COLORS.find((c) => c.id === id) || HIGHLIGHT_COLORS[0];

// Split `text` around the FIRST occurrence of `needle` (case-insensitive).
// Returns segments like [{ text, highlighted }] so callers can render
// <mark> around the matching part without dangerouslySetInnerHTML.
export function segmentsFor(text, needle) {
  if (!needle) return [{ text, highlighted: false }];
  const idx = text.toLowerCase().indexOf(needle.toLowerCase());
  if (idx === -1) return [{ text, highlighted: false }];
  const segs = [];
  if (idx > 0) segs.push({ text: text.slice(0, idx), highlighted: false });
  segs.push({ text: text.slice(idx, idx + needle.length), highlighted: true });
  if (idx + needle.length < text.length) {
    segs.push({ text: text.slice(idx + needle.length), highlighted: false });
  }
  return segs;
}

// Split `text` into segments highlighting the whitespace-insensitive match of
// `needle` — tolerates line breaks, repeated spaces, and spacing quirks ("Over
// view" vs "Overview"). If no spacing-insensitive match exists, falls back to
// the longest consecutive run of needle words present in order (edge words may
// match partially, since selections often start/end mid-word).
// With `all = true`, every occurrence is highlighted instead of the first.
export function matchSegments(text, needle, all = false) {
  if (!needle) return [{ text, highlighted: false }];
  const stripped = text.replace(/\s+/g, '');
  const needleStripped = needle.replace(/\s+/g, '');
  if (!stripped || !needleStripped) return [{ text, highlighted: false }];
  const rawPos = [];
  for (let i = 0; i < text.length; i++) {
    if (!/\s/.test(text[i])) rawPos.push(i);
  }
  // All-occurrences mode: paint every whitespace-insensitive match.
  if (all) {
    const segs = [];
    let cursor = 0;
    let pos = 0;
    let any = false;
    while (true) {
      const exact = stripped.toLowerCase().indexOf(needleStripped.toLowerCase(), cursor);
      if (exact === -1) break;
      const rs = rawPos[exact];
      const re = rawPos[exact + needleStripped.length - 1] + 1;
      if (rs > pos) segs.push({ text: text.slice(pos, rs), highlighted: false });
      segs.push({ text: text.slice(rs, re), highlighted: true });
      pos = re;
      cursor = exact + needleStripped.length;
      any = true;
    }
    if (any) {
      if (pos < text.length) segs.push({ text: text.slice(pos), highlighted: false });
      return segs;
    }
    // No exact match at all — fall through to the single word-run match below.
  }

  // Single (precise) mode: first whitespace-insensitive match.
  let s = -1;
  let e = -1;
  const exact = stripped.toLowerCase().indexOf(needleStripped.toLowerCase());
  if (exact !== -1) {
    s = rawPos[exact];
    e = rawPos[exact + needleStripped.length - 1] + 1;
  }
  if (s === -1) {
    // Word-run fallback — longest consecutive needle words present in order.
    const tokens = [];
    const re = /\S+/g;
    let m;
    while ((m = re.exec(text))) tokens.push({ s: m.index, e: m.index + m[0].length, w: m[0].toLowerCase() });
    const needleWords = needle.toLowerCase().match(/\S+/g) || [];
    let best = null;
    for (let st = 0; st < needleWords.length; st++) {
      const maxLen = needleWords.length - st;
      if (best && maxLen <= best.len) break;
      for (let len = maxLen; len >= 1; len--) {
        if (best && len <= best.len) break;
        const run = needleWords.slice(st, st + len);
        for (let ti = 0; ti + len <= tokens.length; ti++) {
          let ok = true;
          for (let k = 0; k < len; k++) {
            const tw = tokens[ti + k].w;
            const nw2 = run[k];
            const isEdge = k === 0 || k === len - 1;
            if (isEdge ? !tw.includes(nw2) : !(tw.startsWith(nw2) || nw2.startsWith(tw))) {
              ok = false;
              break;
            }
          }
          if (ok) { best = { s: tokens[ti].s, e: tokens[ti + len - 1].e, len }; break; }
        }
      }
    }
    if (best) { s = best.s; e = best.e; }
  }
  if (s === -1) return [{ text, highlighted: false }];
  const segs = [];
  if (s > 0) segs.push({ text: text.slice(0, s), highlighted: false });
  segs.push({ text: text.slice(s, e), highlighted: true });
  if (e < text.length) segs.push({ text: text.slice(e), highlighted: false });
  return segs;
}

// Merge several highlight needles into non-overlapping [start, end) ranges on
// one line of text (used by the plain-text viewer so multiple colors can
// coexist on the same line). Case-insensitive, first occurrence per needle.
export function highlightRanges(line, needles) {
  const ranges = [];
  for (const needle of needles) {
    if (!needle) continue;
    const idx = line.toLowerCase().indexOf(needle.toLowerCase());
    if (idx !== -1) ranges.push([idx, idx + needle.length]);
  }
  if (!ranges.length) return [];
  ranges.sort((a, b) => a[0] - b[0]);
  const merged = [ranges[0]];
  for (let i = 1; i < ranges.length; i++) {
    const last = merged[merged.length - 1];
    if (ranges[i][0] <= last[1]) {
      last[1] = Math.max(last[1], ranges[i][1]);
    } else {
      merged.push(ranges[i]);
    }
  }
  return merged;
}

// Build line segments from merged ranges; the color used is the color of the
// first highlight that produced a range starting at that position.
export function segmentsFromRanges(line, ranges, colorByStart) {
  if (!ranges.length) return [{ text: line, highlighted: false }];
  const segs = [];
  let pos = 0;
  for (const [s, e] of ranges) {
    if (s > pos) segs.push({ text: line.slice(pos, s), highlighted: false });
    segs.push({ text: line.slice(s, e), highlighted: true, color: colorByStart(s) });
    pos = e;
  }
  if (pos < line.length) segs.push({ text: line.slice(pos), highlighted: false });
  return segs;
}
