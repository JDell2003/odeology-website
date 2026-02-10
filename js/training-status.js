(() => {
    const $ = (sel, root = document) => root.querySelector(sel);

    const els = {
        name: $('#ts-name'),
        sub: $('#ts-sub'),
        discipline: $('#ts-discipline'),
        days: $('#ts-days'),
        authNote: $('#ts-auth-note'),
        bio: $('#ts-bio'),
        bioSave: $('#ts-bio-save'),
        bioHint: $('#ts-bio-hint'),
        avatarWrap: $('.ts-avatar'),
        avatarImg: $('#ts-avatar-img'),
        avatarFallback: $('#ts-avatar-fallback'),
        avatarEdit: $('#ts-avatar-edit'),
        avatarFile: $('#ts-avatar-file'),
        lastWorkout: $('#ts-last-workout'),
        completion: $('#ts-completion'),
        leaderboard: $('#ts-leaderboard'),
        workouts7d: $('#ts-workouts-7d'),
        workoutCompliance: $('#ts-workout-compliance'),
        weightLost: $('#ts-weight-lost'),
        daysToGoal: $('#ts-days-to-goal'),
        planCta: $('#ts-plan-cta'),
        alert: $('#ts-alert')
    };

    const LS_KEYS = {
        startWeight: 'ode_ts_start_weight_lb',
        currentWeight: 'ode_ts_current_weight_lb',
        goalWeight: 'ode_ts_goal_weight_lb',
        pace: 'ode_ts_pace_lb_per_week'
    };

    const AVATAR_LS_PREFIX = 'ode_profile_photo_local_v1';
    const BIO_LS_PREFIX = 'ode_profile_bio_local_v1';

    const localBioKey = (userId) => `${BIO_LS_PREFIX}:${userId || 'guest'}`;
    const readLocalBio = (userId) => {
        try {
            const v = localStorage.getItem(localBioKey(userId));
            return v == null ? null : String(v);
        } catch {
            return null;
        }
    };
    const writeLocalBio = (userId, bio) => {
        try {
            localStorage.setItem(localBioKey(userId), String(bio || ''));
        } catch {
            // ignore
        }
    };

    const setText = (el, text) => {
        if (!el) return;
        el.textContent = text == null || String(text).trim() === '' ? '—' : String(text);
    };

    const fmtDate = (raw) => {
        const d = new Date(String(raw || ''));
        if (Number.isNaN(d.getTime())) return '—';
        return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
    };

    const clamp = (n, min, max) => Math.max(min, Math.min(max, n));

    const toNum = (v) => {
        const n = Number(String(v ?? '').trim());
        return Number.isFinite(n) ? n : null;
    };

    async function api(path, opts) {
        const resp = await fetch(path, {
            credentials: 'include',
            headers: { 'Content-Type': 'application/json', ...(opts?.headers || {}) },
            ...opts
        });
        let json = null;
        try {
            json = await resp.json();
        } catch {
            json = null;
        }
        return { ok: resp.ok, status: resp.status, json };
    }

    const inferGoalMode = () => {
        // 1) Nutrition snapshot saved by main.js (if user unlocked macros)
        try {
            const raw = localStorage.getItem('ode_saved_results_snapshot');
            const snap = raw ? JSON.parse(raw) : null;
            const goal = String(snap?.selections?.goal || '').trim().toLowerCase();
            if (goal === 'cut') return 'cut';
            if (goal === 'bulk') return 'bulk';
        } catch {
            // ignore
        }
        // 2) Grocery prefs mode fallback
        try {
            const prefs = JSON.parse(sessionStorage.getItem('groceryPrefs') || 'null');
            const mode = String(prefs?.mode || '').trim().toLowerCase();
            if (mode === 'cut') return 'cut';
            if (mode === 'bulk') return 'bulk';
        } catch {
            // ignore
        }
        return null;
    };

    const showAlert = (html) => {
        if (!els.alert) return;
        if (!html) {
            els.alert.classList.add('hidden');
            els.alert.textContent = '';
            return;
        }
        els.alert.innerHTML = html;
        els.alert.classList.remove('hidden');
    };

    let statusHtml = '';

    const renderTopAlert = () => {
        showAlert(statusHtml);
    };

    const localAvatarKey = (userId) => `${AVATAR_LS_PREFIX}:${userId || 'guest'}`;

    const readLocalAvatar = (userId) => {
        try {
            const v = localStorage.getItem(localAvatarKey(userId));
            return v && String(v).startsWith('data:image/') ? String(v) : null;
        } catch {
            return null;
        }
    };

    const writeLocalAvatar = (userId, dataUrl) => {
        try {
            if (!dataUrl) return;
            localStorage.setItem(localAvatarKey(userId), String(dataUrl));
        } catch {
            // ignore
        }
    };

    async function fileToSquareAvatarDataUrl(file, { size = 384, quality = 0.82, maxLen = 950_000 } = {}) {
        if (!file) return null;
        const type = String(file.type || '').toLowerCase();
        if (!type.startsWith('image/')) return null;

        const dataUrl = await new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(String(reader.result || ''));
            reader.onerror = () => reject(new Error('Failed to read file'));
            reader.readAsDataURL(file);
        });

        const img = await new Promise((resolve, reject) => {
            const i = new Image();
            i.onload = () => resolve(i);
            i.onerror = () => reject(new Error('Invalid image'));
            i.src = dataUrl;
        });

        const w = img.naturalWidth || img.width || 0;
        const h = img.naturalHeight || img.height || 0;
        if (!w || !h) return null;

        const side = Math.min(w, h);
        const sx = Math.floor((w - side) / 2);
        const sy = Math.floor((h - side) / 2);

        const attempts = [
            { size: clamp(Number(size) || 384, 160, 1024), quality: clamp(Number(quality) || 0.82, 0.6, 0.92) },
            { size: 320, quality: 0.78 },
            { size: 256, quality: 0.74 }
        ];

        let last = null;
        for (const attempt of attempts) {
            const out = clamp(Number(attempt.size) || 384, 160, 1024);
            const q = clamp(Number(attempt.quality) || 0.82, 0.6, 0.92);

            const canvas = document.createElement('canvas');
            canvas.width = out;
            canvas.height = out;
            const ctx = canvas.getContext('2d');
            if (!ctx) return null;
            ctx.imageSmoothingEnabled = true;
            ctx.imageSmoothingQuality = 'high';
            ctx.fillStyle = '#fff';
            ctx.fillRect(0, 0, out, out);
            ctx.drawImage(img, sx, sy, side, side, 0, 0, out, out);

            try {
                last = canvas.toDataURL('image/jpeg', q);
            } catch {
                last = dataUrl;
            }

            if (!last) continue;
            if (String(last).length <= maxLen) return last;
        }

        return last;
    }

    const workoutCountLast7Days = (logs) => {
        const list = Array.isArray(logs) ? logs : [];
        const now = Date.now();
        const weekAgo = now - 7 * 24 * 60 * 60 * 1000;
        return list.filter(row => {
            const t = new Date(row?.performed_at || row?.updated_at || 0).getTime();
            return Number.isFinite(t) && t >= weekAgo && t <= now;
        }).length;
    };

    const lastWorkoutDate = (logs) => {
        const list = Array.isArray(logs) ? logs : [];
        const best = list.reduce((acc, row) => {
            const t = new Date(row?.performed_at || row?.updated_at || 0).getTime();
            return t > acc ? t : acc;
        }, 0);
        return best ? new Date(best).toISOString() : null;
    };

    const completionPct = ({ plan, logs }) => {
        const weeks = Array.isArray(plan?.weeks) ? plan.weeks.length : 0;
        const daysPerWeek = Number(plan?.meta?.daysPerWeek) || 0;
        const totalSlots = weeks && daysPerWeek ? weeks * daysPerWeek : 0;
        const saved = Array.isArray(logs) ? logs.length : 0;
        if (!totalSlots) return null;
        return Math.min(100, Math.round((saved / totalSlots) * 100));
    };

    const loadGoalSettings = () => {
        const start = toNum(localStorage.getItem(LS_KEYS.startWeight));
        const current = toNum(localStorage.getItem(LS_KEYS.currentWeight));
        const goal = toNum(localStorage.getItem(LS_KEYS.goalWeight));
        const pace = toNum(localStorage.getItem(LS_KEYS.pace));
        return {
            start,
            current,
            goal,
            pace: Number.isFinite(pace) && pace > 0 ? pace : 1
        };
    };

    const computeWeightLost = ({ start, current }) => {
        if (!Number.isFinite(start) || !Number.isFinite(current)) return null;
        return start - current;
    };

    const computeDaysToGoal = ({ current, goal, pace }) => {
        if (!Number.isFinite(current) || !Number.isFinite(goal) || !Number.isFinite(pace) || pace <= 0) return null;
        const remaining = Math.abs(current - goal);
        const weeks = remaining / pace;
        return Math.max(0, Math.ceil(weeks * 7));
    };

    const setAvatar = (dataUrl, name) => {
        if (els.avatarImg) {
            if (dataUrl) {
                els.avatarImg.src = dataUrl;
                els.avatarImg.classList.remove('hidden');
            } else {
                els.avatarImg.classList.add('hidden');
                els.avatarImg.removeAttribute('src');
            }
        }
        if (els.avatarFallback) {
            const letter = String(name || '?').trim().slice(0, 1).toUpperCase() || '?';
            els.avatarFallback.textContent = letter;
            els.avatarFallback.classList.toggle('hidden', !!dataUrl);
        }
    };

    const setComplianceTone = (el, pct) => {
        if (!el) return;
        el.classList.remove('ts-bad', 'ts-warn', 'ts-good');
        if (!Number.isFinite(pct)) return;
        if (pct < 70) el.classList.add('ts-bad');
        else if (pct < 85) el.classList.add('ts-warn');
        else el.classList.add('ts-good');
    };

    const renderGoalDerivedStats = (initialCurrentWeight) => {
        const settings = loadGoalSettings();
        const current = Number.isFinite(settings.current) ? settings.current : (Number.isFinite(initialCurrentWeight) ? initialCurrentWeight : null);
        const lost = computeWeightLost({ start: settings.start, current });
        const days = computeDaysToGoal({ current, goal: settings.goal, pace: settings.pace });
        setText(els.weightLost, Number.isFinite(lost) ? `${lost.toFixed(1)} lb` : '—');
        setText(els.daysToGoal, Number.isFinite(days) ? `${days} days` : '—');
    };

    const wireAvatarEdit = () => {
        els.avatarEdit?.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            els.avatarFile?.click();
        });
        els.avatarWrap?.addEventListener('click', (e) => {
            if (e?.target?.closest?.('#ts-avatar-edit')) return;
            els.avatarFile?.click();
        });
        els.avatarFile?.addEventListener('change', async () => {
            const file = els.avatarFile?.files?.[0];
            if (!file) return;
            try {
                setText(els.authNote, 'Saving profile photo...');

                const me = await api('/api/auth/me', { method: 'GET' });
                const userId = me.ok && me.json?.user?.id ? String(me.json.user.id) : null;
                const displayName = els.name?.textContent || '';

                const dataUrl = await (window.odeAvatarCropper?.cropToSquare
                    ? window.odeAvatarCropper.cropToSquare(file, { size: 384, quality: 0.86 })
                    : fileToSquareAvatarDataUrl(file, { size: 384, quality: 0.82, maxLen: 950_000 }));
                if (!dataUrl) {
                    setText(els.authNote, 'Cancelled.');
                    return;
                }

                setAvatar(dataUrl, displayName);
                writeLocalAvatar(userId, dataUrl);

                if (!userId) {
                    setText(els.authNote, 'Saved on this device. Sign in to sync.');
                    return;
                }

                const save = async (imgUrl) => api('/api/training/profile', {
                    method: 'POST',
                    body: JSON.stringify({ profileImage: imgUrl })
                });

                let resp = await save(dataUrl);
                if (!resp.ok && resp.status === 400) {
                    const smaller = await fileToSquareAvatarDataUrl(file, { size: 256, quality: 0.74, maxLen: 950_000 });
                    if (smaller) {
                        setAvatar(smaller, displayName);
                        writeLocalAvatar(userId, smaller);
                        resp = await save(smaller);
                    }
                }

                if (!resp.ok) {
                    if (resp.status === 401) {
                        setText(els.authNote, 'Session expired. Please sign in again.');
                        return;
                    }
                    if (resp.status === 501) {
                        setText(els.authNote, 'Saved on this device. Database sync is not set up yet.');
                        return;
                    }
                    const errText = String(resp.json?.error || '');
                    if (resp.status === 404 && errText.toLowerCase().includes('unknown training route')) {
                        setText(els.authNote, 'Saved on this device. Restart the server to enable sync.');
                        return;
                    }
                    setText(els.authNote, errText || 'Could not sync photo. Saved locally.');
                    return;
                }

                const savedUrl = resp.json?.profile?.profile_image || dataUrl;
                setAvatar(savedUrl, displayName);
                writeLocalAvatar(userId, savedUrl);
                setText(els.authNote, 'Profile photo updated.');
            } catch {
                setText(els.authNote, 'Could not save photo. Saved locally.');
            } finally {
                if (els.avatarFile) els.avatarFile.value = '';
            }
        });
    };

    let activeUserId = null;

    const wireBio = () => {
        if (!els.bio || !els.bioSave) return;
        if (els.bioSave.__wired) return;
        els.bioSave.__wired = true;

        els.bioSave.addEventListener('click', async () => {
            const bio = String(els.bio?.value || '').trim();
            writeLocalBio(activeUserId, bio);

            if (!activeUserId) {
                setText(els.bioHint, 'Saved on this device. Sign in to sync.');
                return;
            }

            try {
                setText(els.bioHint, 'Saving...');
                const resp = await api('/api/training/profile', {
                    method: 'POST',
                    body: JSON.stringify({ bio })
                });
                if (!resp.ok) {
                    if (resp.status === 401) {
                        setText(els.bioHint, 'Session expired. Please sign in again.');
                        return;
                    }
                    if (resp.status === 501) {
                        setText(els.bioHint, 'Saved on this device. Database sync is not set up yet.');
                        return;
                    }
                    const errText = String(resp.json?.error || '');
                    if (resp.status === 404 && errText.toLowerCase().includes('unknown training route')) {
                        setText(els.bioHint, 'Saved on this device. Restart the server to enable sync.');
                        return;
                    }
                    setText(els.bioHint, errText || 'Could not sync bio. Saved locally.');
                    return;
                }
                const saved = String(resp.json?.profile?.bio || bio || '').trim();
                if (els.bio) els.bio.value = saved;
                writeLocalBio(activeUserId, saved);
                setText(els.bioHint, 'Bio updated.');
            } catch {
                setText(els.bioHint, 'Could not save bio. Saved locally.');
            }
        });
    };

    async function load() {
        setText(els.authNote, 'Loading...');
        els.leaderboard && (els.leaderboard.textContent = '—');

        const me = await api('/api/auth/me', { method: 'GET' });
        const user = me.ok ? (me.json?.user || null) : null;
        if (!user) {
            activeUserId = null;
            setText(els.name, 'Guest');
            setText(els.sub, 'Sign in to see your training stats.');
            setText(els.authNote, 'Use "Sign In" in the top-right or control panel.');
            setAvatar(readLocalAvatar(null), 'G');
            els.planCta?.classList.remove('hidden');
            if (els.bio) els.bio.value = readLocalBio(null) || '';
            setText(els.bioHint, 'Saved on this device. Sign in to sync.');
            wireBio();
            setText(els.workouts7d, 'Done: —');
            setText(els.workoutCompliance, '—');
            setComplianceTone(els.workoutCompliance, null);
            setText(els.lastWorkout, 'Last workout: —');
            setText(els.completion, 'Completion: —');
            renderGoalDerivedStats(null);
            renderTopAlert();
            return;
        }

        const displayName = user.displayName || user.username || 'Account';
        activeUserId = String(user.id || '');
        setText(els.name, displayName);
        const localAvatar = readLocalAvatar(String(user.id || ''));
        const localBio = readLocalBio(String(user.id || ''));

        const stateResp = await api('/api/training/state', { method: 'GET' });
        if (!stateResp.ok) {
            setText(els.sub, 'No training plan yet.');
            setText(els.authNote, 'Open Training to build your plan.');
            setAvatar(localAvatar, displayName);
            els.planCta?.classList.remove('hidden');
            if (els.bio) els.bio.value = localBio || '';
            setText(els.bioHint, 'Visible on the community leaderboard.');
            wireBio();
            setText(els.workouts7d, 'Done: 0 / — (7d)');
            setText(els.workoutCompliance, '—');
            setComplianceTone(els.workoutCompliance, null);
            setText(els.lastWorkout, 'Last workout: —');
            setText(els.completion, 'Completion: —');
            renderGoalDerivedStats(null);
            renderTopAlert();
            return;
        }

        const profile = stateResp.json?.profile || null;
        const planRow = stateResp.json?.plan || null;
        const plan = planRow?.plan || null;
        els.planCta?.classList.toggle('hidden', !!planRow?.id);

        const firstName = profile?.first_name ? String(profile.first_name) : '';
        const discipline = profile?.discipline ? String(profile.discipline) : (planRow?.discipline || '');
        const exp = profile?.experience ? String(profile.experience) : '';
        const daysPerWeek = Number(profile?.days_per_week || planRow?.days_per_week || plan?.meta?.daysPerWeek || 0) || 0;
        const city = profile?.location_city ? String(profile.location_city) : '';
        const st = profile?.location_state ? String(profile.location_state) : '';
        const loc = [city, st].filter(Boolean).join(', ');

        setText(els.sub, [firstName && `Hi, ${firstName}`, exp && `${exp}`, loc && `${loc}`].filter(Boolean).join(' · ') || 'Signed in');
        setText(els.discipline, `Discipline: ${discipline || '—'}`);
        setText(els.days, `Days/wk: ${daysPerWeek || '—'}`);
        setAvatar(profile?.profile_image || localAvatar || null, displayName);
        if (els.bio) els.bio.value = String(profile?.bio || localBio || '').trim();
        setText(els.bioHint, 'Visible on the community leaderboard.');
        wireBio();

        let logs = [];
        if (planRow?.id) {
            const logsResp = await api(`/api/training/logs?planId=${encodeURIComponent(planRow.id)}`, { method: 'GET' });
            logs = logsResp.ok ? (logsResp.json?.logs || []) : [];
        }

        const done7 = workoutCountLast7Days(logs);
        const expected7 = daysPerWeek ? Math.max(0, Math.round(daysPerWeek)) : null;
        const compliance7 = expected7 ? clamp(Math.round((done7 / expected7) * 100), 0, 100) : null;

        const lastIso = lastWorkoutDate(logs);
        setText(els.lastWorkout, `Last workout: ${lastIso ? fmtDate(lastIso) : '—'}`);
        const pct = completionPct({ plan, logs });
        setText(els.completion, `Completion: ${pct == null ? '—' : `${pct}%`}`);
        setText(els.workouts7d, expected7 == null ? `Done: ${done7} (7d)` : `Done: ${done7} / ${expected7} (7d)`);
        setText(els.workoutCompliance, compliance7 == null ? '—' : `${compliance7}%`);
        setComplianceTone(els.workoutCompliance, compliance7);

        // Leaderboard placement
        try {
            const lb = await api('/api/leaderboard', { method: 'GET' });
            if (lb.ok && lb.json?.you?.rank) {
                setText(els.leaderboard, `#${lb.json.you.rank}`);
            } else {
                setText(els.leaderboard, '—');
            }
        } catch {
            setText(els.leaderboard, '—');
        }

        const currentBw = toNum(profile?.strength?.bodyweight);
        renderGoalDerivedStats(currentBw);

        // Auto-adjust notice / flags from server.
        const offset = Number(profile?.calorie_offset) || 0;
        if (Number.isFinite(offset)) localStorage.setItem('ode_training_calorie_offset', String(offset));
        const iterations = Number(profile?.no_progress_iterations) || 0;
        const flagged = !!profile?.flagged;
        if (flagged) {
            statusHtml = `⚠️ <strong>Profile flagged</strong>: 4+ auto-adjusts without progress. We’ll recommend a deeper check-in.`;
        } else if (iterations > 0) {
            statusHtml = `Auto-adjust streak: <strong>${iterations}</strong> week${iterations === 1 ? '' : 's'}. Current calorie offset: <strong>${offset > 0 ? '+' : ''}${offset} kcal</strong>.`;
        } else {
            statusHtml = '';
        }
        renderTopAlert();

        setText(els.authNote, 'Status loaded.');
    }

    document.addEventListener('DOMContentLoaded', () => {
        wireAvatarEdit();

        window.addEventListener('ode:checkin-saved', (event) => {
            const payload = event?.detail?.payload || null;
            const weightLb = toNum(payload?.weightLb);
            if (Number.isFinite(weightLb) && weightLb > 0) {
                try {
                    localStorage.setItem(LS_KEYS.currentWeight, String(weightLb));
                } catch {
                    // ignore
                }
            }
            load();
        });

        load();
    });
})();
