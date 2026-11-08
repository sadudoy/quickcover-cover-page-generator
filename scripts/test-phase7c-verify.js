import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'chrome-p7c-'));
const DEBUG_PORT = 9260;
const PORT = 5173;

console.log('=== PHASE 7C VERIFICATION ===\n');

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

  // --- CHECK 2: LANDING PAGE BUTTON CONTRAST ---
  console.log('[CHECK 2] Verifying Landing Page "Open the tool" button contrast...');
  await cdp.send('Page.navigate', { url: `http://localhost:${PORT}/index.html` });
  await new Promise((r) => setTimeout(r, 1200));

  const landingNavBtnColor = await cdp.evaluate(`(() => {
    const btn = document.querySelector('.site-nav a.btn-primary');
    if (!btn) return 'NOT_FOUND';
    const computed = window.getComputedStyle(btn);
    return {
      text: btn.textContent.trim(),
      color: computed.color,
      backgroundColor: computed.backgroundColor
    };
  })()`);

  const heroBtnColor = await cdp.evaluate(`(() => {
    const btn = document.querySelector('.hero-actions a.btn-primary');
    if (!btn) return 'NOT_FOUND';
    const computed = window.getComputedStyle(btn);
    return {
      text: btn.textContent.trim(),
      color: computed.color,
      backgroundColor: computed.backgroundColor
    };
  })()`);

  console.log('  Nav button:', landingNavBtnColor);
  console.log('  Hero button:', heroBtnColor);

  if (landingNavBtnColor.color !== 'rgb(255, 255, 255)') {
    throw new Error(`Nav button color expected rgb(255, 255, 255), got ${landingNavBtnColor.color}`);
  }
  if (heroBtnColor.color !== 'rgb(255, 255, 255)') {
    throw new Error(`Hero button color expected rgb(255, 255, 255), got ${heroBtnColor.color}`);
  }
  console.log('  -> PASS: Landing page button text is pure white with high contrast.\n');

  // --- CHECK 3: TOOL PAGE TEACHER SECTION STACKED LAYOUT ---
  console.log('[CHECK 3] Verifying Tool Page Teacher Section layout...');
  await cdp.send('Page.navigate', { url: `http://localhost:${PORT}/create.html` });
  await new Promise((r) => setTimeout(r, 1500));

  const teacherLayout = await cdp.evaluate(`(() => {
    const row = document.querySelector('.teacher-row');
    const header = row ? row.querySelector('.teacher-row-header') : null;
    const badge = header ? header.querySelector('.teacher-num-badge') : null;
    const removeBtn = header ? header.querySelector('.t-remove') : null;
    const fields = row ? row.querySelectorAll('.teacher-field') : [];
    const computedRow = row ? window.getComputedStyle(row) : null;

    return {
      rowFound: !!row,
      flexDirection: computedRow ? computedRow.flexDirection : null,
      headerFound: !!header,
      badgeText: badge ? badge.textContent.trim() : null,
      removeBtnDisabled: removeBtn ? removeBtn.disabled : null,
      fieldsCount: fields.length,
      fieldName: fields[0] ? fields[0].querySelector('span').textContent.trim() : null,
      fieldDesig: fields[1] ? fields[1].querySelector('span').textContent.trim() : null
    };
  })()`);

  console.log('  Single teacher row initial layout:', teacherLayout);
  if (!teacherLayout.rowFound || teacherLayout.flexDirection !== 'column') {
    throw new Error(`Teacher row flex-direction expected column, got ${teacherLayout.flexDirection}`);
  }
  if (teacherLayout.badgeText !== 'Teacher 1') {
    throw new Error(`Expected Teacher 1 badge, got ${teacherLayout.badgeText}`);
  }
  if (!teacherLayout.removeBtnDisabled) {
    throw new Error('Remove button should be disabled when only 1 teacher');
  }

  // Click Add Teacher button
  await cdp.evaluate(`document.getElementById('add-teacher').click()`);
  await new Promise((r) => setTimeout(r, 300));

  const multiTeacherCheck = await cdp.evaluate(`(() => {
    const rows = document.querySelectorAll('.teacher-row');
    const badges = Array.from(rows).map(r => r.querySelector('.teacher-num-badge')?.textContent.trim());
    const removeBtnsDisabled = Array.from(rows).map(r => r.querySelector('.t-remove')?.disabled);
    return {
      rowCount: rows.length,
      badges,
      removeBtnsDisabled
    };
  })()`);

  console.log('  After adding teacher:', multiTeacherCheck);
  if (multiTeacherCheck.rowCount !== 2 || multiTeacherCheck.badges[1] !== 'Teacher 2') {
    throw new Error('Failed to add second teacher with proper Teacher 2 badge');
  }
  if (multiTeacherCheck.removeBtnsDisabled.some(d => d === true)) {
    throw new Error('Remove buttons should be enabled when multiple teachers exist');
  }
  console.log('  -> PASS: Teacher section is stacked vertically with Teacher header & remove button.\n');

  // --- CHECK 4: CASCADING DROPDOWNS & AUTOFILL ---
  console.log('[CHECK 4] Verifying Cascading Dropdowns & Auto-fill logic...');

  // Check 4.1: All 10 departments in datalist
  const deptCount = await cdp.evaluate(`(() => {
    const list = document.getElementById('departments-list');
    return list ? list.options.length : 0;
  })()`);
  console.log(`  Departments in datalist: ${deptCount}`);
  if (deptCount !== 10) {
    throw new Error(`Expected 10 departments in datalist, got ${deptCount}`);
  }

  // Check 4.2: Department empty, Level 1, Term I -> courses across all departments
  await cdp.evaluate(`(() => {
    const dept = document.getElementById('department');
    dept.value = '';
    dept.dispatchEvent(new Event('input', { bubbles: true }));

    const lvl = document.getElementById('level');
    lvl.value = '1';
    lvl.dispatchEvent(new Event('change', { bubbles: true }));

    const term = document.getElementById('term');
    term.value = 'I';
    term.dispatchEvent(new Event('change', { bubbles: true }));
  })()`);
  await new Promise((r) => setTimeout(r, 300));

  const allDeptCoursesCount = await cdp.evaluate(`(() => {
    const list = document.getElementById('course-codes-list');
    return list ? list.options.length : 0;
  })()`);
  console.log(`  Courses with empty dept, Level 1, Term I: ${allDeptCoursesCount}`);
  if (allDeptCoursesCount <= 0) {
    throw new Error('Expected course options across departments when department is empty');
  }

  // Check 4.3: Department "Electrical and Electronic Engineering (EEE)", Level 1, Term I
  await cdp.evaluate(`(() => {
    const dept = document.getElementById('department');
    dept.value = 'Electrical and Electronic Engineering (EEE)';
    dept.dispatchEvent(new Event('input', { bubbles: true }));
    dept.dispatchEvent(new Event('change', { bubbles: true }));
  })()`);
  await new Promise((r) => setTimeout(r, 300));

  const eeeCourses = await cdp.evaluate(`(() => {
    const list = document.getElementById('course-codes-list');
    const options = Array.from(list ? list.options : []).map(o => o.value);
    return options;
  })()`);
  console.log('  EEE Level 1 Term I courses in datalist:', eeeCourses);
  if (!eeeCourses.includes('EEE 1101')) {
    throw new Error(`Expected EEE 1101 in course-codes-list, got: ${JSON.stringify(eeeCourses)}`);
  }

  // Check 4.4: Auto-fill Title when selecting / typing course code
  await cdp.evaluate(`(() => {
    const code = document.getElementById('course-code');
    code.value = 'EEE 1101';
    code.dispatchEvent(new Event('input', { bubbles: true }));
    code.dispatchEvent(new Event('change', { bubbles: true }));
  })()`);
  await new Promise((r) => setTimeout(r, 300));

  const autofillResult = await cdp.evaluate(`(() => {
    const titleInput = document.getElementById('course-title');
    const titlePreview = document.querySelector('[data-field="course-title"]');
    return {
      inputValue: titleInput ? titleInput.value : null,
      previewValue: titlePreview ? titlePreview.textContent.trim() : null
    };
  })()`);
  console.log('  Auto-fill result for EEE 1101:', autofillResult);
  if (autofillResult.inputValue !== 'Electrical Circuits I' || autofillResult.previewValue !== 'Electrical Circuits I') {
    throw new Error(`Expected 'Electrical Circuits I', got: ${JSON.stringify(autofillResult)}`);
  }
  console.log('  -> PASS: Cascading dropdowns and course title auto-fill work perfectly!\n');

  console.log('=== ALL PHASE 7C VERIFICATIONS PASSED SUCCESSFULLY ===');
} finally {
  try { if (cdp && cdp.ws) cdp.ws.close(); } catch {}
  try { chrome.kill(); } catch {}
  try { server.kill(); } catch {}
  try { fs.rmSync(userDataDir, { recursive: true, force: true }); } catch {}
}
