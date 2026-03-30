(function initExternalKeydownShield() {
    if (typeof window === 'undefined' || typeof document === 'undefined') return;
    if (window.__odeExternalKeydownShieldReady) return;
    window.__odeExternalKeydownShieldReady = true;

    const originalAddEventListener = EventTarget.prototype.addEventListener;
    const originalRemoveEventListener = EventTarget.prototype.removeEventListener;
    const wrappedListenersByTarget = new WeakMap();
    const previousOnError = typeof window.onerror === 'function' ? window.onerror : null;

    function getCapture(options) {
        if (typeof options === 'boolean') return options;
        return !!(options && typeof options === 'object' && options.capture);
    }

    function getWrappedListenerStore(target, listener) {
        let listenerStore = wrappedListenersByTarget.get(target);
        if (!listenerStore) {
            listenerStore = new WeakMap();
            wrappedListenersByTarget.set(target, listenerStore);
        }
        let wrappedByKey = listenerStore.get(listener);
        if (!wrappedByKey) {
            wrappedByKey = new Map();
            listenerStore.set(listener, wrappedByKey);
        }
        return wrappedByKey;
    }

    function defineStringProperty(target, key, fallback) {
        if (!target || typeof target !== 'object') return;
        if (typeof target[key] === 'string') return;
        try {
            Object.defineProperty(target, key, {
                configurable: true,
                enumerable: false,
                value: fallback
            });
        } catch {
            // ignore
        }
    }

    function sanitizeKeydownEvent(event) {
        if (!event || typeof event !== 'object') return;
        defineStringProperty(event, 'key', '');
        defineStringProperty(event, 'code', '');
        defineStringProperty(event, 'keyIdentifier', '');
    }

    function shouldSuppressExternalKeydownError(err, source) {
        const message = String(err?.message || '').toLowerCase();
        const stack = String(err?.stack || '').toLowerCase();
        const sourceText = String(source || '').toLowerCase();
        if (stack.includes('page-events.js') || sourceText.includes('page-events.js')) return true;
        return message.includes("reading 'length'") && stack.includes('handlekeydown');
    }

    function buildWrappedListener(listener) {
        if (typeof listener === 'function') {
            return function wrappedExternalKeydownListener(event) {
                sanitizeKeydownEvent(event);
                try {
                    return listener.call(this, event);
                } catch (err) {
                    if (shouldSuppressExternalKeydownError(err)) return;
                    throw err;
                }
            };
        }
        return {
            handleEvent(event) {
                sanitizeKeydownEvent(event);
                try {
                    return listener.handleEvent.call(listener, event);
                } catch (err) {
                    if (shouldSuppressExternalKeydownError(err)) return;
                    throw err;
                }
            }
        };
    }

    EventTarget.prototype.addEventListener = function patchedAddEventListener(type, listener, options) {
        const supportsWrapping = type === 'keydown'
            && listener
            && (typeof listener === 'function' || typeof listener?.handleEvent === 'function');
        if (!supportsWrapping) {
            return originalAddEventListener.call(this, type, listener, options);
        }
        const capture = getCapture(options);
        const wrappedByKey = getWrappedListenerStore(this, listener);
        const key = capture ? 'keydown:1' : 'keydown:0';
        let wrapped = wrappedByKey.get(key);
        if (!wrapped) {
            wrapped = buildWrappedListener(listener);
            wrappedByKey.set(key, wrapped);
        }
        return originalAddEventListener.call(this, type, wrapped, options);
    };

    EventTarget.prototype.removeEventListener = function patchedRemoveEventListener(type, listener, options) {
        const supportsWrapping = type === 'keydown'
            && listener
            && (typeof listener === 'function' || typeof listener?.handleEvent === 'function');
        if (!supportsWrapping) {
            return originalRemoveEventListener.call(this, type, listener, options);
        }
        const capture = getCapture(options);
        const wrappedByKey = getWrappedListenerStore(this, listener);
        const key = capture ? 'keydown:1' : 'keydown:0';
        const wrapped = wrappedByKey.get(key);
        return originalRemoveEventListener.call(this, type, wrapped || listener, options);
    };

    window.onerror = function patchedWindowOnError(message, source, lineno, colno, error) {
        if (shouldSuppressExternalKeydownError(error, source || message)) return true;
        if (previousOnError) return previousOnError.call(this, message, source, lineno, colno, error);
        return false;
    };

    originalAddEventListener.call(window, 'keydown', sanitizeKeydownEvent, true);
    originalAddEventListener.call(document, 'keydown', sanitizeKeydownEvent, true);
    originalAddEventListener.call(window, 'error', (event) => {
        if (!shouldSuppressExternalKeydownError(event?.error, event?.filename)) return;
        event.preventDefault();
        event.stopImmediatePropagation?.();
    }, true);
    originalAddEventListener.call(document, 'error', (event) => {
        if (!shouldSuppressExternalKeydownError(event?.error, event?.filename)) return;
        event.preventDefault?.();
        event.stopImmediatePropagation?.();
    }, true);
})();
