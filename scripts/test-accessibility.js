/**
 * test-accessibility.js — Automated Accessibility & Contrast Measurement Suite
 * Phase 7 Requirement D.5 / I.6
 */

import { spawn } from 'child_process';
import http from 'http';
import fs from 'fs';
import path from 'path';
import os from 'os';

const ROOT_DIR = process.cwd();
const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const PORT = 5173;
const DEBUG_PORT = 9248;

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

// Relative luminance formula per WCAG 2.1
function getLuminance(r, g, b) {
  const a = [r, g, b].map((v) => {
    v /= 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  });
  return a[0] * 0.2126 + a[1] * 0.7152 + a[2] * 0.0722;
}

function getContrastRatio(rgb1, rgb2) {
  const lum1 = getLuminance(rgb1[0], rgb1[1], rgb1[2]);
  const lum2 = getLuminance(rgb2[0], rgb2[1], rgb2[2]);
  const brightest = Math.max(lum1, lum2);
  const darkest = Math.min(lum1, lum2);
  return (brightest + 0.05) / (darkest + 0.05);
}

function parseHex(hex) {
  hex = hex.replace('#', '');
  if (hex.length === 3) {
    hex = hex.split('').map((c) => c + c).join('');
  }
  const num = parseInt(hex, 16);
  return [(num >> 16) & 255, (num >> 8) & 255, num & 255];
}

