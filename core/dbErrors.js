class DbUnavailableError extends Error {
  constructor(message, cause) {
    super(message || 'Database temporarily unavailable');
    this.name = 'DbUnavailableError';
    this.cause = cause;
  }
}

function isTransientPgError(err) {
  const code = String(err?.code || '').toUpperCase();
  const syscall = String(err?.syscall || '').toUpperCase();
  const message = String(err?.message || '').toLowerCase();

  if (code === 'ECONNRESET' || code === 'ETIMEDOUT' || code === 'EPIPE' || code === 'ENOTFOUND') return true;
  if (syscall === 'READ' && message.includes('econnreset')) return true;

  return (
    message.includes('connection terminated unexpectedly') ||
    message.includes('connection terminated due to connection timeout') ||
    message.includes('server closed the connection unexpectedly') ||
    message.includes('terminating connection due to administrator command') ||
    message.includes('econnreset') ||
    message.includes('etimedout')
  );
}

module.exports = {
  DbUnavailableError,
  isTransientPgError
};
