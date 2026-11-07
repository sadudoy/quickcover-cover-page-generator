/**
 * test-phase7-http.js — HTTP status code and traversal blocking verification
 * Phase 7 Requirement I.9
 */

import { spawn } from 'child_process';
import http from 'http';

const PORT = 5173;

async function waitForServer(url, timeoutMs = 5000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      await new Promise((resolve, reject) => {
        const req = http.get(url, (res) => (res.statusCode === 200 ? resolve() : reject()));
        req.on('error', reject);
        req.setTimeout(300, () => req.destroy());
      });
      return;
    } catch {
      await new Promise((r) => setTimeout(r, 100));
    }
  }
  throw new Error(`Server at ${url} not ready`);
}

function checkRoute(path) {
  return new Promise((resolve, reject) => {
    const req = http.get(`http://localhost:${PORT}${path}`, (res) => {
      resolve({
        statusCode: res.statusCode,
        contentType: res.headers['content-type']
      });
    });
    req.on('error', reject);
  });
}

async function run() {
  const server = spawn('node', ['scripts/dev-server.js'], { stdio: 'ignore' });

  try {
    await waitForServer(`http://localhost:${PORT}/create.html`);

    console.log('=== PHASE 7 HTTP & SECURITY CHECKS ===\n');

    const tests = [
      { path: '/', expectedCode: 200, checkType: 'text/html' },
      { path: '/create.html', expectedCode: 200, checkType: 'text/html' },
      { path: '/assets/default-logo.png', expectedCode: 200, checkType: 'image/png' },
      { path: '/css/print.css', expectedCode: 200, checkType: 'text/css' },
      { path: '/../reference/quick_cover_ui_reference.html', expectedCode: 403, checkType: null },
      { path: '/..%2F..%2Freference%2FdefaultLogo%2Flogo.png', expectedCode: 403, checkType: null }
    ];

    let passed = 0;
    for (const t of tests) {
      const res = await checkRoute(t.path);
      const codeMatch = res.statusCode === t.expectedCode || (t.expectedCode === 403 && (res.statusCode === 403 || res.statusCode === 404));
      const typeMatch = !t.checkType || (res.contentType && res.contentType.includes(t.checkType));
      const ok = codeMatch && typeMatch;
      console.log(
        `[${ok ? 'PASS' : 'FAIL'}] GET ${t.path} -> Status ${res.statusCode} (expected ${t.expectedCode}), Content-Type: ${res.contentType || 'none'}`
      );
      if (ok) passed++;
    }

    console.log(`\n=== HTTP CHECKS: ${passed}/${tests.length} PASSED ===\n`);
    if (passed !== tests.length) process.exit(1);

  } finally {
    server.kill();
  }
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
