/**
 * test-responsive.js — Responsive verification and screenshot capture at 360, 768, 1280, 1920px
 * Phase 7 Requirement D.4 / I.7
 */

import { spawn } from 'child_process';
import http from 'http';
import fs from 'fs';
import path from 'path';
import os from 'os';

const ROOT_DIR = process.cwd();
const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const PORT = 5173;
const DEBUG_PORT = 9237;
const RENDERED_DIR = path.join(ROOT_DIR, 'reference', 'rendered');

async function waitForServer(url, timeoutMs = 8000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      await new Promise((resolve, reject) => {
        const req = http.get(url, (res) => {
          if (res.statusCode === 200) resolve();
          else reject(new Error(`Status ${res.statusCode}`));
        });
        req.on('error', reject);
        req.setTimeout(500, () => req.destroy());
      });
      return;
    } catch {
      await new Promise((r) => setTimeout(r, 200));
    }
  }
  throw new Error(`Server at ${url} did not become ready in ${timeoutMs}ms`);
}

class CDPClient {
  constructor(ws) {
    this.ws = ws;
    this.id = 1;
    this.callbacks = new Map();
    this.ws.onmessage = (event) => {
      const msg = JSON.parse(event.data);
      if (msg.id && this.callbacks.has(msg.id)) {
        const cb = this.callbacks.get(msg.id);
        this.callbacks.delete(msg.id);
        if (msg.error) cb.reject(new Error(msg.error.message));
        else cb.resolve(msg.result);
      }
    };
  }

  async send(method, params = {}) {
    const id = this.id++;
    return new Promise((resolve, reject) => {
      this.callbacks.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }

  async eval(expression) {
    const res = await this.send('Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise: true
    });
    if (res.exceptionDetails) {
      throw new Error(`Eval error: ${JSON.stringify(res.exceptionDetails)}`);
    }
    return res.result ? res.result.value : undefined;
  }
}

async function connectToWs(wsUrl) {
  const ws = new WebSocket(wsUrl);
  await new Promise((r) => (ws.onopen = r));
  return new CDPClient(ws);
}

const VIEWPORTS = [
  { width: 360, height: 740, name: '360px (mobile)' },
  { width: 768, height: 1024, name: '768px (tablet)' },
  { width: 1280, height: 900, name: '1280px (desktop)' },
  { width: 1920, height: 1080, name: '1920px (ultrawide)' }
];

async function run() {
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'chrome-responsive-'));
  const server = spawn('node', ['scripts/dev-server.js'], { stdio: 'ignore' });
  const chrome = spawn(
    CHROME_PATH,
    [
      `--remote-debugging-port=${DEBUG_PORT}`,
      `--user-data-dir=${userDataDir}`,
      '--no-first-run',
      '--no-default-browser-check',
      '--headless=new',
      '--disable-gpu',
      'about:blank'
    ],
    { stdio: 'ignore' }
  );

  try {
    await waitForServer(`http://localhost:${PORT}/create.html`);
    await waitForServer(`http://127.0.0.1:${DEBUG_PORT}/json/version`);

    const tabsRes = await fetch(`http://127.0.0.1:${DEBUG_PORT}/json/list`);
    const tabs = await tabsRes.json();
    const cdp = await connectToWs(tabs[0].webSocketDebuggerUrl);

    await cdp.send('Page.enable');
    await cdp.send('Runtime.enable');

    console.log('=== RESPONSIVE VIEWPORT AUDIT & SCREENSHOT CAPTURE ===\n');

    const pages = [
      { name: 'landing', path: '/' },
      { name: 'create', path: '/create.html' }
    ];

    for (const page of pages) {
      console.log(`--- Page: ${page.name} (${page.path}) ---`);
      for (const vp of VIEWPORTS) {
        await cdp.send('Emulation.clearDeviceMetricsOverride');
        await cdp.send('Emulation.setDeviceMetricsOverride', {
          width: vp.width,
          height: vp.height,
          deviceScaleFactor: 1,
          mobile: vp.width <= 768
        });

        await new Promise((resolve) => {
          let timeout = setTimeout(resolve, 2000);
          const handler = (event) => {
            const msg = JSON.parse(event.data);
            if (msg.method === 'Page.loadEventFired') {
              clearTimeout(timeout);
              cdp.ws.removeEventListener('message', handler);
              resolve();
            }
          };
          cdp.ws.addEventListener('message', handler);
          cdp.send('Page.navigate', { url: `http://localhost:${PORT}${page.path}` });
        });
        await new Promise((r) => setTimeout(r, 600));

        // Evaluate overflow and geometry
        const metrics = await cdp.eval(`(() => {
          const docW = document.documentElement.scrollWidth;
          const winW = window.innerWidth;
          const hasHScroll = docW > winW;
          return { docW, winW, hasHScroll };
        })()`);

        const shot = await cdp.send('Page.captureScreenshot', { format: 'png' });
        const shotPath = path.join(RENDERED_DIR, `responsive-${page.name}-${vp.width}.png`);
        fs.writeFileSync(shotPath, Buffer.from(shot.data, 'base64'));

        const pass = !metrics.hasHScroll;
        console.log(
          `  [${pass ? 'PASS' : 'FAIL'}] Viewport ${vp.width}px (${vp.name}): ` +
          `scrollWidth=${metrics.docW}px, innerWidth=${metrics.winW}px, horizontalScroll=${metrics.hasHScroll}`
        );
        if (!pass) {
          console.error(`    WARNING: Overflow detected at ${vp.width}px!`);
        }
      }
      console.log('');
    }

    cdp.ws.close();
  } finally {
    try { chrome.kill(); } catch {}
    try { server.kill(); } catch {}
    await new Promise((r) => setTimeout(r, 500));
    try { fs.rmSync(userDataDir, { recursive: true, force: true }); } catch {}
  }
}

run().catch((err) => {
  console.error('Fatal error in test-responsive:', err);
  process.exit(1);
});
