/**
 * Клиент API Claude прямо из браузера — без своего сервера.
 *
 * Ключ пользователя уходит только в api.anthropic.com (заголовок x-api-key).
 * Для запросов со страницы API требует заголовок
 * anthropic-dangerous-direct-browser-access: ключ виден коду страницы,
 * поэтому так можно только со своим ключом и для себя.
 *
 * Ответ читается потоком (SSE): текст и рост JSON инструмента видны сразу,
 * запрос можно остановить (AbortSignal).
 */

export const API_URL = 'https://api.anthropic.com';
export const API_VERSION = '2023-06-01';

function headers(key, json = true) {
  return {
    'x-api-key': key,
    'anthropic-version': API_VERSION,
    'anthropic-dangerous-direct-browser-access': 'true',
    ...(json ? { 'content-type': 'application/json' } : {}),
  };
}

/** Ошибка API: HTTP-статус, тип из ответа и текст. */
export class ApiError extends Error {
  constructor(status, type, message) {
    super(message || type || `HTTP ${status}`);
    this.name = 'ApiError';
    this.status = status;
    this.type = type || '';
  }
}

async function errorFrom(res) {
  let type = '';
  let message = '';
  try {
    const j = await res.json();
    type = j?.error?.type || '';
    message = j?.error?.message || '';
  } catch {
    /* тело не JSON */
  }
  return new ApiError(res.status, type, message);
}

/** Понятный текст ошибки для пользователя. */
export function describeError(err, model = '') {
  if (!err) return 'Неизвестная ошибка';
  if (err.name === 'AbortError') return 'Остановлено';
  if (!(err instanceof ApiError)) {
    if (err instanceof TypeError) return 'Нет связи с api.anthropic.com. Проверьте интернет; если включены VPN, блокировщик или фильтр сайтов — они могут не пускать запрос.';
    return err.message || String(err);
  }
  const m = err.message || '';
  if (err.status === 401 || err.type === 'authentication_error') return 'Ключ API не подошёл. Проверьте его в настройках ИИ — ключ начинается с sk-ant-.';
  if (/credit balance|billing|purchase credits/i.test(m)) return 'На счёте API недостаточно средств — пополните баланс в консоли Anthropic (Billing).';
  if (err.status === 403 || err.type === 'permission_error') return `У ключа нет доступа: ${m || 'запрещено'}`;
  if (err.status === 404 || err.type === 'not_found_error') return `Модель ${model ? `«${model}» ` : ''}недоступна для вашего ключа — выберите другую в настройках ИИ.`;
  if (err.status === 413 || err.type === 'request_too_large') return 'Запрос слишком большой — уберите фото или начните новый разговор.';
  if (err.status === 429 || err.type === 'rate_limit_error') return 'Слишком много запросов подряд — подождите минуту и повторите.';
  if (err.status === 529 || err.type === 'overloaded_error') return 'Серверы Claude сейчас перегружены — повторите через минуту.';
  if (err.status >= 500 || err.type === 'api_error') return 'Ошибка на стороне API — повторите чуть позже.';
  return `Запрос отклонён: ${m || `HTTP ${err.status}`}`;
}

/**
 * Разбор потока Server-Sent Events: куски текста приходят как попало,
 * событие — до пустой строки. onEvent(eventName, dataString).
 */
export class SSEParser {
  constructor(onEvent) {
    this.onEvent = onEvent;
    this.buf = '';
  }

  push(chunk) {
    this.buf = (this.buf + chunk).replace(/\r\n/g, '\n');
    let i;
    while ((i = this.buf.indexOf('\n\n')) >= 0) {
      const raw = this.buf.slice(0, i);
      this.buf = this.buf.slice(i + 2);
      this._dispatch(raw);
    }
  }

  end() {
    if (this.buf.trim()) this._dispatch(this.buf);
    this.buf = '';
  }

  _dispatch(raw) {
    let event = 'message';
    const data = [];
    for (const line of raw.split('\n')) {
      if (!line || line[0] === ':') continue;
      const c = line.indexOf(':');
      const field = c < 0 ? line : line.slice(0, c);
      let value = c < 0 ? '' : line.slice(c + 1);
      if (value[0] === ' ') value = value.slice(1);
      if (field === 'event') event = value;
      else if (field === 'data') data.push(value);
    }
    if (data.length) this.onEvent(event, data.join('\n'));
  }
}

