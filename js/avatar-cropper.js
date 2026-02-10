(() => {
    function $(sel, root = document) {
        return root.querySelector(sel);
    }

    function el(tag, attrs = {}, ...children) {
        const node = document.createElement(tag);
        Object.entries(attrs || {}).forEach(([k, v]) => {
            if (v == null) return;
            if (k === 'class') node.className = String(v);
            else if (k === 'style') node.setAttribute('style', String(v));
            else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2), v);
            else node.setAttribute(k, String(v));
        });
        children.flat().forEach((c) => {
            if (c == null) return;
            node.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
        });
        return node;
    }

    function clamp(n, min, max) {
        return Math.max(min, Math.min(max, n));
    }

    function fileToDataUrl(file) {
        return new Promise((resolve, reject) => {
            const r = new FileReader();
            r.onerror = () => reject(new Error('Failed to read file'));
            r.onload = () => resolve(String(r.result || ''));
            r.readAsDataURL(file);
        });
    }

    function loadImage(src) {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.onload = () => resolve(img);
            img.onerror = () => reject(new Error('Failed to load image'));
            img.src = src;
        });
    }

    function ensureModal() {
        let modal = document.getElementById('ode-avatar-cropper');
        if (modal) return modal;

        modal = el('div', { class: 'avatar-cropper hidden', id: 'ode-avatar-cropper', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Crop profile photo' },
            el('div', { class: 'avatar-cropper-backdrop', id: 'ode-avatar-cropper-backdrop' }),
            el('div', { class: 'avatar-cropper-card' },
                el('div', { class: 'avatar-cropper-head' },
                    el('div', null,
                        el('div', { class: 'avatar-cropper-title' }, 'Crop photo'),
                        el('div', { class: 'avatar-cropper-sub ns-muted' }, 'Drag to reposition. Use the slider to zoom.')
                    ),
                    el('button', { class: 'avatar-cropper-close', id: 'ode-avatar-cropper-close', type: 'button', 'aria-label': 'Close' }, '×')
                ),
                el('div', { class: 'avatar-cropper-body' },
                    el('div', { class: 'avatar-cropper-viewport', id: 'ode-avatar-cropper-viewport' },
                        el('img', { class: 'avatar-cropper-img', id: 'ode-avatar-cropper-img', alt: 'Crop preview' }),
                        el('div', { class: 'avatar-cropper-mask', 'aria-hidden': 'true' })
                    ),
                    el('div', { class: 'avatar-cropper-controls' },
                        el('label', { class: 'avatar-cropper-zoom' },
                            el('span', { class: 'ns-muted' }, 'Zoom'),
                            el('input', { id: 'ode-avatar-cropper-zoom', type: 'range', min: '1', max: '3', step: '0.01', value: '1' })
                        )
                    )
                ),
                el('div', { class: 'avatar-cropper-actions' },
                    el('button', { class: 'btn btn-ghost', id: 'ode-avatar-cropper-cancel', type: 'button' }, 'Cancel'),
                    el('button', { class: 'btn btn-primary', id: 'ode-avatar-cropper-save', type: 'button' }, 'Use photo')
                )
            )
        );

        document.body.appendChild(modal);
        return modal;
    }

    async function cropToSquare(file, { size = 384, quality = 0.86 } = {}) {
        const modal = ensureModal();
        const backdrop = $('#ode-avatar-cropper-backdrop', modal);
        const closeBtn = $('#ode-avatar-cropper-close', modal);
        const cancelBtn = $('#ode-avatar-cropper-cancel', modal);
        const saveBtn = $('#ode-avatar-cropper-save', modal);
        const imgEl = $('#ode-avatar-cropper-img', modal);
        const viewport = $('#ode-avatar-cropper-viewport', modal);
        const zoomEl = $('#ode-avatar-cropper-zoom', modal);

        const dataUrl = await fileToDataUrl(file);
        const img = await loadImage(dataUrl);
        imgEl.src = dataUrl;

        modal.classList.remove('hidden');

        const getV = () => {
            const r = viewport.getBoundingClientRect();
            const v = Math.max(220, Math.min(360, Math.floor(r.width || 320)));
            return v;
        };

        let v = getV();
        let panX = 0;
        let panY = 0;
        let zoom = 1;

        const baseScale = () => Math.max(v / img.naturalWidth, v / img.naturalHeight);
        const currentScale = () => baseScale() * zoom;
        const dispW = () => img.naturalWidth * currentScale();
        const dispH = () => img.naturalHeight * currentScale();

        const clampPan = () => {
            const w = dispW();
            const h = dispH();
            const maxX = Math.max(0, (w - v) / 2);
            const maxY = Math.max(0, (h - v) / 2);
            panX = clamp(panX, -maxX, maxX);
            panY = clamp(panY, -maxY, maxY);
        };

        const apply = () => {
            clampPan();
            imgEl.style.transform = `translate(${panX}px, ${panY}px) scale(${currentScale()})`;
        };

        const resetLayout = () => {
            v = getV();
            viewport.style.setProperty('--crop-v', `${v}px`);
            panX = 0;
            panY = 0;
            zoom = Number(zoomEl.value) || 1;
            clampPan();
            apply();
        };

        // Center + cover: we scale via transform; set image at center baseline.
        imgEl.style.transformOrigin = '50% 50%';
        imgEl.style.width = `${img.naturalWidth}px`;
        imgEl.style.height = `${img.naturalHeight}px`;

        const onResize = () => resetLayout();
        window.addEventListener('resize', onResize, { passive: true });

        let dragging = false;
        let startX = 0;
        let startY = 0;
        let startPanX = 0;
        let startPanY = 0;

        const onDown = (e) => {
            dragging = true;
            const pt = e.touches?.[0] || e;
            startX = pt.clientX;
            startY = pt.clientY;
            startPanX = panX;
            startPanY = panY;
            viewport.classList.add('is-dragging');
        };
        const onMove = (e) => {
            if (!dragging) return;
            const pt = e.touches?.[0] || e;
            panX = startPanX + (pt.clientX - startX);
            panY = startPanY + (pt.clientY - startY);
            apply();
        };
        const onUp = () => {
            dragging = false;
            viewport.classList.remove('is-dragging');
        };

        const onZoom = () => {
            zoom = clamp(Number(zoomEl.value) || 1, 1, 3);
            apply();
        };

        viewport.addEventListener('mousedown', onDown);
        viewport.addEventListener('touchstart', onDown, { passive: true });
        window.addEventListener('mousemove', onMove, { passive: true });
        window.addEventListener('touchmove', onMove, { passive: true });
        window.addEventListener('mouseup', onUp, { passive: true });
        window.addEventListener('touchend', onUp, { passive: true });
        zoomEl.addEventListener('input', onZoom, { passive: true });

        resetLayout();

        const cleanup = () => {
            modal.classList.add('hidden');
            window.removeEventListener('resize', onResize);
            viewport.removeEventListener('mousedown', onDown);
            viewport.removeEventListener('touchstart', onDown);
            window.removeEventListener('mousemove', onMove);
            window.removeEventListener('touchmove', onMove);
            window.removeEventListener('mouseup', onUp);
            window.removeEventListener('touchend', onUp);
            zoomEl.removeEventListener('input', onZoom);
        };

        const toOutput = () => {
            const scale = currentScale();
            const w = dispW();
            const h = dispH();
            const imgLeft = (v / 2) - (w / 2) + panX;
            const imgTop = (v / 2) - (h / 2) + panY;

            const sx = (0 - imgLeft) / scale;
            const sy = (0 - imgTop) / scale;
            const swh = v / scale;

            const canvas = document.createElement('canvas');
            canvas.width = size;
            canvas.height = size;
            const ctx = canvas.getContext('2d');
            ctx.imageSmoothingEnabled = true;
            ctx.imageSmoothingQuality = 'high';
            ctx.fillStyle = '#000';
            ctx.fillRect(0, 0, size, size);
            ctx.drawImage(
                img,
                clamp(sx, 0, img.naturalWidth),
                clamp(sy, 0, img.naturalHeight),
                clamp(swh, 1, img.naturalWidth),
                clamp(swh, 1, img.naturalHeight),
                0,
                0,
                size,
                size
            );
            return canvas.toDataURL('image/jpeg', quality);
        };

        return await new Promise((resolve) => {
            const done = (value) => {
                cleanup();
                resolve(value);
            };
            const onCancel = () => done(null);
            const onSave = () => done(toOutput());

            const esc = (e) => {
                if (e.key === 'Escape') done(null);
            };

            backdrop.addEventListener('click', onCancel, { once: true });
            closeBtn.addEventListener('click', onCancel, { once: true });
            cancelBtn.addEventListener('click', onCancel, { once: true });
            saveBtn.addEventListener('click', onSave, { once: true });
            window.addEventListener('keydown', esc, { once: true });
        });
    }

    window.odeAvatarCropper = { cropToSquare };
})();

