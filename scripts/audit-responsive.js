import { spawn } from 'child_process';
import http from 'http';
import fs from 'fs';
import path from 'path';
import os from 'os';

const ROOT_DIR = process.cwd();
const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const PORT = 5173;
const DEBUG_PORT = 9251;
const AUDIT_DIR = path.join(ROOT_DIR, 'reference', 'rendered', 'audit');

if (!fs.existsSync(AUDIT_DIR)) {
  fs.mkdirSync(AUDIT_DIR, { recursive: true });
}

async function waitForServer(url, timeoutMs = 8000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      await new Promise((resolve, reject) => {
        const req = http.get(url, (res) => (res.statusCode === 200 ? resolve() : reject()));
        req.on('error', reject);
        req.setTimeout(500, () => req.destroy());
      });
      return;
    } catch {
      await new Promise((r) => setTimeout(r, 200));
    }
  }
  throw new Error(`Server at ${url} not ready`);
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

async function main() {
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'chrome-audit-'));
  const devServer = spawn('node', ['scripts/dev-server.js'], { stdio: 'ignore' });
  await waitForServer(`http://localhost:${PORT}/create.html`);

  const chromeProc = spawn(CHROME_PATH, [
    `--remote-debugging-port=${DEBUG_PORT}`,
    `--user-data-dir=${userDataDir}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--headless=new',
    '--disable-gpu',
    'about:blank'
  ], { stdio: 'ignore' });

  try {
    await waitForServer(`http://127.0.0.1:${DEBUG_PORT}/json/version`);
    const tabsRes = await fetch(`http://127.0.0.1:${DEBUG_PORT}/json/list`);
    const tabs = await tabsRes.json();
    const ws = new WebSocket(tabs[0].webSocketDebuggerUrl);
    await new Promise((r) => (ws.onopen = r));
    const cdp = new CDPClient(ws);

    await cdp.send('Page.enable');
    await cdp.send('Runtime.enable');

    const viewports = [
      { width: 360, height: 740, label: '360' },
      { width: 768, height: 1024, label: '768' },
      { width: 1280, height: 900, label: '1280' },
      { width: 1920, height: 1080, label: '1920' }
    ];

    const pages = [
      { name: 'landing', url: `http://localhost:${PORT}/` },
      { name: 'create', url: `http://localhost:${PORT}/create.html` }
    ];

    console.log('=== RUNNING RESPONSIVE VIEWPORT AUDIT & SCREENSHOT CAPTURE ===\n');

    for (const page of pages) {
      console.log(`--- Page: ${page.name} (${page.url}) ---`);
      for (const vp of viewports) {
        await cdp.send('Emulation.setDeviceMetricsOverride', {
          width: vp.width,
          height: vp.height,
          deviceScaleFactor: 1,
          mobile: vp.width <= 768
        });

        await cdp.send('Page.navigate', { url: page.url });
        await new Promise((r) => setTimeout(r, 600));

        const metrics = await cdp.eval(`(() => {
          const doc = document.documentElement;
          const body = document.body;
          const scrollWidth = Math.max(doc.scrollWidth, body.scrollWidth);
          const innerWidth = window.innerWidth;
          const hasHScroll = scrollWidth > innerWidth;

          const printBtn = document.getElementById('print-cover');
          const clearBtn = document.getElementById('clear-form');
          const logoUpload = document.getElementById('logo-upload');

          const isVisible = (el) => {
            if (!el) return false;
            const r = el.getBoundingClientRect();
            return r.width > 0 && r.height > 0 && window.getComputedStyle(el).display !== 'none';
          };

          return {
            innerWidth,
            scrollWidth,
            hasHScroll,
            printBtnReachable: isVisible(printBtn),
            clearBtnReachable: isVisible(clearBtn),
            logoUploadReachable: isVisible(logoUpload)
          };
        })()`);

        const screenshotRes = await cdp.send('Page.captureScreenshot', { format: 'png' });
        const screenshotPath = path.join(AUDIT_DIR, `${page.name}-${vp.label}.png`);
        fs.writeFileSync(screenshotPath, Buffer.from(screenshotRes.data, 'base64'));

        console.log(`[VIEWPORT ${vp.label}px] scrollWidth=${metrics.scrollWidth}px, innerWidth=${metrics.innerWidth}px, hasHScroll=${metrics.hasHScroll}`);
        if (page.name === 'create') {
          console.log(`   printBtn=${metrics.printBtnReachable}, clearBtn=${metrics.clearBtnReachable}, logoUpload=${metrics.logoUploadReachable}`);
        }
        console.log(`   Captured: reference/rendered/audit/${page.name}-${vp.label}.png\n`);
      }
    }

    // Capture Cover print renders at 1280px (C.6)
    console.log('--- Capturing Cover Print Renders for C.6 ---');
    await cdp.send('Emulation.setDeviceMetricsOverride', {
      width: 1280,
      height: 900,
      deviceScaleFactor: 1,
      mobile: false
    });

    // 1. Lab Report Print
    await cdp.send('Page.navigate', { url: `http://localhost:${PORT}/create.html` });
    await new Promise((r) => setTimeout(r, 600));

    // Ensure lab report is selected
    await cdp.eval(`(() => {
      const radio = document.getElementById('doc-type-lab');
      if (radio && !radio.checked) {
        radio.checked = true;
        radio.dispatchEvent(new Event('change', { bubbles: true }));
      }
    })()`);
    await new Promise((r) => setTimeout(r, 400));

    const labPdf = await cdp.send('Page.printToPDF', {
      printBackground: true,
      preferCSSPageSize: true,
      marginTop: 0,
      marginBottom: 0,
      marginLeft: 0,
      marginRight: 0
    });
    const labPdfPath = path.join(AUDIT_DIR, 'cover-print-lab.pdf');
    fs.writeFileSync(labPdfPath, Buffer.from(labPdf.data, 'base64'));
    console.log('   Saved: reference/rendered/audit/cover-print-lab.pdf');

    // 2. Assignment Print
    await cdp.eval(`(() => {
      const radio = document.getElementById('doc-type-assignment');
      if (radio) {
        radio.checked = true;
        radio.dispatchEvent(new Event('change', { bubbles: true }));
      }
    })()`);
    await new Promise((r) => setTimeout(r, 400));

    const assignPdf = await cdp.send('Page.printToPDF', {
      printBackground: true,
      preferCSSPageSize: true,
      marginTop: 0,
      marginBottom: 0,
      marginLeft: 0,
      marginRight: 0
    });
    const assignPdfPath = path.join(AUDIT_DIR, 'cover-print-assignment.pdf');
    fs.writeFileSync(assignPdfPath, Buffer.from(assignPdf.data, 'base64'));
    console.log('   Saved: reference/rendered/audit/cover-print-assignment.pdf');

  } finally {
    try { chromeProc.kill(); } catch {}
    try { devServer.kill(); } catch {}
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
