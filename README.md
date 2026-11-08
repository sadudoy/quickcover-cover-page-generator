# Cover Craft

**Cover Craft** is a zero-dependency, client-side web application designed to generate standardized, print-ready university assignment and lab-report cover pages matching institutional templates with pixel-accurate precision.

Built entirely with **vanilla HTML5, CSS3, and JavaScript ES modules** — no frameworks, no bundlers, no build steps, and no external dependencies.

---

## Features

- **Pixel-Accurate A4 Cover Layout**: Complies with institutional specifications (exact 210mm × 297mm single-page A4 format).
- **Dual Document Types**: Seamlessly toggle between **Lab Report** (includes Experiment Date) and **Assignment** layouts.
- **Dynamic Multi-Teacher Support**: Add, edit, or remove multiple teachers/instructors with automatic card height balancing and a shared, pinned signature line.
- **Cascading Course Catalogue**: Intelligent auto-complete for course codes and course titles based on department, level, and term.
- **Built-in Defaults**: Pre-configured defaults for Bangladesh Army University of Science and Technology (BAUST) and CSE.
- **Logo Support**: Bundled institutional default logo with instant user logo upload and one-click reset.
- **100% Local Processing & Persistence**: Automatic draft auto-save and logo caching using LocalStorage and IndexedDB. Zero data ever leaves the browser.
- **Vector Print-to-PDF**: Exports directly through the browser print dialog as a single-page vector PDF with zero UI chrome leaks.
- **Fully Responsive**: Adapts across mobile (360px), tablet (768px), desktop (1280px), and ultrawide (1920px).

---

## Tech Stack

- **Markup**: Semantic HTML5 (landmarks, accessible labels, live regions)
- **Styling**: Modern CSS3 (CSS Custom Properties, Flexbox, CSS Grid, `@page`, `@media print`)
- **Scripting**: Vanilla JavaScript ES Modules (`create.js`, `storage.js`, `site.js`)
- **Testing**: Built-in Node.js test runner (`node:test`, `node:assert`) and Chromium DevTools Protocol (CDP) for end-to-end browser automation

---

## Quick Start

### 1. Run the Local Development Server
Start the built-in local static server (zero external packages required):
```bash
npm run dev
```
- **Landing Page**: [http://localhost:5173/](http://localhost:5173/)
- **Tool Page**: [http://localhost:5173/create.html](http://localhost:5173/create.html)

### 2. Run the Automated Tests
Execute the unit and smoke test suite using Node's built-in test runner:
```bash
npm test
```

### 3. Run End-to-End Verification Suites
Run browser automation suites via Chromium DevTools Protocol:
```bash
node scripts/test-golden-path.js    # 12-step complete student workflow E2E test
node scripts/test-phase6-print.js   # Precision A4 vector print fidelity test
node scripts/test-phase4-interactions.js  # Dynamic multi-teacher test
node scripts/test-phase5-interactions.js  # Persistence and cross-tab sync test
node scripts/test-defaults.js       # Pre-filled defaults & cascade hint test
```

---

## Production Deployment

Because Cover Craft is a 100% static client-side application, it requires **zero build steps** and can be deployed directly to any static web host.

- **Netlify**: Drag-and-drop the `client/` directory into the Netlify dashboard, or configure publish directory as `client`.
- **Vercel**: Deploy the repository and set the root directory or output directory to `client`.
- **GitHub Pages**: Set GitHub Pages source to the branch and point to the `client/` directory (or publish via GitHub Actions).

For detailed deployment and maintenance instructions, see the [Handover Guide](docs/HANDOVER.md).

---

## Documentation Links

- [`docs/HANDOVER.md`](docs/HANDOVER.md) — Comprehensive guide for updating course data, defaults, logo, and deploying.
- [`docs/PROJECT_SPEC.md`](docs/PROJECT_SPEC.md) — Product specifications, data schema, and technical rules.
- [`docs/PROJECT_STATUS.md`](docs/PROJECT_STATUS.md) — Current implementation milestones and verified status.
- [`docs/DEVELOPMENT.md`](docs/DEVELOPMENT.md) — Development workflow, storage contracts, and CSS freeze invariants.
- [`docs/TESTING.md`](docs/TESTING.md) — Testing strategy and script inventory.
- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — Architectural overview and design principles.

---

## License

MIT © 2026 Cover Craft.