async function run() {
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'chrome-a11y-'));
  const server = spawn('node', ['scripts/dev-server.js'], { stdio: 'ignore' });
  const chrome = spawn(
    CHROME_PATH,
    [
      `--remote-debugging-port=${DEBUG_PORT}`,
      `--user-data-dir=${userDataDir}`,
      '--headless=new',
      'about:blank'
    ],
    { stdio: 'ignore' }
  );

  try {
    await waitForServer(`http://localhost:${PORT}/create.html`);
    await waitForServer(`http://127.0.0.1:${DEBUG_PORT}/json/version`);

    const tabsRes = await fetch(`http://127.0.0.1:${DEBUG_PORT}/json/list`);
    const tabs = await tabsRes.json();
    const ws = new WebSocket(tabs[0].webSocketDebuggerUrl);
    await new Promise((r) => (ws.onopen = r));
    const cdp = new CDPClient(ws);

    await cdp.send('Page.enable');
    await cdp.send('Runtime.enable');

    console.log('=== ACCESSIBILITY AUDIT REPORT (WCAG AA COMPLIANCE) ===\n');

    // 1. Contrast Measurements Table
    console.log('--- 1. WCAG AA Contrast Ratios (Tokens) ---');
    const colorPairs = [
      { name: 'Body text (--ink-900 on --surface)', fg: '#0f172a', bg: '#ffffff', min: 4.5 },
      { name: 'Secondary text (--ink-700 on --surface)', fg: '#334155', bg: '#ffffff', min: 4.5 },
      { name: 'Muted text / Hint (--ink-500 on --surface)', fg: '#64748b', bg: '#ffffff', min: 4.5 },
      { name: 'Primary button text (white on --accent)', fg: '#ffffff', bg: '#2563eb', min: 4.5 },
      { name: 'Dark button text (white on --ink-900)', fg: '#ffffff', bg: '#0f172a', min: 4.5 },
      { name: 'Focus ring contrast (--accent on --surface)', fg: '#2563eb', bg: '#ffffff', min: 3.0 }
    ];

    console.log('Pair | Foreground | Background | Ratio | Requirement | Result');
    console.log('-----|------------|------------|-------|-------------|-------');
    for (const pair of colorPairs) {
      const ratio = getContrastRatio(parseHex(pair.fg), parseHex(pair.bg));
      const passed = ratio >= pair.min;
      console.log(
        `${pair.name} | ${pair.fg} | ${pair.bg} | ${ratio.toFixed(2)}:1 | >= ${pair.min}:1 | ${passed ? 'PASS' : 'FAIL'}`
      );
    }

    // 2. Landmarks & Skip Link check
    console.log('\n--- 2. Landmarks and Skip Links ---');
    for (const url of ['/index.html', '/create.html']) {
      await cdp.send('Page.navigate', { url: `http://localhost:${PORT}${url}` });
      await new Promise((r) => setTimeout(r, 600));

      const audit = await cdp.eval(`(() => {
        const header = document.querySelectorAll('header').length;
        const main = document.querySelectorAll('main').length;
        const footer = document.querySelectorAll('footer').length;
        const nav = document.querySelectorAll('nav').length;
        const navAria = Array.from(document.querySelectorAll('nav')).every(n => n.hasAttribute('aria-label'));
        const skipLink = !!document.querySelector('a.skip-link[href="#main"]');
        const h1Count = document.querySelectorAll('h1').length;
        return { header, main, footer, nav, navAria, skipLink, h1Count };
      })()`);

      console.log(`Page: ${url}`);
      console.log(`  <header>: ${audit.header} (expected: 1)`);
      console.log(`  <main>: ${audit.main} (expected: 1)`);
      console.log(`  <footer>: ${audit.footer} (expected: 1)`);
      console.log(`  <nav> with aria-label: ${audit.nav} navs, all labeled=${audit.navAria}`);
      console.log(`  Skip link present: ${audit.skipLink}`);
    }

    // 3. Form Labels Association Audit (create.html)
    console.log('\n--- 3. Form Controls & Labels Association (create.html) ---');
    await cdp.send('Page.navigate', { url: `http://localhost:${PORT}/create.html` });
    await new Promise((r) => setTimeout(r, 800));

    const formAudit = await cdp.eval(`(() => {
      const inputs = Array.from(document.querySelectorAll('input, select, textarea'));
      const missing = [];
      inputs.forEach(inp => {
        if (inp.type === 'hidden') return;
        // Check either parent label, label[for=id], aria-label, aria-labelledby
        let hasLabel = false;
        if (inp.closest('label')) hasLabel = true;
        if (inp.id && document.querySelector('label[for=\"' + inp.id + '\"]')) hasLabel = true;
        if (inp.hasAttribute('aria-label') || inp.hasAttribute('aria-labelledby')) hasLabel = true;
        if (!hasLabel) {
          missing.push({ id: inp.id, name: inp.name, tag: inp.tagName, type: inp.type });
        }
      });

      const fieldsets = Array.from(document.querySelectorAll('fieldset'));
      const fieldsetsWithLegend = fieldsets.filter(f => f.querySelector('legend')).length;

      return {
        totalControls: inputs.length,
        missingCount: missing.length,
        missing,
        totalFieldsets: fieldsets.length,
        fieldsetsWithLegend
      };
    })()`);

    console.log(`Total interactive form controls: ${formAudit.totalControls}`);
    console.log(`Controls with associated label: ${formAudit.totalControls - formAudit.missingCount}/${formAudit.totalControls}`);
    console.log(`Fieldsets with <legend>: ${formAudit.fieldsetsWithLegend}/${formAudit.totalFieldsets}`);
    if (formAudit.missingCount > 0) {
      console.error('Controls missing labels:', formAudit.missing);
    }

    // 4. Keyboard Tab Navigation Check
    console.log('\n--- 4. Keyboard Tab Navigation Pass ---');
    const tabPass = await cdp.eval(`(() => {
      const focusable = Array.from(document.querySelectorAll(
        'a[href], button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])'
      ));
      return { count: focusable.length, first3: focusable.slice(0, 3).map(e => e.tagName + (e.id ? '#' + e.id : '')) };
    })()`);
    console.log(`Keyboard focusable elements: ${tabPass.count}`);
    console.log(`Tab sequence starts with: ${tabPass.first3.join(' -> ')}`);

    cdp.ws.close();
  } finally {
    chrome.kill();
    server.kill();
    try { fs.rmSync(userDataDir, { recursive: true, force: true }); } catch {}
  }
}

run().catch((err) => {
  console.error('Fatal error in test-accessibility:', err);
  process.exit(1);
});
