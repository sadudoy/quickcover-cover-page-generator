/**
 * test-golden-path.js — Automated 12-Step End-to-End Student Workflow Test
 * Phase 7 Requirement D.7 / I.5
 */

import { spawn, execSync } from 'child_process';
import http from 'http';
import fs from 'fs';
import path from 'path';
import os from 'os';

const ROOT_DIR = process.cwd();
const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const PORT = 5173;
const DEBUG_PORT = 9236;
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

function runPdfAnalysis(pdfPath, config) {
  const scriptPath = path.join(ROOT_DIR, 'scripts', 'analyze-print-pdf.py');
  const out = execSync(`python "${scriptPath}" "${pdfPath}" -`, {
    cwd: ROOT_DIR,
    input: JSON.stringify(config),
    encoding: 'utf-8'
  });
  const lines = out.trim().split('\n');
  const jsonLine = lines.reverse().find((l) => l.trim().startsWith('{'));
  return JSON.parse(jsonLine.trim());
}

const FORBIDDEN_CHROME = [
  'Start over',
  'Your Information',
  'LIVE PREVIEW',
  'A4 · Portrait',
  'Back to home',
  'Skip to main content',
  'Document Type',
  'University Logo',
  'In the print dialog'
];

async function run() {
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'chrome-golden-path-'));

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

  let stepCount = 0;
  let passes = 0;
  let fails = 0;

  function report(stepNum, name, condition, details = '') {
    stepCount++;
    if (condition) {
      console.log(`[PASS] Step ${stepNum}: ${name}`);
      passes++;
    } else {
      console.error(`[FAIL] Step ${stepNum}: ${name} (${details})`);
      fails++;
    }
  }

  try {
    await waitForServer(`http://localhost:${PORT}/create.html`);
    await waitForServer(`http://127.0.0.1:${DEBUG_PORT}/json/version`);

    const tabsRes = await fetch(`http://127.0.0.1:${DEBUG_PORT}/json/list`);
    const tabs = await tabsRes.json();
    const cdp = await connectToWs(tabs[0].webSocketDebuggerUrl);

    await cdp.send('Page.enable');
    await cdp.send('Runtime.enable');

    console.log('=== GOLDEN PATH 12-STEP END-TO-END VERIFICATION ===\n');

    // 1. Open /create.html fresh (clear storage first)
    await cdp.send('Page.navigate', { url: `http://localhost:${PORT}/create.html` });
    await new Promise((r) => setTimeout(r, 1000));
    await cdp.eval(`(() => { localStorage.clear(); indexedDB.deleteDatabase('covercraft-db'); })()`);
    await cdp.send('Page.reload');
    await new Promise((r) => setTimeout(r, 1200));
    report(1, 'Open /create.html fresh with cleared storage', true);

    // 2. Verify defaults: university contains BAUST, department contains CSE, level = "2", term = "II", logo shows default, status empty
    const step2 = await cdp.eval(`(() => {
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
      2,
      'Verify default values on fresh load',
      step2.u.includes('BAUST') &&
        step2.d.includes('CSE') &&
        step2.l === '2' &&
        step2.t === 'II' &&
        step2.logoSrc.includes('default-logo.png') &&
        step2.status === '',
      JSON.stringify(step2)
    );

    // 3. Select Lab Report (already default)
    const step3 = await cdp.eval(`(() => {
      const radio = document.getElementById('doc-type-lab');
      return { checked: radio ? radio.checked : false };
    })()`);
    report(3, 'Select Lab Report (verified checked)', step3.checked === true);

    // 4. Fill: doc number, doc title, comment, student name, student ID, experiment date, submission date
    await cdp.eval(`(() => {
      function setVal(id, val, evt = 'input') {
        const el = document.getElementById(id);
        if (el) {
          el.value = val;
          el.dispatchEvent(new Event(evt, { bubbles: true }));
        }
      }
      setVal('doc-number', '07');
      setVal('doc-title', 'Golden Path End-to-End Verification');
      setVal('comment', 'Excellent performance');
      setVal('student-name', 'Sadman Sakib');
      setVal('student-id', '210101001');
      setVal('experiment-date', '2026-11-06');
      setVal('submission-date', '2026-11-07');
    })()`);
    report(4, 'Fill document details, student info, and dates', true);

    // 5. Type a course code (any value — cascade for CSE has no courses; verify cascade hint is visible)
    const step5 = await cdp.eval(`(() => {
      const codeInput = document.getElementById('course-code');
      codeInput.value = 'CSE 3201';
      codeInput.dispatchEvent(new Event('input', { bubbles: true }));

      const titleInput = document.getElementById('course-title');
      titleInput.value = 'Software Engineering and Information System Design';
      titleInput.dispatchEvent(new Event('input', { bubbles: true }));

      const hint = document.getElementById('cascade-hint');
      const hintDisplay = hint ? window.getComputedStyle(hint).display : '';
      return { hintDisplay, codeVal: codeInput.value };
    })()`);
    report(
      5,
      'Type course code and verify cascade hint is visible',
      step5.codeVal === 'CSE 3201' && step5.hintDisplay === 'block',
      JSON.stringify(step5)
    );

    // 6. Add a second teacher: set Name + Designation (no role)
    const step6 = await cdp.eval(`(() => {
      const row0Name = document.querySelector('.teacher-row[data-index="0"] .t-name');
      const row0Desig = document.querySelector('.teacher-row[data-index="0"] .t-designation');
      row0Name.value = 'Dr. Primary Teacher';
      row0Name.dispatchEvent(new Event('input', { bubbles: true }));
      row0Desig.value = 'Professor';
      row0Desig.dispatchEvent(new Event('input', { bubbles: true }));

      document.getElementById('add-teacher').click();

      const row1Name = document.querySelector('.teacher-row[data-index="1"] .t-name');
      const row1Desig = document.querySelector('.teacher-row[data-index="1"] .t-designation');
      row1Name.value = 'Engr. Second Teacher';
      row1Name.dispatchEvent(new Event('input', { bubbles: true }));
      row1Desig.value = 'Lecturer';
      row1Desig.dispatchEvent(new Event('input', { bubbles: true }));

      const rows = document.querySelectorAll('.teacher-row');
      const hasRoleInput = !!document.querySelector('.teacher-row .t-role');
      return { rowCount: rows.length, hasRoleInput };
    })()`);
    report(
      6,
      'Add second teacher with Name + Designation (no role input)',
      step6.rowCount === 2 && step6.hasRoleInput === false,
      JSON.stringify(step6)
    );

    // 7. Upload a small PNG logo — verify preview shows uploaded logo, cascade state, default replaced
    const step7 = await cdp.eval(`(() => {
      const canvas = document.createElement('canvas');
      canvas.width = 120;
      canvas.height = 120;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#1e3a8a';
      ctx.fillRect(0, 0, 120, 120);
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 20px serif';
      ctx.fillText('CUSTOM', 15, 65);

      const dataUrl = canvas.toDataURL('image/png');
      const bin = atob(dataUrl.split(',')[1]);
      const arr = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
      const file = new File([arr], 'custom-logo.png', { type: 'image/png' });

      const input = document.getElementById('logo-upload');
      const dt = new DataTransfer();
      dt.items.add(file);
      input.files = dt.files;
      input.dispatchEvent(new Event('change', { bubbles: true }));
    })()`);

    await new Promise((r) => setTimeout(r, 800));

    const step7Verify = await cdp.eval(`(() => {
      const img = document.querySelector('.logo-box img.logo-img');
      const src = img ? img.getAttribute('src') : '';
      const alt = img ? img.getAttribute('alt') : '';
      const isBlob = src.startsWith('blob:');
      const defaultReplaced = !src.includes('default-logo.png');
      return { isBlob, defaultReplaced, alt };
    })()`);

    report(
      7,
      'Upload logo replaces default logo with user blob',
      step7Verify.isBlob === true && step7Verify.defaultReplaced === true && step7Verify.alt === 'Uploaded institution logo',
      JSON.stringify(step7Verify)
    );

    // 8. Confirm preview shows all expected values (including "Teacher Name: X" for both teachers, no role prefix)
    const step8 = await cdp.eval(`(() => {
      const u = document.querySelector('[data-field="university-name"]').textContent;
      const d = document.querySelector('[data-field="department-name"]').textContent;
      const code = document.querySelector('[data-field="course-code"]').textContent;
      const title = document.querySelector('[data-field="course-title"]').textContent;
      const docNo = document.querySelector('[data-field="doc-number"]').textContent;
      const docT = document.querySelector('[data-field="doc-title"]').textContent;
      const sName = document.querySelector('[data-field="student-name"]').textContent;
      const sId = document.querySelector('[data-field="student-id"]').textContent;
      const expDate = document.querySelector('[data-field="experiment-date"]').textContent;
      const subDate = document.querySelector('[data-field="submission-date"]').textContent;

      const teacherEntries = document.querySelectorAll('[data-field="teachers-list"] .teacher-entry');
      const t1Line = teacherEntries[0] ? teacherEntries[0].querySelector('.teacher-line-name').textContent : '';
      const t2Line = teacherEntries[1] ? teacherEntries[1].querySelector('.teacher-line-name').textContent : '';

      return {
        u, d, code, title, docNo, docT, sName, sId, expDate, subDate,
        t1Line, t2Line,
        entriesCount: teacherEntries.length
      };
    })()`);

    report(
      8,
      'Preview renders all expected fields and "Teacher Name: X" for both teachers without role',
      step8.entriesCount === 2 &&
        step8.t1Line.includes('Teacher Name: Dr. Primary Teacher') &&
        step8.t2Line.includes('Teacher Name: Engr. Second Teacher') &&
        !step8.t1Line.includes('Role:') &&
        !step8.t2Line.includes('Role:') &&
        step8.expDate === '06/11/2026' &&
        step8.subDate === '07/11/2026',
      JSON.stringify(step8)
    );

    // 9. Click "Print / Save as PDF"; capture PDF (headless). Verify 1 page, A4, contains expected strings & logo, zero chrome leaks
    const pdfResult = await cdp.send('Page.printToPDF', {
      printBackground: true,
      preferCSSPageSize: true,
      marginTop: 0,
      marginBottom: 0,
      marginLeft: 0,
      marginRight: 0
    });

    const pdfPath = path.join(RENDERED_DIR, 'golden-path.pdf');
    fs.writeFileSync(pdfPath, Buffer.from(pdfResult.data, 'base64'));
    const pngPath = path.join(RENDERED_DIR, 'golden-path.png');

    const pdfAnalysis = runPdfAnalysis(pdfPath, {
      expected: [
        'Bangladesh Army University of Science and Technology (BAUST), Saidpur',
        'Department of Computer Science and Engineering (CSE)',
        'CSE 3201',
        'Software Engineering and Information System Design',
        'Golden Path End-to-End Verification',
        'Sadman Sakib',
        '210101001',
        'Dr. Primary Teacher',
        'Engr. Second Teacher',
        '06/11/2026',
        '07/11/2026'
      ],
      forbidden: FORBIDDEN_CHROME,
      render_png: pngPath
    });

    report(
      9,
      'Print to PDF generates single A4 page with vector text and 0 chrome leaks',
      pdfAnalysis.page_count === 1 &&
        pdfAnalysis.is_a4 === true &&
        pdfAnalysis.missing_strings.length === 0 &&
        pdfAnalysis.leaked_chrome.length === 0 &&
        pdfAnalysis.has_vector_fonts === true,
      `missing: ${JSON.stringify(pdfAnalysis.missing_strings)}, leaks: ${JSON.stringify(pdfAnalysis.leaked_chrome)}`
    );

    // 10. Reload. Verify all fields restored, 2 teachers restored (no role), uploaded logo restored
    // Wait for debounce save before reload
    await new Promise((r) => setTimeout(r, 700));
    await cdp.send('Page.reload');
    await new Promise((r) => setTimeout(r, 1200));

    const step10 = await cdp.eval(`(() => {
      const code = document.getElementById('course-code').value;
      const sName = document.getElementById('student-name').value;
      const rows = document.querySelectorAll('.teacher-row');
      const t1Name = rows[0] ? rows[0].querySelector('.t-name').value : '';
      const t2Name = rows[1] ? rows[1].querySelector('.t-name').value : '';
      const hasRole = !!document.querySelector('.teacher-row .t-role');
      const img = document.querySelector('.logo-box img.logo-img');
      const logoSrc = img ? img.getAttribute('src') : '';
      const isBlob = logoSrc.startsWith('blob:');
      const status = document.getElementById('storage-status').textContent;
      return { code, sName, rowCount: rows.length, t1Name, t2Name, hasRole, isBlob, status };
    })()`);

    report(
      10,
      'Reload restores all fields, 2 teachers without role, and uploaded logo',
      step10.code === 'CSE 3201' &&
        step10.sName === 'Sadman Sakib' &&
        step10.rowCount === 2 &&
        step10.t1Name === 'Dr. Primary Teacher' &&
        step10.t2Name === 'Engr. Second Teacher' &&
        step10.hasRole === false &&
        step10.isBlob === true,
      JSON.stringify(step10)
    );

    // 11. Click "Reset logo" — verify uploaded logo cleared, default logo shown
    await cdp.eval(`document.getElementById('remove-logo').click()`);
    await new Promise((r) => setTimeout(r, 500));

    const step11 = await cdp.eval(`(() => {
      const img = document.querySelector('.logo-box img.logo-img');
      const src = img ? img.getAttribute('src') : '';
      const status = document.getElementById('storage-status').textContent;
      return { src, status };
    })()`);

    report(
      11,
      'Click "Reset logo" reverts to default logo',
      step11.src.includes('default-logo.png') && step11.status === 'Logo reset to default.',
      JSON.stringify(step11)
    );

    // 12. Click "Start over", accept dialog. Verify: fields reset to defaults (BAUST/CSE/Level 2/Term II),
    // other fields blank, preview cleared except defaults, 1 empty teacher entry, default logo shown, status updated
    await cdp.eval(`(() => {
      window.confirm = () => true;
      document.getElementById('clear-form').click();
    })()`);
    await new Promise((r) => setTimeout(r, 500));

    const step12 = await cdp.eval(`(() => {
      const u = document.getElementById('university').value;
      const d = document.getElementById('department').value;
      const l = document.getElementById('level').value;
      const t = document.getElementById('term').value;
      const code = document.getElementById('course-code').value;
      const sName = document.getElementById('student-name').value;
      const rows = document.querySelectorAll('.teacher-row');
      const img = document.querySelector('.logo-box img.logo-img');
      const logoSrc = img ? img.getAttribute('src') : '';
      const status = document.getElementById('storage-status').textContent;
      return { u, d, l, t, code, sName, rowCount: rows.length, logoSrc, status };
    })()`);

    report(
      12,
      'Click "Start over" resets to defaults (BAUST/CSE/Level 2/Term II), blanks others, 1 empty teacher, default logo',
      step12.u.includes('BAUST') &&
        step12.d.includes('CSE') &&
        step12.l === '2' &&
        step12.t === 'II' &&
        step12.code === '' &&
        step12.sName === '' &&
        step12.rowCount === 1 &&
        step12.logoSrc.includes('default-logo.png') &&
        step12.status === 'Reset to defaults.',
      JSON.stringify(step12)
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

  console.log(`\n=== GOLDEN PATH SUMMARY: ${passes}/12 PASSED, ${fails} FAILED ===\n`);
  if (fails > 0) process.exit(1);
}

run().catch((err) => {
  console.error('Fatal error in test-golden-path:', err);
  process.exit(1);
});
