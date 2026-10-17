import assert from 'node:assert/strict';
import test from 'node:test';
import { completeNvidiaChat, streamNvidiaChat } from '../src/services/nvidia.js';

const API_URL = 'https://integrate.api.nvidia.com/v1/chat/completions';

test('streams NVIDIA tokens directly with the user key and selected model', async () => {
  const originalFetch = globalThis.fetch;
  let request;
  globalThis.fetch = async (url, options) => {
    request = { url, options, body: JSON.parse(options.body) };
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(
          'data: {"choices":[{"delta":{"content":"grounded "}}]}\n\n'
          + 'data: {"choices":[{"delta":{"content":"answer"}}]}\n\n'
          + 'data: [DONE]\n\n',
        ));
        controller.close();
      },
    });
    return new Response(stream, { status: 200 });
  };

  try {
    const tokens = [];
    const answer = await streamNvidiaChat({
      apiKey: 'browser-test-key',
      model: 'nvidia/nemotron-3.5-lightning-30b-a3b',
      messages: [{ role: 'user', content: 'Use cited passages.' }],
      onToken: (token) => tokens.push(token),
    });

    assert.equal(request.url, API_URL);
    assert.match(request.options.headers.Authorization, /^Bearer browser-test-key$/);
    assert.equal(request.body.stream, true);
    assert.equal(request.body.model, 'nvidia/nemotron-3.5-lightning-30b-a3b');
    assert.equal(answer, 'grounded answer');
    assert.deepEqual(tokens, ['grounded ', 'answer']);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('requests structured artifact output directly from NVIDIA', async () => {
  const originalFetch = globalThis.fetch;
  let request;
  globalThis.fetch = async (url, options) => {
    request = { url, options, body: JSON.parse(options.body) };
    return Response.json({
      choices: [{ message: { content: '```json\n{"cards":[]}\n```' } }],
    });
  };

  try {
    const result = await completeNvidiaChat({
      apiKey: 'browser-test-key',
      model: 'nvidia/nemotron-3.5-lightning-30b-a3b',
      messages: [{ role: 'user', content: 'Return JSON.' }],
    });

    assert.equal(request.url, API_URL);
    assert.match(request.options.headers.Authorization, /^Bearer browser-test-key$/);
    assert.equal(request.body.stream, false);
    assert.deepEqual(result, { cards: [] });
  } finally {
    globalThis.fetch = originalFetch;
  }
});
