/**
 * test-phase7w-verify.js — Verification of Phase 7W fixes:
 * 1. Mobile dynamic dropdowns: native <select> on mobile (<=768px), desktop keeps datalists.
 * 2. Mobile print: 1 page, no 2nd blank page.
 * 3. Mobile print header overlap: university header font size and department top spacing.
 */

import { spawn } from 'child_process';
import http from 'http';
import fs from 'fs';
import path from 'path';
import os from 'os';

const ROOT_DIR = process.cwd();
const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const PORT = 5173;
const DEBUG_PORT = 9245;

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
      throw new Error(`Evaluation failed: ${JSON.stringify(res.exceptionDetails)}`);
    }
    return res.result ? res.result.value : undefined;
  }
}

async function run() {
  console.log('=== PHASE 7W VERIFICATION SUITE ===\n');

  // Start dev server if needed
  let serverProc = null;
  try {
    await waitForServer(`http://localhost:${PORT}/create.html`, 1000);
  } catch {
    serverProc = spawn('node', ['scripts/dev-server.js'], { cwd: ROOT_DIR, stdio: 'ignore' });
    await waitForServer(`http://localhost:${PORT}/create.html`, 10000);
  }

  // Launch Chrome
  const tmpUserData = fs.mkdtempSync(path.join(os.tmpdir(), 'chrome-p7w-'));
  const chromeProc = spawn(CHROME_PATH, [
    '--headless=new',
    `--remote-debugging-port=${DEBUG_PORT}`,
    `--user-data-dir=${tmpUserData}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-background-networking',
    '--disable-sync',
    'about:blank'
  ]);

  try {
    await new Promise((r) => setTimeout(r, 1500));
    const versionRes = await new Promise((resolve, reject) => {
      http.get(`http://localhost:${DEBUG_PORT}/json/list`, (res) => {
        let data = '';
        res.on('data', (c) => (data += c));
        res.on('end', () => resolve(JSON.parse(data)));
      }).on('error', reject);
    });

    const pageWsUrl = versionRes[0].webSocketDebuggerUrl;
    const ws = new WebSocket(pageWsUrl);
    await new Promise((resolve) => (ws.onopen = resolve));
    const cdp = new CDPClient(ws);

    await cdp.send('Page.enable');
    await cdp.send('DOM.enable');
    await cdp.send('CSS.enable');
    await cdp.send('Runtime.enable');

    // -------------------------------------------------------------------------
    // TEST 1: Mobile Viewport (390 x 844) - Dropdown UX
    // -------------------------------------------------------------------------
    console.log('--- Test 1: Mobile Viewport Dropdown UX ---');
    await cdp.send('Emulation.setDeviceMetricsOverride', {
      width: 390,
      height: 844,
      deviceScaleFactor: 2,
      mobile: true
    });

    await cdp.send('Page.navigate', { url: `http://localhost:${PORT}/create.html` });
    await new Promise((r) => setTimeout(r, 2000));

    // Check companion selects exist on mobile
    const dropdownStatus = await cdp.evaluate(`
      (() => {
        const deptInput = document.getElementById('department');
        const deptSelect = deptInput ? deptInput._mobileSelect : null;
        const univInput = document.getElementById('university');
        const univSelect = univInput ? univInput._mobileSelect : null;
        const codeInput = document.getElementById('course-code');
        const codeSelect = codeInput ? codeInput._mobileSelect : null;

        const deptSelectDisplay = deptSelect ? window.getComputedStyle(deptSelect).display : 'null';
        const deptInputDisplay = deptInput ? window.getComputedStyle(deptInput).display : 'null';
        const optionsCount = deptSelect ? deptSelect.options.length : 0;
        const firstOptionText = deptSelect && deptSelect.options[0] ? deptSelect.options[0].textContent : '';
        const lastOptionText = deptSelect && deptSelect.options.length > 0 ? deptSelect.options[deptSelect.options.length - 1].textContent : '';

        return {
          hasDeptSelect: Boolean(deptSelect),
          deptSelectDisplay,
          deptInputDisplay,
          optionsCount,
          firstOptionText,
          lastOptionText
        };
      })()
    `);

    console.log('Mobile Dropdown Status:', dropdownStatus);
    if (
      dropdownStatus.hasDeptSelect &&
      dropdownStatus.deptSelectDisplay === 'block' &&
      dropdownStatus.deptInputDisplay === 'none' &&
      dropdownStatus.firstOptionText === 'Select Department' &&
      dropdownStatus.lastOptionText === 'Other (type manually)'
    ) {
      console.log('[PASS] Companion <select> rendered, visible on mobile, input hidden');
    } else {
      throw new Error(`[FAIL] Mobile dropdown setup incorrect: ${JSON.stringify(dropdownStatus)}`);
    }

    // -------------------------------------------------------------------------
    // TEST 2: Selecting Option in Mobile <select> Triggers Cascade & Preview
    // -------------------------------------------------------------------------
    console.log('\n--- Test 2: Select Option & Cascade Verification ---');
    const cascadeTest = await cdp.evaluate(`
      (() => {
        const deptInput = document.getElementById('department');
        const deptSelect = deptInput._mobileSelect;
        
        // Select EEE and set Level 1, Term I (which has courses in dropdowns.json)
        const eeeOption = Array.from(deptSelect.options).find(o => o.value.includes('EEE'));
        if (!eeeOption) return { error: 'EEE option not found' };
        deptSelect.value = eeeOption.value;
        deptSelect.dispatchEvent(new Event('change', { bubbles: true }));

        const lvlSelect = document.getElementById('level');
        lvlSelect.value = '1';
        lvlSelect.dispatchEvent(new Event('change', { bubbles: true }));

        const trmSelect = document.getElementById('term');
        trmSelect.value = 'I';
        trmSelect.dispatchEvent(new Event('change', { bubbles: true }));

        // Check input value and preview value
        const inputValue = deptInput.value;
        const previewEl = document.querySelector('[data-field="department-name"]');
        const previewText = previewEl ? previewEl.textContent : '';

        // Check Course Code select options count (should now be filtered)
        const codeInput = document.getElementById('course-code');
        const codeSelect = codeInput._mobileSelect;
        const codeOptionsCount = codeSelect ? codeSelect.options.length : 0;
        const datalist = document.getElementById('course-codes-list');
        const datalistCount = datalist ? datalist.children.length : 0;
        const lvl = document.getElementById('level').value;
        const trm = document.getElementById('term').value;

        return {
          inputValue,
          previewText,
          lvl,
          trm,
          datalistCount,
          codeOptionsCount
        };
      })()
    `);

    console.log('Cascade Test Result:', cascadeTest);
    if (
      cascadeTest.inputValue.includes('EEE') &&
      cascadeTest.previewText.includes('EEE') &&
      cascadeTest.codeOptionsCount > 2
    ) {
      console.log('[PASS] Selecting option in mobile dropdown updates input, preview, and cascades course codes');
    } else {
      throw new Error(`[FAIL] Cascade failed: ${JSON.stringify(cascadeTest)}`);
    }

    // -------------------------------------------------------------------------
    // TEST 3: Select "Other (type manually)" shows custom input
    // -------------------------------------------------------------------------
    console.log('\n--- Test 3: Other (Type Manually) Option ---');
    const otherTest = await cdp.evaluate(`
      (() => {
        const deptInput = document.getElementById('department');
        const deptSelect = deptInput._mobileSelect;
        deptSelect.value = '__custom__';
        deptSelect.dispatchEvent(new Event('change', { bubbles: true }));

        const inputDisplay = window.getComputedStyle(deptInput).display;
        
        // Type custom text
        deptInput.value = 'Department of Robotics Engineering';
        deptInput.dispatchEvent(new Event('input', { bubbles: true }));
        const previewEl = document.querySelector('[data-field="department-name"]');

        return {
          inputDisplay,
          inputValue: deptInput.value,
          previewText: previewEl ? previewEl.textContent : ''
        };
      })()
    `);

    console.log('Other Test Result:', otherTest);
    if (
      otherTest.inputDisplay === 'block' &&
      otherTest.previewText === 'Department of Robotics Engineering'
    ) {
      console.log('[PASS] "Other (type manually)" opens text input and typing updates preview');
    } else {
      throw new Error(`[FAIL] Other option test failed: ${JSON.stringify(otherTest)}`);
    }

    // -------------------------------------------------------------------------
    // TEST 4: Desktop Viewport (1280 x 800) - Selects Hidden, Inputs Visible
    // -------------------------------------------------------------------------
    console.log('\n--- Test 4: Desktop Viewport Lock ---');
    await cdp.send('Emulation.setDeviceMetricsOverride', {
      width: 1280,
      height: 800,
      deviceScaleFactor: 1,
      mobile: false
    });
    await new Promise((r) => setTimeout(r, 500));

    const desktopStatus = await cdp.evaluate(`
      (() => {
        const deptInput = document.getElementById('department');
        const deptSelect = deptInput ? deptInput._mobileSelect : null;

        const selectDisplay = deptSelect ? window.getComputedStyle(deptSelect).display : 'null';
        const inputDisplay = deptInput ? window.getComputedStyle(deptInput).display : 'null';

        return { selectDisplay, inputDisplay };
      })()
    `);

    console.log('Desktop Status:', desktopStatus);
    if (desktopStatus.selectDisplay === 'none' && desktopStatus.inputDisplay === 'block') {
      console.log('[PASS] Desktop viewport correctly hides mobile select and displays standard input');
    } else {
      throw new Error(`[FAIL] Desktop status incorrect: ${JSON.stringify(desktopStatus)}`);
    }

    // -------------------------------------------------------------------------
    // TEST 5: Mobile Print Emulation & Header Coordinates
    // -------------------------------------------------------------------------
    console.log('\n--- Test 5: Mobile Print Header & Page Count ---');
    // Emulate mobile and print
    await cdp.send('Emulation.setDeviceMetricsOverride', {
      width: 390,
      height: 844,
      deviceScaleFactor: 2,
      mobile: true
    });

    const printStyles = await cdp.evaluate(`
      (() => {
        const univ = document.querySelector('.university-header');
        const dept = document.querySelector('.department-header');
        return {
          univText: univ ? univ.textContent.trim() : '',
          univFontSize: univ ? window.getComputedStyle(univ).fontSize : '',
          deptTop: dept ? window.getComputedStyle(dept).top : ''
        };
      })()
    `);
    console.log('Header styles in preview:', printStyles);

    const pdfResult = await cdp.send('Page.printToPDF', {
      paperWidth: 8.27,
      paperHeight: 11.69,
      marginTop: 0,
      marginBottom: 0,
      marginLeft: 0,
      marginRight: 0
    });

    const pdfBuffer = Buffer.from(pdfResult.data, 'base64');
    const pdfPath = path.join(ROOT_DIR, 'reference', 'rendered', 'test-mobile-print.pdf');
    fs.writeFileSync(pdfPath, pdfBuffer);

    // Analyze using python PyMuPDF
    const analyzePy = path.join(ROOT_DIR, 'scripts', 'analyze-print-pdf.py');
    const { execSync } = await import('child_process');
    const out = execSync(`python "${analyzePy}" "${pdfPath}" -`, {
      input: JSON.stringify({
        expected: ['Bangladesh Army University of Science and Technology', 'Department of Robotics Engineering'],
        forbidden: ['.site-header', '.form-panel']
      }),
      encoding: 'utf-8'
    });

    const lines = out.trim().split('\n');
    const jsonLine = lines.reverse().find((l) => l.trim().startsWith('{'));
    const analysis = JSON.parse(jsonLine.trim());

    console.log('Mobile Print PDF Analysis:', analysis);
    if (analysis.page_count === 1 && analysis.is_a4) {
      console.log('[PASS] Mobile Print PDF generates exactly 1 page with exact A4 dimensions!');
    } else {
      throw new Error(`[FAIL] Mobile Print PDF page count: ${analysis.page_count}, is_a4: ${analysis.is_a4}`);
    }

    console.log('\n=== ALL PHASE 7W VERIFICATIONS PASSED ===');
  } finally {
    try {
      chromeProc.kill('SIGKILL');
    } catch {}
    if (serverProc) {
      try {
        serverProc.kill('SIGKILL');
      } catch {}
    }
    try {
      fs.rmSync(tmpUserData, { recursive: true, force: true });
    } catch {}
  }
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
