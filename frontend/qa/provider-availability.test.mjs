import assert from 'node:assert/strict';
import test from 'node:test';
import { isProviderAvailable } from '../src/services/providerAvailability.js';

test('enables NVIDIA only when backend metadata confirms the shared key is configured', () => {
  assert.equal(isProviderAvailable({ id: 'nvidia-nim' }), false);
  assert.equal(isProviderAvailable({ id: 'nvidia-nim', hasServerKey: false }), false);
  assert.equal(isProviderAvailable({ id: 'nvidia-nim', hasServerKey: true }), true);
  assert.equal(isProviderAvailable(null), false);
});

test('respects backend-disabled providers and keeps available providers selectable', () => {
  assert.equal(isProviderAvailable({ id: 'gemini-free', browserAvailable: false }), false);
  assert.equal(isProviderAvailable({ id: 'groq-free', browserAvailable: true }), true);
  assert.equal(isProviderAvailable({ id: 'zai-glm-free' }), true);
});
