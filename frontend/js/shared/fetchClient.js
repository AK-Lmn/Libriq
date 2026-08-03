const RETRYABLE_STATUS = new Set([408, 425, 429, 500, 502, 503, 504]);

export class FetchClientError extends Error {
  constructor(message, { code, status = null, url = '', cause = null, retryable = false } = {}) {
    super(message, cause ? { cause } : undefined);
    this.name = code === 'TIMEOUT' || code === 'ABORTED' ? 'AbortError' : 'FetchClientError';
    this.code = code || 'REQUEST_FAILED';
    this.status = status;
    this.url = url;
    this.retryable = retryable;
  }
}

export async function fetchJson(url, options = {}) {
  const {
    timeoutMs = 8000,
    retries = 0,
    retryDelayMs = 250,
    signal,
    ...requestInit
  } = options;

  let attempt = 0;
  while (true) {
    try {
      const response = await request(url, { ...requestInit, timeoutMs, signal });
      return await response.json();
    } catch (error) {
      const normalized = normalizeFetchError(error, url);
      if (attempt >= retries || !normalized.retryable || signal?.aborted) throw normalized;
      await delay(retryDelayMs * (2 ** attempt), signal);
      attempt += 1;
    }
  }
}

export async function request(url, options = {}) {
  const { timeoutMs = 8000, signal, ...requestInit } = options;
  const timeoutController = new AbortController();
  const timer = setTimeout(() => timeoutController.abort('timeout'), timeoutMs);
  const combinedSignal = combineSignals(signal, timeoutController.signal);

  try {
    const response = await fetch(url, {
      cache: 'no-store',
      credentials: 'omit',
      ...requestInit,
      signal: combinedSignal,
    });
    if (!response.ok) {
      throw new FetchClientError(`Request failed with HTTP ${response.status}.`, {
        code: 'HTTP_ERROR',
        status: response.status,
        url: String(url),
        retryable: RETRYABLE_STATUS.has(response.status),
      });
    }
    return response;
  } catch (error) {
    if (timeoutController.signal.aborted && !signal?.aborted) {
      throw new FetchClientError(`Request timed out after ${timeoutMs}ms.`, {
        code: 'TIMEOUT',
        url: String(url),
        cause: error,
        retryable: true,
      });
    }
    throw normalizeFetchError(error, url);
  } finally {
    clearTimeout(timer);
  }
}

export function normalizeFetchError(error, url = '') {
  if (error instanceof FetchClientError) return error;
  if (error?.name === 'AbortError') {
    return new FetchClientError('Request was cancelled.', {
      code: 'ABORTED',
      url: String(url),
      cause: error,
      retryable: false,
    });
  }
  if (error instanceof SyntaxError) {
    return new FetchClientError('The server returned invalid JSON.', {
      code: 'INVALID_JSON',
      url: String(url),
      cause: error,
    });
  }
  return new FetchClientError('The network request failed.', {
    code: 'NETWORK_ERROR',
    url: String(url),
    cause: error,
    retryable: true,
  });
}

function combineSignals(externalSignal, timeoutSignal) {
  if (!externalSignal) return timeoutSignal;
  if (typeof AbortSignal.any === 'function') return AbortSignal.any([externalSignal, timeoutSignal]);
  const controller = new AbortController();
  const abort = event => controller.abort(event.target.reason);
  if (externalSignal.aborted) controller.abort(externalSignal.reason);
  else externalSignal.addEventListener('abort', abort, { once: true });
  timeoutSignal.addEventListener('abort', abort, { once: true });
  return controller.signal;
}

function delay(ms, signal) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener('abort', () => {
      clearTimeout(timer);
      reject(new FetchClientError('Request was cancelled.', { code: 'ABORTED' }));
    }, { once: true });
  });
}
