import fs from 'fs';

console.log('=== C.9 Media queries and min-width audit ===');
['client/css/form.css', 'client/css/landing.css', 'client/css/site.css'].forEach(f => {
  const content = fs.readFileSync(f, 'utf8');
  console.log(`\n--- ${f} ---`);
  const mediaMatches = content.match(/@media[^{]+\{/g);
  if (mediaMatches) {
    mediaMatches.forEach(m => console.log('  ' + m.trim()));
  } else {
    console.log('  No @media queries');
  }
  const minWidthMatches = content.match(/[^\n;{}]*min-width[^\n;{}]*;/g);
  if (minWidthMatches) {
    minWidthMatches.forEach(m => console.log('  min-width rule: ' + m.trim()));
  }
});

console.log('\n=== C.10 create.html Accessibility Audit ===');
const createHtml = fs.readFileSync('client/create.html', 'utf8');
// Landmarks
console.log('Landmarks:');
['<header', '<nav', '<main', '<footer', '<aside', '<section'].forEach(tag => {
  const count = (createHtml.match(new RegExp(tag, 'g')) || []).length;
  console.log(`  ${tag}: ${count}`);
});
// Skip link
console.log('Skip link:', createHtml.includes('skip-link') || createHtml.includes('skip-to-content') || createHtml.includes('href="#main"'));
// Headings
console.log('Headings:');
const hMatches = createHtml.match(/<h[1-6][^>]*>[\s\S]*?<\/h[1-6]>/gi);
if (hMatches) hMatches.forEach(h => console.log('  ' + h.replace(/\s+/g, ' ').trim()));

// ARIA attributes
console.log('ARIA / Role attributes:');
const ariaMatches = createHtml.match(/aria-[a-z]+="[^"]*"|role="[^"]*"/gi);
if (ariaMatches) {
  const unique = Array.from(new Set(ariaMatches));
  unique.forEach(a => console.log('  ' + a));
}

// Labels audit in create.html
console.log('\nForm inputs count vs labels:');
const inputMatches = createHtml.match(/<input[^>]+>/g) || [];
console.log(`  Total inputs: ${inputMatches.length}`);
const selectMatches = createHtml.match(/<select[^>]+>/g) || [];
console.log(`  Total selects: ${selectMatches.length}`);
const textareaMatches = createHtml.match(/<textarea[^>]+>/g) || [];
console.log(`  Total textareas: ${textareaMatches.length}`);
const buttonMatches = createHtml.match(/<button[^>]+>/g) || [];
console.log(`  Total buttons: ${buttonMatches.length}`);

console.log('\nInputs without id:');
inputMatches.forEach(inp => {
  if (!inp.includes('id=')) console.log('  no id:', inp);
});

console.log('\n=== C.8 create.js and storage.js audit for pure functions ===');
const createJs = fs.readFileSync('client/js/create.js', 'utf8');
const storageJs = fs.readFileSync('client/js/storage.js', 'utf8');
console.log('create.js length:', createJs.length);
console.log('storage.js length:', storageJs.length);
