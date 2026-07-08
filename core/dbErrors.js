class DbUnavailableError extends Error {
  constructor(message, cause) {
    super(message || 'Database temporarily unavailable');
    this.name = 'DbUnavailableError';
    this.cause = cause;
  }
}

function extractErrorSignals(err) {
  const stack = [err];
  const seen = new Set();
  const values = [];
  while (stack.length) {
    const current = stack.pop();
    if (!current || typeof current !== 'object' || seen.has(current)) continue;
    seen.add(current);
    values.push(current);
    if (current.cause && typeof current.cause === 'object') stack.push(current.cause);
    if (Array.isArray(current.errors)) {
      current.errors.forEach((entry) => {
        if (entry && typeof entry === 'object') stack.push(entry);
      });
    }
    Object.getOwnPropertySymbols(current).forEach((sym) => {
      try {
        const value = current[sym];
        if (value && typeof value === 'object') stack.push(value);
      } catch {
        // ignore symbol access failures
      }
    });
  }
  return values;
}

function isTransientPgError(err) {
  const values = extractErrorSignals(err);
  const code = values.map((entry) => String(entry?.code || '').toUpperCase()).find(Boolean) || '';
  const syscall = values.map((entry) => String(entry?.syscall || '').toUpperCase()).find(Boolean) || '';
  const message = values.map((entry) => String(entry?.message || '').toLowerCase()).filter(Boolean).join(' | ');

  if (code === 'ECONNRESET' || code === 'ETIMEDOUT' || code === 'EPIPE' || code === 'ENOTFOUND' || code === 'EACCES') return true;
  if (syscall === 'READ' && message.includes('econnreset')) return true;

  return (
    message.includes('connect eacces') ||
    message.includes('connection terminated unexpectedly') ||
    message.includes('connection terminated due to connection timeout') ||
    message.includes('server closed the connection unexpectedly') ||
    message.includes('terminating connection due to administrator command') ||
    message.includes('timeout exceeded when trying to connect') ||
    message.includes('timeout expired') ||
    message.includes('aggregateerror') ||
    message.includes('eacces') ||
    message.includes('econnreset') ||
    message.includes('etimedout')
  );
}

module.exports = {
  DbUnavailableError,
  isTransientPgError
};
