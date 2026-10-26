const clamp = (value, minimum, maximum) =>
  Math.min(Math.max(value, minimum), maximum);

export function regionFromDrag(bounds, start, end, minimumPixels = 2) {
  if (bounds.width <= 0 || bounds.height <= 0) return null;

  const startX = clamp(start.x - bounds.left, 0, bounds.width);
  const startY = clamp(start.y - bounds.top, 0, bounds.height);
  const endX = clamp(end.x - bounds.left, 0, bounds.width);
  const endY = clamp(end.y - bounds.top, 0, bounds.height);
  const left = Math.min(startX, endX);
  const top = Math.min(startY, endY);
  const width = Math.abs(endX - startX);
  const height = Math.abs(endY - startY);

  if (width < minimumPixels || height < minimumPixels) return null;
  return {
    x: left / bounds.width,
    y: top / bounds.height,
    width: width / bounds.width,
    height: height / bounds.height,
  };
}

export function regionCropBounds(region, canvasWidth, canvasHeight) {
  const left = clamp(Math.floor(region.x * canvasWidth), 0, canvasWidth);
  const top = clamp(Math.floor(region.y * canvasHeight), 0, canvasHeight);
  const right = clamp(
    Math.ceil((region.x + region.width) * canvasWidth),
    left + 1,
    canvasWidth,
  );
  const bottom = clamp(
    Math.ceil((region.y + region.height) * canvasHeight),
    top + 1,
    canvasHeight,
  );
  return { x: left, y: top, width: right - left, height: bottom - top };
}
