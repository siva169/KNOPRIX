import assert from 'node:assert/strict';
import test from 'node:test';
import { regionCropBounds, regionFromDrag } from './regionGeometry.js';

test('normalizes a reverse drag to the page bounds', () => {
  const region = regionFromDrag(
    { left: 10, top: 20, width: 200, height: 100 },
    { x: 190, y: 100 },
    { x: 50, y: 40 },
  );

  assert.deepEqual(region, {
    x: 0.2,
    y: 0.2,
    width: 0.7,
    height: 0.6,
  });
});

test('clips pointer coordinates and ignores near-zero selections', () => {
  assert.deepEqual(
    regionFromDrag(
      { left: 0, top: 0, width: 100, height: 100 },
      { x: -10, y: -10 },
      { x: 50, y: 50 },
    ),
    { x: 0, y: 0, width: 0.5, height: 0.5 },
  );
  assert.equal(
    regionFromDrag(
      { left: 0, top: 0, width: 100, height: 100 },
      { x: 20, y: 20 },
      { x: 21, y: 40 },
    ),
    null,
  );
});

test('rounds crop bounds outward so the PNG includes selected edge pixels', () => {
  assert.deepEqual(
    regionCropBounds({ x: 0.125, y: 0.25, width: 0.25, height: 0.25 }, 101, 99),
    { x: 12, y: 24, width: 26, height: 26 },
  );
});
