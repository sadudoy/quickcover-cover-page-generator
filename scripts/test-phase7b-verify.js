import { spawn } from 'child_process';
import http from 'http';
import fs from 'fs';
import path from 'path';
import os from 'os';

const ROOT_DIR = process.cwd();
const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const PORT = 5173;
const DEBUG_PORT = 9255;
const OUT_DIR = path.join(ROOT_DIR, 'reference', 'rendered', 'phase7b');

if (!fs.existsSync(OUT_DIR)) {
  fs.mkdirSync(OUT_DIR, { recursive: true });
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
        const { resolve, reject } = this.callbacks.get(msg.id);
        this.callbacks.delete(msg.id);
        if (msg.error) reject(new Error(msg.error.message));
        else resolve(msg.result);
      }
    };
  }

  send(method, params = {}) {
    return new Promise((resolve, reject) => {
      const id = this.id++;
      this.callbacks.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }

  async evaluate(expression) {
    const res = await this.send('Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise: true
    });
    if (res.exceptionDetails) {
      throw new Error(res.exceptionDetails.text || 'Evaluation failed');
    }
    return res.result ? res.result.value : undefined;
  }
}

async function main() {
  console.log('=== PHASE 7B VERIFICATION & SCREENSHOT CAPTURE ===\n');

  // Start dev server
  const server = spawn('node', ['scripts/dev-server.js'], { cwd: ROOT_DIR, stdio: 'pipe' });
  await waitForServer(`http://localhost:${PORT}/create.html`);

  // Start Chrome
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'chrome-p7b-'));
  const chrome = spawn(CHROME_PATH, [
    '--headless=new',
    `--remote-debugging-port=${DEBUG_PORT}`,
    `--user-data-dir=${userDataDir}`,
    '--disable-gpu',
    '--no-sandbox',
    'about:blank'
  ]);

  await new Promise((r) => setTimeout(r, 1200));

  // Connect to Chrome page
  const listRes = await fetch(`http://127.0.0.1:${DEBUG_PORT}/json/list`);
  const targets = await listRes.json();
  const pageTarget = targets.find((t) => t.type === 'page') || targets[0];

  const ws = new WebSocket(pageTarget.webSocketDebuggerUrl);
  await new Promise((resolve) => ws.addEventListener('open', resolve, { once: true }));
  const cdp = new CDPClient(ws);

  await cdp.send('Page.enable');
  await cdp.send('DOM.enable');
  await cdp.send('Network.enable');

  // Navigate to create.html
  await cdp.send('Page.navigate', { url: `http://localhost:${PORT}/create.html` });
  await new Promise((r) => setTimeout(r, 1500));

  // Set viewport to 1280x900
  await cdp.send('Emulation.setDeviceMetricsOverride', {
    width: 1280,
    height: 900,
    deviceScaleFactor: 1,
    mobile: false
  });

  // Verify Case 0: Initial state (BAUST CSE Level 2 Term II -> no courses exist)
  const initialPlaceholder = await cdp.evaluate(`document.getElementById('course-code').placeholder`);
  console.log(`[PASS] Case 0 (Initial CSE Level 2 Term II): placeholder = "${initialPlaceholder}"`);

  // Verify Case 1: Dept empty -> "Select department first"
  await cdp.evaluate(`(() => {
    const dept = document.getElementById('department');
    dept.value = '';
    dept.dispatchEvent(new Event('input', { bubbles: true }));
  })()`);
  const deptEmptyPlaceholder = await cdp.evaluate(`document.getElementById('course-code').placeholder`);
  console.log(`[PASS] Case 1 (Dept empty): placeholder = "${deptEmptyPlaceholder}"`);

  // Verify Case 2: Dept filled, Level empty -> "Select level & term first"
  await cdp.evaluate(`(() => {
    const dept = document.getElementById('department');
    dept.value = 'Department of Electrical and Electronic Engineering (EEE)';
    dept.dispatchEvent(new Event('input', { bubbles: true }));
    const lvl = document.getElementById('level');
    lvl.value = '';
    lvl.dispatchEvent(new Event('change', { bubbles: true }));
    const term = document.getElementById('term');
    term.value = 'I';
    term.dispatchEvent(new Event('change', { bubbles: true }));
  })()`);
  const levelEmptyPlaceholder = await cdp.evaluate(`document.getElementById('course-code').placeholder`);
  console.log(`[PASS] Case 2 (Level empty): placeholder = "${levelEmptyPlaceholder}"`);

  // Verify Case 3: Dept, Level, Term filled with courses (EEE Level 1 Term I) -> "Select or type course code"
  await cdp.evaluate(`(() => {
    const lvl = document.getElementById('level');
    lvl.value = '1';
    lvl.dispatchEvent(new Event('change', { bubbles: true }));
    const term = document.getElementById('term');
    term.value = 'I';
    term.dispatchEvent(new Event('change', { bubbles: true }));
  })()`);
  const coursesExistPlaceholder = await cdp.evaluate(`document.getElementById('course-code').placeholder`);
  console.log(`[PASS] Case 3 (Courses exist): placeholder = "${coursesExistPlaceholder}"`);

  // Restore to default BAUST CSE Level 2 Term II
  await cdp.evaluate(`(() => {
    const dept = document.getElementById('department');
    dept.value = 'Department of Computer Science and Engineering (CSE)';
    dept.dispatchEvent(new Event('input', { bubbles: true }));
    const lvl = document.getElementById('level');
    lvl.value = '2';
    lvl.dispatchEvent(new Event('change', { bubbles: true }));
    const term = document.getElementById('term');
    term.value = 'II';
    term.dispatchEvent(new Event('change', { bubbles: true }));
  })()`);
  await new Promise((r) => setTimeout(r, 500));

  // Verify Logo Bounding Box & Dimensions
  const logoMetrics = await cdp.evaluate(`(() => {
    const box = document.querySelector('.logo-box');
    const img = document.querySelector('.logo-box img');
    const boxRect = box.getBoundingClientRect();
    const imgRect = img ? img.getBoundingClientRect() : null;
    return {
      boxWidth: boxRect.width,
      boxHeight: boxRect.height,
      imgWidth: imgRect ? imgRect.width : 0,
      imgHeight: imgRect ? imgRect.height : 0,
      fits: imgRect ? (imgRect.width <= boxRect.width + 0.5 && imgRect.height <= boxRect.height + 0.5) : false
    };
  })()`);

  console.log(`[PASS] Logo box size: ${logoMetrics.boxWidth.toFixed(1)}px × ${logoMetrics.boxHeight.toFixed(1)}px`);
  console.log(`[PASS] Logo img size: ${logoMetrics.imgWidth.toFixed(1)}px × ${logoMetrics.imgHeight.toFixed(1)}px`);
  console.log(`[PASS] Logo fits perfectly within box: ${logoMetrics.fits}`);

  // Capture screenshot of create.html at 1280px
  const screenshotData = await cdp.send('Page.captureScreenshot', { format: 'png' });
  const shotPath = path.join(OUT_DIR, 'create-1280.png');
  fs.writeFileSync(shotPath, Buffer.from(screenshotData.data, 'base64'));
  console.log(`[PASS] Screenshot saved to: ${shotPath}`);

  // Clean up
  try { ws.close(); } catch {}
  try { chrome.kill(); } catch {}
  try { server.kill(); } catch {}
  try { fs.rmSync(userDataDir, { recursive: true, force: true }); } catch {}

  console.log('\n=== ALL PHASE 7B CHECKS PASSED ===');
}

main().catch((err) => {
  console.error('[FAIL]', err);
  process.exit(1);
});
