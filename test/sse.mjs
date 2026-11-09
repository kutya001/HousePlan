/** Подделки ответов API Claude для тестов: поток SSE и fetch-заглушка. */

/** Поток событий так, как его шлёт Messages API. */
export function sseStream({ text = 'Делаю.', tool = null, input = null, stop = 'end_turn' } = {}) {
  const ev = (type, data) => `event: ${type}\ndata: ${JSON.stringify({ type, ...data })}\n\n`;
  let s = ev('message_start', { message: { id: 'msg_1', role: 'assistant', content: [], model: 'm', usage: { input_tokens: 1200, cache_read_input_tokens: 9000, output_tokens: 1 } } });
  s += ev('content_block_start', { index: 0, content_block: { type: 'text', text: '' } });
  s += ev('ping', {});
  for (const part of text.match(/.{1,3}/gs) || []) s += ev('content_block_delta', { index: 0, delta: { type: 'text_delta', text: part } });
  s += ev('content_block_stop', { index: 0 });
  if (tool) {
    const json = JSON.stringify(input);
    s += ev('content_block_start', { index: 1, content_block: { type: 'tool_use', id: 'toolu_1', name: tool, input: {} } });
    for (let i = 0; i < json.length; i += 40) s += ev('content_block_delta', { index: 1, delta: { type: 'input_json_delta', partial_json: json.slice(i, i + 40) } });
    s += ev('content_block_stop', { index: 1 });
  }
  s += ev('message_delta', { delta: { stop_reason: tool ? 'tool_use' : stop }, usage: { output_tokens: 345 } });
  s += ev('message_stop', {});
  return s;
}

/** fetch-заглушка: отдаёт поток кусками по 17 байт, запоминает запросы. */
export function fakeFetch(replies) {
  const calls = [];
  const fn = async (url, init) => {
    calls.push({ url, init, body: init.body ? JSON.parse(init.body) : null });
    const r = replies[Math.min(calls.length - 1, replies.length - 1)];
    if (r.status && r.status !== 200) return new Response(JSON.stringify(r.body), { status: r.status, headers: { 'content-type': 'application/json' } });
    const bytes = new TextEncoder().encode(r.sse);
    const stream = new ReadableStream({
      start(c) {
        for (let i = 0; i < bytes.length; i += 17) c.enqueue(bytes.slice(i, i + 17));
        c.close();
      },
    });
    return new Response(stream, { status: 200, headers: { 'content-type': 'text/event-stream' } });
  };
  fn.calls = calls;
  return fn;
}
