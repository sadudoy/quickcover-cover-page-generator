import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'chrome-p7f-'));
const DEBUG_PORT = 9280;
const PORT = 5173;

console.log('=== PHASE 7F SMART CASCADE (PARTIAL TEXT MATCHING) VERIFICATION ===\n');

// 1. Verify cover.css SHA-256
const coverCssPath = path.resolve('client/css/cover.css');
const coverBytes = fs.readFileSync(coverCssPath);
const coverHash = crypto.createHash('sha256').update(coverBytes).digest('hex').toUpperCase();
const EXPECTED_HASH = '055132E855624DF5B83BD91D2E819BBAFAE34CEC0BF5E03064F6AA0D689320EE';

console.log(`[CHECK 1] cover.css SHA-256: ${coverHash}`);
if (coverHash !== EXPECTED_HASH) {
  console.error(`FAIL: cover.css hash mismatch! Expected ${EXPECTED_HASH}, got ${coverHash}`);
  process.exit(1);
}
console.log('  -> PASS: cover.css is byte-identical and frozen.\n');

// Start Dev Server
const server = spawn('node', ['scripts/dev-server.js'], {
  stdio: 'pipe',
  env: { ...process.env, PORT: String(PORT) }
});

await new Promise((r) => setTimeout(r, 1200));

// Start Chrome
const chrome = spawn(CHROME_PATH, [
  '--headless=new',
  `--remote-debugging-port=${DEBUG_PORT}`,
  `--user-data-dir=${userDataDir}`,
  '--no-first-run',
  '--no-default-browser-check',
  '--window-size=1280,1000'
]);

await new Promise((r) => setTimeout(r, 1500));

async function getWsUrl() {
  const res = await fetch(`http://127.0.0.1:${DEBUG_PORT}/json`);
  const tabs = await res.json();
  const pageTab = tabs.find((t) => t.type === 'page') || tabs[0];
  return pageTab.webSocketDebuggerUrl;
}

class CDPClient {
  constructor(ws) {
    this.ws = ws;
    this.id = 1;
    this.callbacks = new Map();
    ws.onmessage = (event) => {
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
    const id = this.id++;
    return new Promise((resolve, reject) => {
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

let cdp;
try {
  const wsUrl = await getWsUrl();
  const ws = new WebSocket(wsUrl);
  await new Promise((r) => ws.addEventListener('open', r, { once: true }));
  cdp = new CDPClient(ws);

  await cdp.send('Page.enable');
  await cdp.send('DOM.enable');

  // Step 1: Open /create.html
  console.log('[STEP 1] Navigating to /create.html...');
  await cdp.send('Page.navigate', { url: `http://localhost:${PORT}/create.html` });
  await new Promise((r) => setTimeout(r, 1500));

  // Step 2 & 3: Type "Computer" in Department & Select Level 1, Term I
  console.log('[STEP 2 & 3] Typing "Computer" into Department & setting Level 1, Term I...');
  const step2Result = await cdp.evaluate(`(() => {
    const dept = document.getElementById('department');
    dept.value = 'Computer';
    dept.dispatchEvent(new Event('input', { bubbles: true }));

    const lvl = document.getElementById('level');
    lvl.value = '1';
    lvl.dispatchEvent(new Event('change', { bubbles: true }));

    const term = document.getElementById('term');
    term.value = 'I';
    term.dispatchEvent(new Event('change', { bubbles: true }));

    const hint = document.getElementById('cascade-hint');
    const hintVisible = hint ? window.getComputedStyle(hint).display !== 'none' : false;
    const hintText = hint ? hint.textContent.trim() : '';

    const codesList = document.getElementById('course-codes-list');
    const options = Array.from(codesList ? codesList.options : []).map(o => o.value);

    return {
      deptVal: dept.value,
      levelVal: lvl.value,
      termVal: term.value,
      hintVisible,
      hintText,
      optionsCount: options.length,
      options
    };
  })()`);

  console.log('  Step 2 & 3 result:', step2Result);
  if (!step2Result.hintVisible) {
    throw new Error('Expected cascade hint to be visible for partial text "Computer" (CSE has no courses)');
  }
  if (step2Result.optionsCount !== 0) {
    throw new Error(`Expected 0 course options for CSE, got ${step2Result.optionsCount}`);
  }
  console.log('  -> PASS: Typing "Computer" partially matches CSE, shows hint, and options list is 0.\n');

  // Step 5 & 6: Change Department to "Electrical" (without fully clearing) & ensure Level 1, Term I
  console.log('[STEP 5 & 6] Changing Department text to "Electrical" via typing (input event)...');
  const step5Result = await cdp.evaluate(`(() => {
    const dept = document.getElementById('department');
    // Emulate typing "Electrical" directly
    dept.value = 'Electrical';
    dept.dispatchEvent(new Event('input', { bubbles: true }));

    const hint = document.getElementById('cascade-hint');
    const hintVisible = hint ? window.getComputedStyle(hint).display !== 'none' : false;

    const codesList = document.getElementById('course-codes-list');
    const options = Array.from(codesList ? codesList.options : []).map(o => o.value);

    return {
      deptVal: dept.value,
      hintVisible,
      optionsCount: options.length,
      options
    };
  })()`);

  console.log('  Step 5 & 6 result:', step5Result);
  if (step5Result.hintVisible) {
    throw new Error('Hint should be hidden when EEE courses exist for Level 1, Term I');
  }
  if (!step5Result.options.includes('EEE 1101') || !step5Result.options.includes('PHY 1111')) {
    throw new Error(`Expected EEE 1101 and PHY 1111 in options, got ${JSON.stringify(step5Result.options)}`);
  }
  console.log('  -> PASS: Changing Department to "Electrical" fuzzy-matches EEE and instantly populates EEE courses.\n');

  // Step 7: Test changing Level to 2 (while Term is I)
  console.log('[STEP 7] Changing Level to 2 (re-filtering test)...');
  const levelChangeResult = await cdp.evaluate(`(() => {
    const lvl = document.getElementById('level');
    lvl.value = '2';
    lvl.dispatchEvent(new Event('change', { bubbles: true }));

    const codesList = document.getElementById('course-codes-list');
    const options = Array.from(codesList ? codesList.options : []).map(o => o.value);

    return {
      levelVal: lvl.value,
      optionsCount: options.length,
      options
    };
  })()`);

  console.log('  Level 2 change result:', levelChangeResult);
  if (!levelChangeResult.options.includes('EEE 2105')) {
    throw new Error(`Expected EEE 2105 in Level 2 Term I courses, got ${JSON.stringify(levelChangeResult.options)}`);
  }
  console.log('  -> PASS: Changing Level to 2 instantly re-filtered to EEE Level 2 Term I courses.\n');

  console.log('=== ALL PHASE 7F VERIFICATION CHECKS PASSED ===');
} finally {
  try { if (cdp && cdp.ws) cdp.ws.close(); } catch {}
  try { chrome.kill(); } catch {}
  try { server.kill(); } catch {}
  try { fs.rmSync(userDataDir, { recursive: true, force: true }); } catch {}
}
