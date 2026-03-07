'use strict';

const http = require('http');
const net = require('net');
const path = require('path');
const { execFile, spawn } = require('child_process');

const ROOT_DIR = path.resolve(__dirname, '..');
const SERVER_ID = 'jasons-web-dev-server';
const HEALTH_PATH = '/__dev/status';
const DEFAULT_PORT = 3000;
const parsedPort = Number(process.env.PORT || DEFAULT_PORT);
const PORT = Number.isFinite(parsedPort) && parsedPort > 0 ? parsedPort : DEFAULT_PORT;

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const execFileAsync = (file, args) => new Promise((resolve, reject) => {
    execFile(file, args, { windowsHide: true, maxBuffer: 1024 * 1024 }, (err, stdout, stderr) => {
        if (err) {
            err.stdout = stdout;
            err.stderr = stderr;
            reject(err);
            return;
        }
        resolve({ stdout, stderr });
    });
});

const probeStatusHost = (hostname) => new Promise((resolve) => {
    const req = http.request({
        method: 'GET',
        hostname,
        port: PORT,
        path: HEALTH_PATH,
        timeout: 1200,
        headers: { Accept: 'application/json' }
    }, (res) => {
        let body = '';
        res.setEncoding('utf8');
        res.on('data', (chunk) => { body += chunk; });
        res.on('end', () => {
            try {
                resolve(JSON.parse(body));
            } catch {
                resolve(null);
            }
        });
    });

    req.on('timeout', () => req.destroy(new Error('timeout')));
    req.on('error', () => resolve(null));
    req.end();
});

const probeExistingServer = async () => {
    const hosts = ['127.0.0.1', 'localhost'];
    for (const host of hosts) {
        const status = await probeStatusHost(host);
        if (status && status.id === SERVER_ID) {
            return status;
        }
    }
    return null;
};

const isPortOpenOnHost = (hostname) => new Promise((resolve) => {
    const socket = net.connect({ port: PORT, host: hostname });
    let settled = false;
    const finish = (value) => {
        if (settled) return;
        settled = true;
        try {
            socket.destroy();
        } catch {
            // ignore
        }
        resolve(value);
    };
    socket.setTimeout(700);
    socket.on('connect', () => finish(true));
    socket.on('timeout', () => finish(false));
    socket.on('error', () => finish(false));
});

const isPortInUse = async () => {
    if (await isPortOpenOnHost('127.0.0.1')) return true;
    if (await isPortOpenOnHost('localhost')) return true;
    return false;
};

const parseWindowsNetstat = (stdout) => {
    const pids = new Set();
    const lines = String(stdout || '').split(/\r?\n/);
    for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || !/^TCP\s+/i.test(trimmed)) continue;
        const cols = trimmed.split(/\s+/);
        if (cols.length < 5) continue;
        const localAddr = cols[1];
        const state = cols[3];
        const pid = Number(cols[4]);
        const portMatch = String(localAddr).match(/:(\d+)$/);
        const localPort = portMatch ? Number(portMatch[1]) : NaN;
        if (!Number.isFinite(localPort) || localPort !== PORT) continue;
        if (String(state).toUpperCase() !== 'LISTENING') continue;
        if (!Number.isFinite(pid) || pid <= 0) continue;
        pids.add(pid);
    }
    return [...pids];
};

const getListeningPids = async () => {
    if (process.platform === 'win32') {
        try {
            const { stdout } = await execFileAsync('netstat', ['-ano', '-p', 'tcp']);
            return parseWindowsNetstat(stdout);
        } catch {
            return [];
        }
    }

    try {
        const { stdout } = await execFileAsync('lsof', ['-t', `-iTCP:${PORT}`, '-sTCP:LISTEN']);
        return String(stdout || '')
            .split(/\r?\n/)
            .map((v) => Number(v.trim()))
            .filter((v) => Number.isFinite(v) && v > 0);
    } catch {
        return [];
    }
};

