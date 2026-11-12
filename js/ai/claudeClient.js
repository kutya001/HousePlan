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
export const API_VERSION = '2026-10-21';

/**
 * @param workspace — ID рабочего пространства (wrkspc_…): нужен только ключам,
 *                    не привязанным к одному пространству
 */
function headers(key, json = true, workspace = '') {
  return {
    'x-api-key': key,
    'anthropic-version': API_VERSION,
    'anthropic-dangerous-direct-browser-access': 'true',
    ...(workspace ? { 'anthropic-workspace-id': workspace } : {}),
    ...(json ? { 'content-type': 'application/json' } : {}),
  };
}

/** Ошибка API: HTTP-статус, тип из ответа и текст. */
export class ApiError extends Error {
  constructor(status, type, message, retryAfter = null) {
    super(message || type || `HTTP ${status}`);
    this.name = 'ApiError';
    this.status = status;
    this.type = type || '';
    this.retryAfter = retryAfter; // секунды из заголовка retry-after
  }

  /** Ключ исправен, но запросу нужен ID рабочего пространства. */
  get needsWorkspace() {
    return /not scoped to a workspace|anthropic-workspace-id|Workspace `/i.test(this.message);
  }

  /** Организация запрещает запросы из браузера — ключ ни при чём. */
  get corsBlocked() {
    return /CORS requests are not allowed/i.test(this.message);
  }

  /** Временный сбой: имеет смысл повторить запрос. */
  get transient() {
    if (this.status === 429) return this.retryAfter != null; // без retry-after — исчерпан месячный лимит
    return [500, 502, 503, 504, 529].includes(this.status) || ['overloaded_error', 'api_error', 'timeout_error'].includes(this.type);
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
  const ra = Number(res.headers?.get?.('retry-after'));
  return new ApiError(res.status, type, message, Number.isFinite(ra) && ra >= 0 ? ra : null);
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
  if (err.corsBlocked) return 'Ваша организация в консоли Anthropic не разрешает запросы из браузера (настройки хранения данных или Compliance API). Ключ исправен, но встроенный помощник с ним работать не сможет — нужен ключ из организации без этих настроек.';
  if (err.needsWorkspace) {
    return err.status === 404
      ? 'Рабочее пространство с таким ID не найдено или у ключа нет к нему доступа — проверьте ID в настройках ИИ.'
      : 'Ключ не привязан к рабочему пространству. Укажите ID пространства (wrkspc_…) в настройках ИИ или создайте ключ с привязкой к Workspace.';
  }
  if (err.status === 401 || err.type === 'authentication_error') return 'Ключ API не подошёл: он введён с ошибкой, отключён или истёк срок его действия. Проверьте ключ в настройках ИИ.';
  if (err.status === 402 || err.type === 'billing_error' || /credit balance|billing|purchase credits/i.test(m)) return 'На счёте API недостаточно средств — пополните баланс в консоли Anthropic (Billing).';
  if (/spend limit|spend cap/i.test(m)) return 'Достигнут лимит расходов, заданный в консоли Anthropic, — поднимите лимит или дождитесь нового периода.';
  if (err.status === 403 || err.type === 'permission_error') return `У ключа нет доступа: ${m || 'запрещено'}`;
  if (err.status === 404 || err.type === 'not_found_error') return `Модель ${model ? `«${model}» ` : ''}недоступна для вашего ключа — выберите другую в настройках ИИ.`;
  if (err.status === 413 || err.type === 'request_too_large') return 'Запрос слишком большой — уберите фото или начните новый разговор.';
  if (err.status === 429 || err.type === 'rate_limit_error') return err.retryAfter == null ? 'Достигнут лимит использования API для вашего тарифа — подождите или повысьте лимит в консоли Anthropic.' : 'Слишком много запросов подряд — подождите минуту и повторите.';
  if (err.status === 504 || err.type === 'timeout_error') return 'API не успел ответить — повторите запрос; для больших домов выберите «Быстро» в настройках ИИ.';
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
        // размышление: текст может быть пустым, подпись придёт отдельным событием —
        // блок нужно вернуть API без изменений, если ход продолжится (tool_result)
        if (b.type === 'thinking') {
          b.thinking = b.thinking || '';
          b.signature = b.signature || '';
          this.onProgress?.({ type: 'thinking' });
        }
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
        } else if (d.type === 'thinking_delta') {
          b.thinking = (b.thinking || '') + (d.thinking || '');
        } else if (d.type === 'signature_delta') {
          b.signature = (b.signature || '') + (d.signature || '');
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
        throw new ApiError(data.error?.type === 'overloaded_error' ? 529 : 0, data.error?.type, data.error?.message);
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

const sleep = (ms, signal) =>
  new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(Object.assign(new Error('Остановлено'), { name: 'AbortError' }));
    const t = setTimeout(resolve, ms);
    signal?.addEventListener('abort', () => (clearTimeout(t), reject(Object.assign(new Error('Остановлено'), { name: 'AbortError' }))), { once: true });
  });

/** Задержки перед автоповтором при временных сбоях (перегрузка, 5xx, обрыв сети), мс. */
export const RETRY_DELAYS = [2000, 6000];

/**
 * Запрос к Messages API с потоковым ответом.
 * Временные сбои (перегрузка, 5xx, лимит с retry-after, обрыв сети) повторяются
 * сами — до двух раз, с паузой; onProgress({ type: 'wait', seconds, attempt }).
 * @param opts { key, workspace, body, signal, onProgress, fetchImpl, retryDelays }
 * @returns сообщение { content, stop_reason, usage, … }
 */
export async function streamMessage(opts) {
  const delays = opts.retryDelays || RETRY_DELAYS;
  for (let attempt = 0; ; attempt++) {
    try {
      return await streamOnce(opts);
    } catch (err) {
      const net = err instanceof TypeError; // fetch не дошёл до сервера
      const again = attempt < delays.length && err.name !== 'AbortError' && (net ? attempt === 0 : err instanceof ApiError && err.transient);
      if (!again) throw err;
      const ms = err.retryAfter != null ? Math.min(60000, err.retryAfter * 1000 + 250) : delays[attempt];
      opts.onProgress?.({ type: 'wait', seconds: Math.round(ms / 1000), attempt: attempt + 1 });
      await sleep(ms, opts.signal);
    }
  }
}

async function streamOnce({ key, workspace = '', body, signal, onProgress, fetchImpl = globalThis.fetch }) {
  const res = await fetchImpl(`${API_URL}/v1/messages`, {
    method: 'POST',
    headers: headers(key, true, workspace),
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
export async function listModels({ key, workspace = '', signal, fetchImpl = globalThis.fetch }) {
  const res = await fetchImpl(`${API_URL}/v1/models?limit=100`, { headers: headers(key, false, workspace), signal });
  if (!res.ok) throw await errorFrom(res);
  const j = await res.json();
  return (j.data || []).map((m) => ({ id: m.id, name: m.display_name || m.id }));
}
