import assert from 'node:assert/strict';
import test from 'node:test';
import { isBrowserProviderAvailable } from '../src/services/providerAvailability.js';

test('keeps NVIDIA disabled even when an older allowlist omits availability metadata', () => {
  assert.equal(isBrowserProviderAvailable({ id: 'nvidia-nim' }), false);
  assert.equal(isBrowserProviderAvailable(null), false);
});

test('respects backend-disabled providers and keeps available providers selectable', () => {
  assert.equal(isBrowserProviderAvailable({ id: 'gemini-free', browserAvailable: false }), false);
  assert.equal(isBrowserProviderAvailable({ id: 'groq-free', browserAvailable: true }), true);
  assert.equal(isBrowserProviderAvailable({ id: 'zai-glm-free' }), true);
});
