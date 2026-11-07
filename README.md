# Quick Cover

Quick Cover is a zero-dependency, client-side web application designed to generate standardized, print-ready university assignment and lab-report cover pages matching institutional templates exactly.

Built with vanilla HTML5, CSS3, and JavaScript ES modules — **no frameworks, no bundler, no build step, no external dependencies**.

---

## Quick Start

### 1. Run the Development Server
Start the built-in local static server (zero external packages required):
```bash
npm run dev
```
- Landing Page: [http://localhost:5173/](http://localhost:5173/)
- Tool Page: [http://localhost:5173/create.html](http://localhost:5173/create.html)

### 2. Run Tests
Execute the unit and smoke test suite using Node's built-in test runner:
```bash
npm test
```

To run end-to-end browser automation suites via Chromium DevTools Protocol (CDP):
```bash
node scripts/test-golden-path.js    # 12-step full student workflow E2E test
node scripts/test-defaults.js       # Pre-filled defaults & cascade hint test
node scripts/test-phase6-print.js   # Precision A4 vector print fidelity test
node scripts/test-responsive.js     # Multi-viewport responsive audit (360-1920px)
```

---

## Project Structure Overview

```text
cover-page-generator/
├── client/                     # Static client-side web application
│   ├── index.html              # Landing page
│   ├── create.html             # Interactive cover page generator tool
│   ├── cover-lab.html          # Static lab report template reference
│   ├── cover-assignment.html   # Static assignment template reference
│   ├── assets/                 # Static media (default institution logo)
│   ├── css/
│   │   ├── cover.css           # Exact A4 cover layout (FROZEN contract)
│   │   ├── site.css            # Global tokens, typography bump, base styles
│   │   ├── form.css            # Tool workspace grid, form controls, preview scaling
│   │   ├── landing.css         # Landing page hero cards and feature grid
│   │   └── print.css           # Print-to-PDF stylesheet (@page A4, chrome hidden)
│   ├── js/
│   │   ├── create.js           # Live preview binding, cascade, teachers, defaults
│   │   ├── storage.js          # Two-layer persistence (localStorage + IndexedDB)
│   │   ├── site.js             # Shared site behavior
│   │   └── main.js             # Client entry point
│   └── data/
│       └── dropdowns.json      # University, department, and course catalogue
├── docs/                       # Technical documentation and specifications
│   ├── PROJECT_SPEC.md         # Requirements, data models, and specifications
│   ├── ARCHITECTURE.md         # Technical architecture and design decisions
│   ├── DEVELOPMENT.md          # Developer onboarding, storage contracts, freeze rules
│   ├── TESTING.md              # Test execution guide and script inventory
│   ├── PROJECT_STATUS.md       # Implementation milestones and phase matrix
│   └── DESIGN_ANALYSIS.md      # Dual reference PDF comparative analysis
├── tests/                      # Automated test suites
│   ├── index.js                # Test runner entry
│   ├── smoke.test.js           # Structural and CSS/HTML invariant tests
│   └── unit.test.js            # Pure logic unit tests (defaults, cascade, migration)
├── scripts/                    # Development server and CDP test automation scripts
│   ├── dev-server.js           # Static HTTP dev server
│   ├── test-golden-path.js     # 12-step E2E student journey test
│   ├── test-defaults.js        # Defaults and cascade hint CDP test
│   ├── test-responsive.js      # Responsive multi-viewport capture script
│   ├── test-phase6-print.js    # Print-to-PDF fidelity test
│   └── analyze-print-pdf.py    # PyMuPDF vector PDF verification helper
└── reference/                  # Institutional reference PDFs and default logo
```

---

## Documentation Links
- [`docs/PROJECT_SPEC.md`](docs/PROJECT_SPEC.md) — Comprehensive product requirements and data schema.
- [`docs/DEVELOPMENT.md`](docs/DEVELOPMENT.md) — Development workflow, storage contracts, and freeze rules.
- [`docs/TESTING.md`](docs/TESTING.md) — Testing guide and CDP script inventory.
- [`docs/PROJECT_STATUS.md`](docs/PROJECT_STATUS.md) — Current implementation milestones and roadmap.
- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — Architecture and design decisions.