/**
 * Сборка ответа из событий потока Messages API.
 * onProgress({ type: 'text', text }) — весь текст на данный момент;
 * onProgress({ type: 'tool', name, chars }) — сколько символов JSON инструмента пришло.
 */
export class MessageBuilder {
  constructor(onProgress) {
    this.onProgress = onProgress;
    this.message = { content: [], usage: {} };
    this.blocks = [];
    this.json = [];
    this.done = false;
  }

  apply(type, data) {
    switch (type) {
      case 'message_start':
        this.message = { ...data.message, content: [] };
        this.message.usage = { ...(data.message?.usage || {}) };
        this.onProgress?.({ type: 'start', usage: this.message.usage });
        break;
      case 'content_block_start': {
        const b = { ...data.content_block };
        if (b.type === 'text') b.text = b.text || '';
        if (b.type === 'tool_use') {
          this.json[data.index] = '';
          this.onProgress?.({ type: 'tool', name: b.name, chars: 0 });
        }
        this.blocks[data.index] = b;
        break;
      }
      case 'content_block_delta': {
        const b = this.blocks[data.index];
        const d = data.delta || {};
        if (!b) break;
        if (d.type === 'text_delta') {
          b.text += d.text;
          this.onProgress?.({ type: 'text', text: this.text() });
        } else if (d.type === 'input_json_delta') {
          this.json[data.index] += d.partial_json || '';
          this.onProgress?.({ type: 'tool', name: b.name, chars: this.json[data.index].length });
        }
        break;
      }
      case 'content_block_stop':
        this._finishBlock(data.index);
        break;
      case 'message_delta':
        Object.assign(this.message, data.delta || {});
        this.message.usage = { ...this.message.usage, ...(data.usage || {}) };
        break;
      case 'message_stop':
        this.done = true;
        break;
      case 'error':
        throw new ApiError(0, data.error?.type, data.error?.message);
      default:
        break; // ping и будущие события
    }
  }

  _finishBlock(i) {
    const b = this.blocks[i];
    if (!b || b.type !== 'tool_use' || this.json[i] === undefined) return;
    const src = this.json[i];
    this.json[i] = undefined;
    if (!src.trim()) {
      b.input = b.input || {};
      return;
    }
    try {
      b.input = JSON.parse(src);
    } catch (err) {
      b.input = {};
      b.inputError = `JSON инструмента не читается (${err.message})`;
    }
  }

  text() {
    return this.blocks
      .filter((b) => b?.type === 'text')
      .map((b) => b.text)
      .join('');
  }

  result() {
    this.blocks.forEach((_, i) => this._finishBlock(i)); // оборванный поток — дочитать, что есть
    return { ...this.message, content: this.blocks.filter(Boolean) };
  }
}

/**
 * Запрос к Messages API с потоковым ответом.
 * @param opts { key, body, signal, onProgress, fetchImpl }
 * @returns сообщение { content, stop_reason, usage, … }
 */
export async function streamMessage({ key, body, signal, onProgress, fetchImpl = globalThis.fetch }) {
  const res = await fetchImpl(`${API_URL}/v1/messages`, {
    method: 'POST',
    headers: headers(key),
    body: JSON.stringify({ ...body, stream: true }),
    signal,
  });
  if (!res.ok) throw await errorFrom(res);
  const mb = new MessageBuilder(onProgress);
  const parser = new SSEParser((event, data) => {
    let obj;
    try {
      obj = JSON.parse(data);
    } catch {
      return;
    }
    mb.apply(obj?.type || event, obj || {});
  });
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      parser.push(dec.decode(value, { stream: true }));
    }
    parser.push(dec.decode());
    parser.end();
  } catch (err) {
    reader.cancel().catch(() => {});
    throw err;
  }
  return mb.result();
}

/** Список моделей, доступных ключу (заодно проверка ключа; запрос бесплатный). */
export async function listModels({ key, signal, fetchImpl = globalThis.fetch }) {
  const res = await fetchImpl(`${API_URL}/v1/models?limit=100`, { headers: headers(key, false), signal });
  if (!res.ok) throw await errorFrom(res);
  const j = await res.json();
  return (j.data || []).map((m) => ({ id: m.id, name: m.display_name || m.id }));
}
