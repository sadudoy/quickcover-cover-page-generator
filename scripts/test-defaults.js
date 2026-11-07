/**
 * test-defaults.js — Automated CDP verification of Form Defaults and Cascade Hint behavior
 * Phase 7 Requirement D.4 / I.4
 */

import { spawn } from 'child_process';
import http from 'http';
import fs from 'fs';
import path from 'path';
import os from 'os';

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const PORT = 5173;
const DEBUG_PORT = 9235;

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
  constructor(wsUrl) {
    this.wsUrl = wsUrl;
    this.ws = null;
    this.id = 1;
    this.callbacks = new Map();
  }

  async connect() {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(this.wsUrl);
      this.ws.onopen = resolve;
      this.ws.onerror = reject;
      this.ws.onmessage = (event) => {
        const msg = JSON.parse(event.data);
        if (msg.id && this.callbacks.has(msg.id)) {
          const cb = this.callbacks.get(msg.id);
          this.callbacks.delete(msg.id);
          if (msg.error) cb.reject(new Error(msg.error.message));
          else cb.resolve(msg.result);
        }
      };
    });
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

async function run() {
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'chrome-defaults-test-'));

  const server = spawn('node', ['scripts/dev-server.js'], {
    stdio: 'ignore'
  });

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

  let passes = 0;
  let fails = 0;

  function report(name, passed, details = '') {
    if (passed) {
      console.log(`[PASS] ${name}`);
      passes++;
    } else {
      console.error(`[FAIL] ${name} ${details ? `(${details})` : ''}`);
      fails++;
    }
  }

  try {
    await waitForServer(`http://localhost:${PORT}/create.html`);
    await waitForServer(`http://127.0.0.1:${DEBUG_PORT}/json/version`);

    const versionRes = await fetch(`http://127.0.0.1:${DEBUG_PORT}/json/list`);
    const tabs = await versionRes.json();
    const tab = tabs[0];

    const cdp = new CDPClient(tab.webSocketDebuggerUrl);
    await cdp.connect();
    await cdp.send('Page.enable');
    await cdp.send('Runtime.enable');

    // Handle confirm dialogs
    cdp.send('Page.setInterceptFileChooserDialog', { enabled: false });

    // Step 1: Fresh load with storage cleared -> defaults applied
    await cdp.send('Page.navigate', { url: `http://localhost:${PORT}/create.html` });
    await new Promise((r) => setTimeout(r, 1000));

    // Clear any storage and reload fresh
    await cdp.eval(`(() => { localStorage.clear(); })()`);
    await cdp.send('Page.reload');
    await new Promise((r) => setTimeout(r, 1200));

    const step1 = await cdp.eval(`(() => {
      const u = document.getElementById('university').value;
      const d = document.getElementById('department').value;
      const l = document.getElementById('level').value;
      const t = document.getElementById('term').value;
      const logoImg = document.querySelector('.logo-box img.logo-img');
      const logoSrc = logoImg ? logoImg.getAttribute('src') : '';
      const status = document.getElementById('storage-status').textContent;
      const previewU = document.querySelector('[data-field="university-name"]').textContent;
      return { u, d, l, t, logoSrc, status, previewU };
    })()`);

    report(
      'Step 1: Fresh load applies defaults (BAUST, CSE, Level 2, Term II, default logo, empty status)',
      step1.u.includes('BAUST') &&
        step1.d.includes('CSE') &&
        step1.l === '2' &&
        step1.t === 'II' &&
        step1.logoSrc.includes('default-logo.png') &&
        step1.status === '' &&
        step1.previewU.includes('BAUST'),
      JSON.stringify(step1)
    );

    // Step 2: Cascade: CSE default produces empty datalist + hint visible
    const step2 = await cdp.eval(`(() => {
      const hint = document.getElementById('cascade-hint');
      const hintDisplay = hint ? window.getComputedStyle(hint).display : '';
      const courseOptions = document.querySelectorAll('#course-codes-list option').length;
      return { hintDisplay, courseOptions };
    })()`);

    report(
      'Step 2: Cascade for CSE produces empty course list and displays cascade hint',
      step2.courseOptions === 0 && step2.hintDisplay === 'block',
      JSON.stringify(step2)
    );

    // Step 3: Cascade: changing department to EEE (with Level 2, Term I) -> courses populate, hint hidden
    const step3 = await cdp.eval(`(() => {
      const deptInput = document.getElementById('department');
      deptInput.value = 'Department of Electrical and Electronic Engineering (EEE)';
      deptInput.dispatchEvent(new Event('input', { bubbles: true }));

      const termSelect = document.getElementById('term');
      termSelect.value = 'I';
      termSelect.dispatchEvent(new Event('change', { bubbles: true }));

      const hint = document.getElementById('cascade-hint');
      const hintDisplay = hint ? window.getComputedStyle(hint).display : '';
      const courseOptions = document.querySelectorAll('#course-codes-list option').length;
      return { hintDisplay, courseOptions };
    })()`);

    report(
      'Step 3: Changing department to EEE populates courses and hides cascade hint',
      step3.courseOptions > 0 && step3.hintDisplay === 'none',
      JSON.stringify(step3)
    );

    // Step 4: Existing draft -> defaults skipped, draft values used
    await cdp.eval(`(() => {
      const draft = {
        draftVersion: 2,
        university: 'Draft University of Engineering',
        department: 'Department of Electrical and Electronic Engineering (EEE)',
        level: '3',
        term: 'I'
      };
      localStorage.setItem('covercraft-draft-v1', JSON.stringify(draft));
    })()`);

    await cdp.send('Page.reload');
    await new Promise((r) => setTimeout(r, 1200));

    const step4 = await cdp.eval(`(() => {
      const u = document.getElementById('university').value;
      const d = document.getElementById('department').value;
      const l = document.getElementById('level').value;
      const t = document.getElementById('term').value;
      const status = document.getElementById('storage-status').textContent;
      return { u, d, l, t, status };
    })()`);

    report(
      'Step 4: Existing draft overrides defaults on load',
      step4.u === 'Draft University of Engineering' &&
        step4.l === '3' &&
        step4.t === 'I' &&
        step4.status.includes('Draft restored'),
      JSON.stringify(step4)
    );

    // Step 5: Draft with explicit empty university -> not re-populated
    await cdp.eval(`(() => {
      const draft = {
        draftVersion: 2,
        university: '',
        department: '',
        level: '',
        term: ''
      };
      localStorage.setItem('covercraft-draft-v1', JSON.stringify(draft));
    })()`);

    await cdp.send('Page.reload');
    await new Promise((r) => setTimeout(r, 1200));

    const step5 = await cdp.eval(`(() => {
      const u = document.getElementById('university').value;
      const d = document.getElementById('department').value;
      return { u, d };
    })()`);

    report(
      'Step 5: Draft with explicit empty values preserves empty fields (defaults not re-applied)',
      step5.u === '' && step5.d === '',
      JSON.stringify(step5)
    );

    // Step 6: "Start over" -> defaults restored
    await cdp.eval(`(() => {
      window.confirm = () => true;
      document.getElementById('clear-form').click();
    })()`);
    await new Promise((r) => setTimeout(r, 400));

    const step6 = await cdp.eval(`(() => {
      const u = document.getElementById('university').value;
      const d = document.getElementById('department').value;
      const l = document.getElementById('level').value;
      const t = document.getElementById('term').value;
      const logoImg = document.querySelector('.logo-box img.logo-img');
      const logoSrc = logoImg ? logoImg.getAttribute('src') : '';
      const status = document.getElementById('storage-status').textContent;
      return { u, d, l, t, logoSrc, status };
    })()`);

    report(
      'Step 6: "Start over" resets to defaults (BAUST, CSE, Level 2, Term II, default logo, status "Reset to defaults.")',
      step6.u.includes('BAUST') &&
        step6.d.includes('CSE') &&
        step6.l === '2' &&
        step6.t === 'II' &&
        step6.logoSrc.includes('default-logo.png') &&
        step6.status === 'Reset to defaults.',
      JSON.stringify(step6)
    );

    cdp.ws.close();
  } finally {
    try {
      chrome.kill();
    } catch {}
    try {
      server.kill();
    } catch {}
    await new Promise((r) => setTimeout(r, 500));
    try {
      fs.rmSync(userDataDir, { recursive: true, force: true });
    } catch {}
  }

  console.log(`\n=== TEST DEFAULTS SUMMARY: ${passes} PASSED, ${fails} FAILED ===\n`);
  if (fails > 0) process.exit(1);
}

run().catch((err) => {
  console.error('Fatal error in test-defaults:', err);
  process.exit(1);
});
