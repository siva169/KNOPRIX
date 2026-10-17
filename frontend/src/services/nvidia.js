const NVIDIA_CHAT_COMPLETIONS_URL = 'https://integrate.api.nvidia.com/v1/chat/completions';

async function postChatCompletion({ apiKey, model, messages, stream }) {
  if (!apiKey?.trim()) {
    throw new Error('Add your NVIDIA API key in Provider & BYOK.');
  }

  const response = await fetch(NVIDIA_CHAT_COMPLETIONS_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey.trim()}`,
    },
    body: JSON.stringify({
      model,
      messages,
      temperature: 0.2,
      max_tokens: 2048,
      stream,
    }),
  });

  if (!response.ok) {
    throw new Error(`NVIDIA request failed (HTTP ${response.status}).`);
  }

  return response;
}

export async function streamNvidiaChat({ apiKey, model, messages, onToken }) {
  const response = await postChatCompletion({ apiKey, model, messages, stream: true });
  if (!response.body) throw new Error('NVIDIA returned no response stream.');

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let answer = '';
  let finished = false;

  const readFrame = (frame) => {
    const data = frame
      .split('\n')
      .filter((line) => line.startsWith('data:'))
      .map((line) => line.slice(5).trim())
      .join('\n');
    if (!data || data === '[DONE]') {
      if (data === '[DONE]') finished = true;
      return;
    }

    const payload = JSON.parse(data);
    const token = payload.choices?.[0]?.delta?.content || '';
    if (token) {
      answer += token;
      onToken(token);
    }
  };

  while (!finished) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const frames = buffer.split('\n\n');
    buffer = frames.pop() || '';
    frames.forEach(readFrame);
  }
  buffer += decoder.decode();
  if (buffer.trim()) readFrame(buffer);
  if (!answer.trim()) throw new Error('NVIDIA returned an empty answer.');
  return answer;
}

export async function completeNvidiaChat({ apiKey, model, messages }) {
  const response = await postChatCompletion({ apiKey, model, messages, stream: false });
  const payload = await response.json();
  const text = payload.choices?.[0]?.message?.content?.trim();
  if (!text) throw new Error('NVIDIA returned an empty answer.');

  const jsonText = text
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '')
    .trim();
  try {
    return JSON.parse(jsonText);
  } catch {
    throw new Error('NVIDIA returned invalid JSON for the study artifact.');
  }
}
