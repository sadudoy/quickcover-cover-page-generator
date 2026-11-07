import fs from 'fs';
import path from 'path';

console.log('=== HARDENING VERIFICATION REPORT ===\n');

// a. console.log / debug / info
let consoleViolations = 0;
const jsFiles = ['client/js/create.js', 'client/js/storage.js', 'client/js/site.js', 'client/js/main.js'];
jsFiles.forEach((file) => {
  const lines = fs.readFileSync(file, 'utf-8').split('\n');
  lines.forEach((l, i) => {
    if (/console\.(log|debug|info)\(/.test(l)) {
      console.log(`[VIOLATION] console call at ${file}:${i + 1}: ${l.trim()}`);
      consoleViolations++;
    }
  });
});
console.log(`console.log/debug/info count: ${consoleViolations} (PASS: ${consoleViolations === 0})`);

// b. console.warn / error audit
console.log('\nAudit of remaining console.warn/error:');
jsFiles.forEach((file) => {
  const lines = fs.readFileSync(file, 'utf-8').split('\n');
  lines.forEach((l, i) => {
    if (/console\.(warn|error)\(/.test(l)) {
      console.log(`  ${file}:${i + 1}: ${l.trim()}`);
    }
  });
});

// c. debugger
let debuggerCount = 0;
jsFiles.forEach((file) => {
  const content = fs.readFileSync(file, 'utf-8');
  if (/\bdebugger\b/.test(content)) {
    console.log(`[VIOLATION] debugger statement in ${file}`);
    debuggerCount++;
  }
});
console.log(`\ndebugger statements count: ${debuggerCount} (PASS: ${debuggerCount === 0})`);

// d. TODO / FIXME / XXX / HACK
let todoCount = 0;
jsFiles.forEach((file) => {
  const content = fs.readFileSync(file, 'utf-8');
  if (/\b(TODO|FIXME|XXX|HACK)\b/.test(content)) {
    console.log(`[VIOLATION] TODO/FIXME in ${file}`);
    todoCount++;
  }
});
console.log(`TODO/FIXME count: ${todoCount} (PASS: ${todoCount === 0})`);

// e. Secrets scan
let secretsCount = 0;
jsFiles.forEach((file) => {
  const content = fs.readFileSync(file, 'utf-8');
  if (/api[_-]?key|secret|password|bearer\s+/i.test(content)) {
    console.log(`[VIOLATION] possible secret in ${file}`);
    secretsCount++;
  }
});
console.log(`Secrets scan matches: ${secretsCount} (PASS: ${secretsCount === 0})`);

// f. Inline on*= in client/*.html
let inlineOnCount = 0;
fs.readdirSync('client')
  .filter((f) => f.endsWith('.html'))
  .forEach((f) => {
    const content = fs.readFileSync(path.join('client', f), 'utf-8');
    if (/\son[a-z]+=/i.test(content)) {
      console.log(`[VIOLATION] inline on* handler in client/${f}`);
      inlineOnCount++;
    }
  });
console.log(`Inline on*= event handlers: ${inlineOnCount} (PASS: ${inlineOnCount === 0})`);

// g. Spot check: eval, Function constructor, external origins
let evalCount = 0;
jsFiles.forEach((file) => {
  const content = fs.readFileSync(file, 'utf-8');
  if (/\beval\(|new\s+Function\(/.test(content)) {
    console.log(`[VIOLATION] eval/Function in ${file}`);
    evalCount++;
  }
  if (/https?:\/\/(?!localhost|127\.0\.0\.1)/.test(content)) {
    console.log(`[WARNING] External URL in ${file}`);
  }
});
console.log(`eval/Function constructor count: ${evalCount} (PASS: ${evalCount === 0})`);
