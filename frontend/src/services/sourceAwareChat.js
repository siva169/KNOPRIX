const parseErrorDetail = async (response) => {
  const errorText = await response.text();
  let detail = errorText || `HTTP ${response.status}`;
  try {
    const parsedError = JSON.parse(errorText);
    detail = parsedError.detail || detail;
  } catch {
    // Keep the raw response when it is not JSON.
  }
  return response.status === 401
    ? 'Your session expired. Please sign in again.'
    : detail;
};

/**
 * Shared source-aware conversation stream used by AI Wing and the compact chat.
 * Keeping fetch, auth headers, and SSE parsing here prevents the two entry
 * points from drifting into different provider implementations again.
 */
export async function streamSourceAwareChat({
  apiBase,
  token,
  providerKey = '',
  providerId,
  model,
  conversationId,
  projectId,
  documentIds = [],
  question,
  confirmed = false,
  signal,
  initialSearchAvailable = false,
  onEvent,
}) {
  const response = await fetch(`${apiBase}/chat/stream`, {
    method: 'POST',
    signal,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(providerKey && providerId !== 'nvidia-nim' ? { 'X-Provider-Key': providerKey } : {}),
    },
    body: JSON.stringify({
      conversationId,
      ...(projectId ? { projectId } : {}),
      documentIds,
      question,
      providerId,
      model,
      ...(documentIds.length > 0 && confirmed ? { confirmed: true } : {}),
    }),
  });

  if (!response.ok) throw new Error(await parseErrorDetail(response));
  if (!response.body) throw new Error('The provider returned no stream.');

  const reader = response.body.getReader();
  const decoder = new TextDecoder('utf-8');
  let buffer = '';
  let content = '';
  let thought = '';
  let citations = [];
  let searchAvailable = initialSearchAvailable;
  let searchUsed = false;
  let includedChatMessages = 0;
  let streamFailure = null;

  const handleFrame = (block) => {
    const lines = block.split('\n');
    let eventType = 'message';
    const dataLines = [];
    for (const line of lines) {
      if (line.startsWith('event:')) eventType = line.slice(6).trim();
      else if (line.startsWith('data:')) dataLines.push(line.slice(5).trimStart());
    }
    if (!dataLines.length) return;

    let payload;
    try {
      payload = JSON.parse(dataLines.join('\n'));
    } catch {
      return;
    }

    if (eventType === 'meta') {
      searchAvailable = Boolean(payload.searchAvailable);
    } else if (eventType === 'thought') {
      thought += payload.text || '';
    } else if (eventType === 'token') {
      content += payload.text ?? payload.token ?? '';
    } else if (eventType === 'citation') {
      citations.push(payload);
    } else if (eventType === 'error') {
      streamFailure = payload.detail || 'Streaming failed';
    } else if (eventType === 'done') {
      if (Array.isArray(payload.citations) && !citations.length) citations = payload.citations;
      searchAvailable = Boolean(payload.searchAvailable ?? searchAvailable);
      searchUsed = Boolean(payload.searchUsed);
      includedChatMessages = Number(payload.includedChatMessages) || 0;
    }

    onEvent?.(eventType, payload, { content, thought, citations, searchAvailable });
  };

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const frames = buffer.split('\n\n');
    buffer = frames.pop() || '';
    frames.forEach(handleFrame);
  }
  if (buffer.trim()) handleFrame(buffer);
  if (streamFailure) throw new Error(streamFailure);

  return {
    content,
    thought,
    citations,
    searchAvailable,
    searchUsed,
    includedChatMessages,
  };
}
