/** Подделки ответов API Claude для тестов: поток SSE и fetch-заглушка. */

/**
 * Поток событий так, как его шлёт Messages API.
 * @param opts.thinking — добавить блок размышления (текст и подпись) перед ответом
 * @param opts.cut — оборвать JSON инструмента на этой доле длины (0…1): ответ упёрся в предел, stop_reason = max_tokens
 * @param opts.id — id вызова инструмента (в одном разговоре они разные)
 */
export function sseStream({ text = 'Делаю.', tool = null, input = null, stop = 'end_turn', thinking = null, cut = 0, id = 'toolu_1' } = {}) {
  const ev = (type, data) => `event: ${type}\ndata: ${JSON.stringify({ type, ...data })}\n\n`;
  let s = ev('message_start', { message: { id: 'msg_1', role: 'assistant', content: [], model: 'm', usage: { input_tokens: 1200, cache_read_input_tokens: 9000, output_tokens: 1 } } });
  let i = 0;
  if (thinking !== null) {
    s += ev('content_block_start', { index: i, content_block: { type: 'thinking', thinking: '', signature: '' } });
    for (const part of String(thinking).match(/.{1,7}/gs) || ['']) s += ev('content_block_delta', { index: i, delta: { type: 'thinking_delta', thinking: part } });
    s += ev('content_block_delta', { index: i, delta: { type: 'signature_delta', signature: 'SIG_abc123==' } });
    s += ev('content_block_stop', { index: i });
    i++;
  }
  if (text) {
    s += ev('content_block_start', { index: i, content_block: { type: 'text', text: '' } });
    s += ev('ping', {});
    for (const part of text.match(/.{1,3}/gs) || []) s += ev('content_block_delta', { index: i, delta: { type: 'text_delta', text: part } });
    s += ev('content_block_stop', { index: i });
    i++;
  }
  if (tool) {
    let json = JSON.stringify(input);
    if (cut) json = json.slice(0, Math.max(1, Math.floor(json.length * cut)));
    s += ev('content_block_start', { index: i, content_block: { type: 'tool_use', id, name: tool, input: {} } });
    for (let k = 0; k < json.length; k += 40) s += ev('content_block_delta', { index: i, delta: { type: 'input_json_delta', partial_json: json.slice(k, k + 40) } });
    s += ev('content_block_stop', { index: i });
  }
  s += ev('message_delta', { delta: { stop_reason: cut ? 'max_tokens' : tool ? 'tool_use' : stop }, usage: { output_tokens: 345 } });
  s += ev('message_stop', {});
  return s;
}

/**
 * fetch-заглушка: отдаёт поток кусками по 17 байт, запоминает запросы.
 * Ответ { status, body, headers } — ошибка API; { sse } — поток.
 */
export function fakeFetch(replies) {
  const calls = [];
  const fn = async (url, init) => {
    calls.push({ url, init, body: init.body ? JSON.parse(init.body) : null });
    const r = replies[Math.min(calls.length - 1, replies.length - 1)];
    if (r.status && r.status !== 200) return new Response(JSON.stringify(r.body), { status: r.status, headers: { 'content-type': 'application/json', ...(r.headers || {}) } });
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
