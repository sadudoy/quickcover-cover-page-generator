import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

console.log('=== C.1 Workspace inventory ===');
const dirs = ['client', 'client/css', 'client/js', 'client/data', 'client/assets', 'docs', 'tests', 'scripts', 'reference'];
dirs.forEach(d => {
  const exists = fs.existsSync(d);
  console.log(d + ':', exists ? 'EXISTS' : 'NOT FOUND');
  if (exists && fs.statSync(d).isDirectory()) {
    console.log('  files:', fs.readdirSync(d));
  }
});

console.log('\n=== C.2 Check reference/defaultLogo/logo.png ===');
const logoPath = 'reference/defaultLogo/logo.png';
if (fs.existsSync(logoPath)) {
  const stat = fs.statSync(logoPath);
  console.log('logo.png exists! Size:', stat.size, 'bytes');
  const buf = fs.readFileSync(logoPath);
  const isPng = buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4E && buf[3] === 0x47;
  console.log('PNG signature valid:', isPng);
} else {
  console.log('STOP! reference/defaultLogo/logo.png is MISSING!');
}

console.log('\n=== C.3 Verify Phase 6 State ===');
// a. cover.css SHA-256
const coverCss = fs.readFileSync('client/css/cover.css');
const hash = crypto.createHash('sha256').update(coverCss).digest('hex').toUpperCase();
console.log('cover.css SHA256:', hash);
const expectedHash = '055132E855624DF5B83BD91D2E819BBAFAE34CEC0BF5E03064F6AA0D689320EE';
console.log('Hash matches:', hash === expectedHash);

// b. create.html contains id="print-cover" and links css/print.css with media="print"
const createHtml = fs.readFileSync('client/create.html', 'utf8');
console.log('create.html has print-cover:', createHtml.includes('id="print-cover"'));
console.log('create.html links css/print.css with media="print":', /link[^>]+href=["']css\/print\.css["'][^>]+media=["']print["']|link[^>]+media=["']print["'][^>]+href=["']css\/print\.css["']/.test(createHtml));

// c. print.css exists with @page A4, margin 0, @media print, transform: none
const printCss = fs.readFileSync('client/css/print.css', 'utf8');
console.log('print.css exists, length:', printCss.length);
console.log('has @page size A4:', /@page\s*\{[^}]*size:\s*A4\s*portrait/i.test(printCss));
console.log('has margin: 0:', /margin:\s*0/i.test(printCss));
console.log('has @media print:', /@media\s+print/i.test(printCss));
console.log('has transform: none:', /transform:\s*none\s*!important/i.test(printCss));

// e. Cover Craft branding
const indexHtml = fs.readFileSync('client/index.html', 'utf8');
console.log('index.html has Cover Craft:', indexHtml.includes('Cover Craft'));
console.log('create.html has Cover Craft:', createHtml.includes('Cover Craft'));
const oldBrands = ['CoverCraft', 'Cover Craft', 'Cover Page Generator'];
oldBrands.forEach(b => {
  if (indexHtml.includes(b)) console.log('WARNING: index.html has old brand:', b);
  if (createHtml.includes(b)) console.log('WARNING: create.html has old brand:', b);
});

// f. Forbidden colored-shadow hexes
const forbiddenHexes = ['#2563EB', '#1D4ED8', '#0EA5E9', '#38BDF8', '#6366F1', '#4F46E5', '#3B82F6', '#60A5FA'];
fs.readdirSync('client/css').forEach(f => {
  const content = fs.readFileSync(path.join('client/css', f), 'utf8');
  forbiddenHexes.forEach(h => {
    if (content.toLowerCase().includes(h.toLowerCase())) {
      console.log('Forbidden hex', h, 'found in client/css/' + f);
    }
  });
});

console.log('\n=== C.4 Teacher Model Audit (Role occurrences) ===');
function searchRole(filePath) {
  if (!fs.existsSync(filePath)) return;
  const lines = fs.readFileSync(filePath, 'utf8').split('\n');
  lines.forEach((line, i) => {
    // Only check role as word or attribute
    if (/\b(role|roles)\b/i.test(line)) {
      console.log(`  ${filePath}:${i + 1}: ${line.trim()}`);
    }
  });
}
[
  'client/create.html',
  'client/js/create.js',
  'tests/smoke.test.js',
  'scripts/test-phase4-interactions.js',
  'scripts/test-phase5-interactions.js',
  'scripts/test-phase6-print.js',
  'docs/PROJECT_SPEC.md',
  'docs/ARCHITECTURE.md',
  'docs/DEVELOPMENT.md',
  'docs/PROJECT_STATUS.md'
].forEach(searchRole);

console.log('\n=== C.5 Logo State Audit ===');
console.log('create.html logo-box:');
const logoBoxMatch = createHtml.match(/<div class="logo-box"[\s\S]*?<\/div>/);
if (logoBoxMatch) console.log(logoBoxMatch[0]);

console.log('\ncreate.js logo usage:');
const createJs = fs.readFileSync('client/js/create.js', 'utf8');
createJs.split('\n').forEach((l, i) => {
  if (/logo/i.test(l)) {
    console.log(`  create.js:${i + 1}: ${l.trim()}`);
  }
});

console.log('\ncover.css .logo-box declarations:');
const logoBoxCssMatch = coverCss.toString('utf8').match(/\.logo-box\s*\{[^}]*\}/);
if (logoBoxCssMatch) console.log(logoBoxCssMatch[0]);

console.log('\n=== C.6 Default Values Audit ===');
console.log('create.js init & clear form:');
createJs.split('\n').forEach((l, i) => {
  if (/function init|function handleClearForm|DEFAULT_|clearForm/i.test(l)) {
    console.log(`  create.js:${i + 1}: ${l.trim()}`);
  }
});

console.log('\n=== C.7 Grep Audit ===');
['client/js/create.js', 'client/js/storage.js'].forEach(fp => {
  const content = fs.readFileSync(fp, 'utf8');
  const lines = content.split('\n');
  lines.forEach((l, i) => {
    if (/console\.(log|debug|info)/.test(l)) console.log(`  console.log/debug/info at ${fp}:${i + 1}: ${l.trim()}`);
    if (/console\.(warn|error)/.test(l)) console.log(`  console.warn/error at ${fp}:${i + 1}: ${l.trim()}`);
    if (/\bdebugger\b/.test(l)) console.log(`  debugger at ${fp}:${i + 1}: ${l.trim()}`);
    if (/\b(TODO|FIXME|XXX|HACK)\b/.test(l)) console.log(`  TODO/FIXME at ${fp}:${i + 1}: ${l.trim()}`);
    if (/api[_-]?key|password|secret|token|Bearer\s+/i.test(l)) console.log(`  possible secret at ${fp}:${i + 1}: ${l.trim()}`);
  });
});

console.log('Inline on*= in client/*.html:');
['client/index.html', 'client/create.html', 'client/cover-lab.html', 'client/cover-assignment.html'].forEach(fp => {
  if (!fs.existsSync(fp)) return;
  const lines = fs.readFileSync(fp, 'utf8').split('\n');
  lines.forEach((l, i) => {
    if (/\son[a-z]+=/i.test(l)) console.log(`  inline on* at ${fp}:${i + 1}: ${l.trim()}`);
  });
});