const parseTasklistCsvName = (stdout) => {
    const line = String(stdout || '').trim().split(/\r?\n/).find(Boolean);
    if (!line || line.startsWith('INFO:')) return '';
    const m = line.match(/^"([^"]+)"/);
    return m ? m[1] : '';
};

const getProcessName = async (pid) => {
    if (!Number.isFinite(pid) || pid <= 0) return '';
    if (process.platform === 'win32') {
        try {
            const { stdout } = await execFileAsync('tasklist', ['/FI', `PID eq ${pid}`, '/FO', 'CSV', '/NH']);
            return parseTasklistCsvName(stdout);
        } catch {
            return '';
        }
    }
    try {
        const { stdout } = await execFileAsync('ps', ['-p', String(pid), '-o', 'comm=']);
        return String(stdout || '').trim();
    } catch {
        return '';
    }
};

const isAlive = (pid) => {
    try {
        process.kill(pid, 0);
        return true;
    } catch {
        return false;
    }
};

const terminatePid = async (pid) => {
    if (!Number.isFinite(pid) || pid <= 0) return false;

    try {
        process.kill(pid, 'SIGTERM');
    } catch {
        // ignore
    }

    for (let i = 0; i < 8; i += 1) {
        if (!isAlive(pid)) return true;
        await wait(150);
    }

    if (process.platform === 'win32') {
        try {
            await execFileAsync('taskkill', ['/PID', String(pid), '/T', '/F']);
        } catch {
            // ignore
        }
    } else {
        try {
            process.kill(pid, 'SIGKILL');
        } catch {
            // ignore
        }
    }

    for (let i = 0; i < 10; i += 1) {
        if (!isAlive(pid)) return true;
        await wait(120);
    }
    return !isAlive(pid);
};

const waitForPortToClear = async () => {
    for (let i = 0; i < 20; i += 1) {
        if (!(await isPortInUse())) return true;
        await wait(150);
    }
    return !(await isPortInUse());
};

const launchServer = () => {
    const child = spawn(process.execPath, ['--env-file', '.env', 'server.js'], {
        cwd: ROOT_DIR,
        env: process.env,
        stdio: 'inherit'
    });

    const forwardSignal = (signal) => {
        if (!child.killed) child.kill(signal);
    };
    process.on('SIGINT', () => forwardSignal('SIGINT'));
    process.on('SIGTERM', () => forwardSignal('SIGTERM'));

    child.on('exit', (code, signal) => {
        if (signal) {
            process.exit(1);
            return;
        }
        process.exit(code == null ? 1 : code);
    });
};

const run = async () => {
    const healthy = await probeExistingServer();
    if (healthy) {
        console.log(`[dev] jasons-web is already running on http://localhost:${PORT} (pid ${healthy.pid}).`);
        return;
    }

    if (await isPortInUse()) {
        const pids = await getListeningPids();
        if (pids.length === 0) {
            console.error(`[dev] Port ${PORT} is busy, but no PID was discovered. Free the port and retry.`);
            process.exit(1);
            return;
        }

        let terminatedAny = false;
        for (const pid of pids) {
            const name = (await getProcessName(pid)).toLowerCase();
            if (name && name !== 'node.exe' && name !== 'node') {
                console.error(`[dev] Port ${PORT} is in use by PID ${pid} (${name}). Not terminating automatically.`);
                process.exit(1);
                return;
            }
            console.log(`[dev] Port ${PORT} held by stale PID ${pid}. Terminating...`);
            const terminated = await terminatePid(pid);
            terminatedAny = terminatedAny || terminated;
        }

        if (!terminatedAny || !(await waitForPortToClear())) {
            console.error(`[dev] Could not free port ${PORT}.`);
            process.exit(1);
            return;
        }
    }

    launchServer();
};

run().catch((err) => {
    console.error('[dev] Failed to launch dev server:', err?.message || err);
    process.exit(1);
});
