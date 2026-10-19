export function splitHighlightSegments(text, ranges) {
  if (!text) return [];

  const validRanges = ranges.filter(
    (range) =>
      Number.isInteger(range.start) &&
      Number.isInteger(range.end) &&
      range.start >= 0 &&
      range.end > range.start &&
      range.end <= text.length,
  );
  const boundaries = new Set([0, text.length]);
  for (const range of validRanges) {
    boundaries.add(range.start);
    boundaries.add(range.end);
  }

  const points = [...boundaries].sort((a, b) => a - b);
  const segments = [];
  for (let index = 0; index < points.length - 1; index += 1) {
    const start = points[index];
    const end = points[index + 1];
    const activeRange = validRanges.filter(
      (range) => range.start < end && range.end > start,
    ).at(-1);
    const segment = activeRange
      ? { text: text.slice(start, end), id: activeRange.id, color: activeRange.color }
      : { text: text.slice(start, end) };
    const previous = segments.at(-1);
    if (
      previous &&
      previous.id === segment.id &&
      previous.color === segment.color
    ) {
      previous.text += segment.text;
    } else {
      segments.push(segment);
    }
  }
  return segments;
}
