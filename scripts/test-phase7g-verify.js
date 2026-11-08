import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'chrome-p7g-'));
const DEBUG_PORT = 9290;
const PORT = 5173;

console.log('=== PHASE 7G DATALIST UX (CLEAR ON CLICK / SELECT ON FOCUS) VERIFICATION ===\n');

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

  // Step 2: Set Department to EEE
  console.log('[STEP 2] Setting Department to EEE...');
  await cdp.evaluate(`(() => {
    const dept = document.getElementById('department');
    dept.value = 'Department of Electrical and Electronic Engineering (EEE)';
    dept.dispatchEvent(new Event('input', { bubbles: true }));
    dept.dispatchEvent(new Event('change', { bubbles: true }));
  })()`);

  // Step 3: Test Focus -> Text selected
  console.log('[STEP 3] Testing Focus on Department field (select() auto-highlight)...');
  const focusCheck = await cdp.evaluate(`(() => {
    const dept = document.getElementById('department');
    dept.dispatchEvent(new FocusEvent('focus', { bubbles: false }));
    return {
      value: dept.value,
      selectedText: dept.value.substring(dept.selectionStart, dept.selectionEnd),
      isFullySelected: dept.selectionStart === 0 && dept.selectionEnd === dept.value.length
    };
  })()`);
  console.log('  Focus selection result:', focusCheck);
  if (!focusCheck.isFullySelected) {
    throw new Error('Expected full text to be selected on focus');
  }
  console.log('  -> PASS: Text is fully highlighted/selected on focus.\n');

  // Step 4: Click on Department field -> clears to show all options
  console.log('[STEP 4] Testing Click on Department field (clear on click for full list)...');
  const clickCheck = await cdp.evaluate(`(() => {
    const dept = document.getElementById('department');
    dept.click();
    const deptList = document.getElementById('departments-list');
    const allDeptOptions = Array.from(deptList ? deptList.options : []).map(o => o.value);
    return {
      valueAfterClick: dept.value,
      previousValue: dept.dataset.previousValue,
      allDeptOptionsCount: allDeptOptions.length,
      hasCSE: allDeptOptions.some(d => d.includes('CSE')),
      hasBBA: allDeptOptions.some(d => d.includes('BBA')),
      hasEEE: allDeptOptions.some(d => d.includes('EEE'))
    };
  })()`);
  console.log('  Click result:', clickCheck);
  if (clickCheck.valueAfterClick !== '') {
    throw new Error(`Expected value to be cleared on click, got: "${clickCheck.valueAfterClick}"`);
  }
  if (!clickCheck.hasCSE || !clickCheck.hasBBA || !clickCheck.hasEEE) {
    throw new Error('Datalist options missing expected departments');
  }
  console.log('  -> PASS: Department value clears on click so all options (CSE, BBA, EEE, etc.) are visible.\n');

  // Step 4b: Test blur restores value if not modified
  console.log('[STEP 4b] Testing Blur restores previous value when untouched...');
  const blurCheck = await cdp.evaluate(`(() => {
    const dept = document.getElementById('department');
    dept.dispatchEvent(new FocusEvent('blur', { bubbles: false }));
    return {
      valueAfterBlur: dept.value,
      preview: document.querySelector('[data-field="department-name"]').textContent.trim()
    };
  })()`);
  console.log('  Blur result:', blurCheck);
  if (!blurCheck.valueAfterBlur.includes('EEE')) {
    throw new Error('Expected previous value to be restored on blur');
  }
  console.log('  -> PASS: Untouched field restores previous value on blur.\n');

  // Step 5: Test the same for Course Code field
  console.log('[STEP 5] Testing Course Code field (focus, click, datalist)...');
  // First set Level 1, Term I so courses are populated
  await cdp.evaluate(`(() => {
    const lvl = document.getElementById('level');
    lvl.value = '1';
    lvl.dispatchEvent(new Event('change', { bubbles: true }));

    const term = document.getElementById('term');
    term.value = 'I';
    term.dispatchEvent(new Event('change', { bubbles: true }));

    const code = document.getElementById('course-code');
    code.value = 'EEE 1101';
    code.dispatchEvent(new Event('input', { bubbles: true }));
    code.dispatchEvent(new Event('change', { bubbles: true }));
  })()`);

  const codeCheck = await cdp.evaluate(`(() => {
    const code = document.getElementById('course-code');
    code.dispatchEvent(new FocusEvent('focus', { bubbles: false }));
    const focusSelected = (code.selectionStart === 0 && code.selectionEnd === code.value.length);

    code.click();
    const valAfterClick = code.value;
    const prevVal = code.dataset.previousValue;

    const list = document.getElementById('course-codes-list');
    const options = Array.from(list ? list.options : []).map(o => o.value);

    // blur to restore
    code.dispatchEvent(new FocusEvent('blur', { bubbles: false }));
    const valAfterBlur = code.value;

    return {
      focusSelected,
      valAfterClick,
      prevVal,
      optionsCount: options.length,
      hasEEE1101: options.includes('EEE 1101'),
      hasPHY1111: options.includes('PHY 1111'),
      valAfterBlur
    };
  })()`);

  console.log('  Course Code check result:', codeCheck);
  if (!codeCheck.focusSelected) {
    throw new Error('Expected course code text to be selected on focus');
  }
  if (codeCheck.valAfterClick !== '') {
    throw new Error('Expected course code to clear on click');
  }
  if (codeCheck.optionsCount === 0 || !codeCheck.hasPHY1111) {
    throw new Error('Expected all Level 1 Term I courses to be available in datalist');
  }
  if (codeCheck.valAfterBlur !== 'EEE 1101') {
    throw new Error(`Expected course code to restore on blur, got "${codeCheck.valAfterBlur}"`);
  }
  console.log('  -> PASS: Course Code highlights on focus, clears on click for full list, and restores on blur.\n');

  console.log('=== ALL PHASE 7G VERIFICATION CHECKS PASSED ===');
} finally {
  try { if (cdp && cdp.ws) cdp.ws.close(); } catch {}
  try { chrome.kill(); } catch {}
  try { server.kill(); } catch {}
  try { fs.rmSync(userDataDir, { recursive: true, force: true }); } catch {}
}
