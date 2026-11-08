import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'chrome-p7d-'));
const DEBUG_PORT = 9270;
const PORT = 5173;

console.log('=== PHASE 7D TESTING & VERIFICATION ===\n');

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

  // --- STEP 1 & 6: OPEN /create.html & CONFIRM DEFAULT STATE ---
  console.log('[STEP 1 & 6] Checking fresh visit default state (CSE, Level 2, Term II)...');
  await cdp.send('Page.navigate', { url: `http://localhost:${PORT}/create.html` });
  await new Promise((r) => setTimeout(r, 1500));

  const defaultState = await cdp.evaluate(`(() => {
    const dept = document.getElementById('department').value;
    const lvl = document.getElementById('level').value;
    const term = document.getElementById('term').value;
    const hint = document.getElementById('cascade-hint');
    const hintVisible = hint ? window.getComputedStyle(hint).display !== 'none' : false;
    const hintText = hint ? hint.textContent.trim() : '';
    const codePlaceholder = document.getElementById('course-code').placeholder;
    const codesDatalist = document.getElementById('course-codes-list');

    // Test typing manually still works in default state
    const codeInput = document.getElementById('course-code');
    codeInput.value = 'CSE 2200';
    codeInput.dispatchEvent(new Event('input', { bubbles: true }));
    const previewCode = document.querySelector('[data-field="course-code"]').textContent.trim();

    // Reset code input
    codeInput.value = '';
    codeInput.dispatchEvent(new Event('input', { bubbles: true }));

    return {
      dept,
      lvl,
      term,
      hintVisible,
      hintText,
      codePlaceholder,
      codesCount: codesDatalist ? codesDatalist.options.length : 0,
      previewCode
    };
  })()`);

  console.log('  Default state:', defaultState);
  if (defaultState.dept !== '') {
    throw new Error('Default department should be empty');
  }
  if (defaultState.previewCode !== 'CSE 2200') {
    throw new Error('Typing course code manually in default state failed');
  }
  console.log('  -> PASS: Default state has empty department and manual typing works.\n');

  // --- STEP 2 & 3: SELECT LEVEL 1, TERM I (LEAVE DEPARTMENT EMPTY) & VERIFY DROPDOWN ---
  console.log('[STEP 2 & 3A] Select Level 1, Term I with Department empty...');
  const emptyDeptCascade = await cdp.evaluate(`(() => {
    const dept = document.getElementById('department');
    dept.value = '';
    dept.dispatchEvent(new Event('input', { bubbles: true }));
    dept.dispatchEvent(new Event('change', { bubbles: true }));

    const lvl = document.getElementById('level');
    lvl.value = '1';
    lvl.dispatchEvent(new Event('change', { bubbles: true }));

    const term = document.getElementById('term');
    term.value = 'I';
    term.dispatchEvent(new Event('change', { bubbles: true }));

    const codesList = document.getElementById('course-codes-list');
    const options = Array.from(codesList ? codesList.options : []).map(o => o.value);
    const codeInput = document.getElementById('course-code');

    return {
      optionsCount: options.length,
      hasEEE1101: options.includes('EEE 1101'),
      hasPHY1111: options.includes('PHY 1111'),
      hasIPE1101: options.includes('IPE 1101'),
      hasBBA1101: options.includes('BBA 1101'),
      placeholder: codeInput ? codeInput.placeholder : ''
    };
  })()`);

  console.log('  Empty dept cascade result:', emptyDeptCascade);
  if (emptyDeptCascade.optionsCount === 0 || !emptyDeptCascade.hasEEE1101 || !emptyDeptCascade.hasPHY1111) {
    throw new Error('Empty department + Level 1 Term I did not populate course code datalist correctly');
  }
  console.log('  -> PASS: Course code datalist populated with Level 1 Term I courses across departments.\n');

  // --- STEP 2 & 3B: SELECT DEPARTMENT EEE, LEVEL 1, TERM I ---
  console.log('[STEP 2 & 3B] Select Department EEE, Level 1, Term I...');
  const eeeDeptCascade = await cdp.evaluate(`(() => {
    const dept = document.getElementById('department');
    dept.value = 'Department of Electrical and Electronic Engineering (EEE)';
    dept.dispatchEvent(new Event('input', { bubbles: true }));
    dept.dispatchEvent(new Event('change', { bubbles: true }));

    const codesList = document.getElementById('course-codes-list');
    const options = Array.from(codesList ? codesList.options : []).map(o => o.value);
    const hint = document.getElementById('cascade-hint');
    const hintVisible = hint ? window.getComputedStyle(hint).display !== 'none' : false;

    return {
      optionsCount: options.length,
      options,
      hintVisible
    };
  })()`);

  console.log('  EEE cascade result:', eeeDeptCascade);
  if (!eeeDeptCascade.options.includes('EEE 1101') || !eeeDeptCascade.options.includes('PHY 1111')) {
    throw new Error('EEE + Level 1 Term I did not populate EEE 1101 / PHY 1111');
  }
  if (eeeDeptCascade.hintVisible) {
    throw new Error('Hint should NOT be visible when courses exist for EEE Level 1 Term I');
  }
  console.log('  -> PASS: EEE Level 1 Term I populates EEE 1101 and PHY 1111.\n');

  // --- STEP 4: SELECT "EEE 1101" -> AUTO-FILL TITLE TO "Electrical Circuits I" ---
  console.log('[STEP 4] Selecting / entering EEE 1101 in Course Code...');
  const step4Result = await cdp.evaluate(`(() => {
    const codeInput = document.getElementById('course-code');
    codeInput.value = 'EEE 1101';
    codeInput.dispatchEvent(new Event('input', { bubbles: true }));
    codeInput.dispatchEvent(new Event('change', { bubbles: true }));

    const titleInput = document.getElementById('course-title');
    const titlePreview = document.querySelector('[data-field="course-title"]');

    return {
      titleVal: titleInput ? titleInput.value : '',
      previewVal: titlePreview ? titlePreview.textContent.trim() : ''
    };
  })()`);

  console.log('  Step 4 result:', step4Result);
  if (step4Result.titleVal !== 'Electrical Circuits I' || step4Result.previewVal !== 'Electrical Circuits I') {
    throw new Error(`Expected 'Electrical Circuits I', got ${JSON.stringify(step4Result)}`);
  }
  console.log('  -> PASS: Course Title instantly auto-filled with "Electrical Circuits I".\n');

  // --- STEP 5: CLEAR TITLE AND TYPE "Physics" -> AUTO-FILL CODE TO "PHY 1111" ---
  console.log('[STEP 5] Clearing Course Title and typing "Physics"...');
  const step5Result = await cdp.evaluate(`(() => {
    const titleInput = document.getElementById('course-title');
    titleInput.value = '';
    titleInput.dispatchEvent(new Event('input', { bubbles: true }));

    titleInput.value = 'Physics';
    titleInput.dispatchEvent(new Event('input', { bubbles: true }));
    titleInput.dispatchEvent(new Event('change', { bubbles: true }));

    const codeInput = document.getElementById('course-code');
    const codePreview = document.querySelector('[data-field="course-code"]');

    return {
      codeVal: codeInput ? codeInput.value : '',
      previewVal: codePreview ? codePreview.textContent.trim() : ''
    };
  })()`);

  console.log('  Step 5 result:', step5Result);
  if (step5Result.codeVal !== 'PHY 1111' || step5Result.previewVal !== 'PHY 1111') {
    throw new Error(`Expected 'PHY 1111', got ${JSON.stringify(step5Result)}`);
  }
  console.log('  -> PASS: Course Code instantly auto-filled with "PHY 1111".\n');

  console.log('=== ALL PHASE 7D TESTING CHECKS PASSED ===');
} finally {
  try { if (cdp && cdp.ws) cdp.ws.close(); } catch {}
  try { chrome.kill(); } catch {}
  try { server.kill(); } catch {}
  try { fs.rmSync(userDataDir, { recursive: true, force: true }); } catch {}
}
