# Cover Craft — Testing Guide

## 1. Quick Start

Run the automated smoke and unit tests:
```bash
npm test
```
This executes `node --test tests/` (requiring Node.js v18+; no build step or test framework install needed).

---

## 2. Test Architecture & Suites

The project uses a three-tier test architecture:

1. **Unit Tests (`tests/unit.test.js`)**:
   - Built with native `node:test` and `node:assert`.
   - Tests pure functions in isolation without a DOM: course lookup, course code/title auto-fill, date formatting, draft serialization, draft migration (v1 scalar and legacy roles), versioning, teacher validation, default values application, cascade filtering, and cascade hint visibility rules.
   - Run via `npm test`.

2. **CDP Interaction & Integration Suites (`scripts/test-*-interactions.js`, `scripts/test-defaults.js`)**:
   - Uses headless Chromium via Chrome DevTools Protocol (CDP) WebSocket communication.
   - Tests live browser interactions: dynamic teacher add/remove, form inputs, datalist cascade behavior, localStorage draft persistence, IndexedDB logo persistence, cross-tab synchronization (`storage` event), QuotaExceededError handling, and "Start over" reset.

3. **Print Fidelity & End-to-End Golden Path (`scripts/test-phase6-print.js`, `scripts/test-golden-path.js`)**:
   - Uses CDP `Page.printToPDF` and PyMuPDF (`analyze-print-pdf.py`) to inspect the generated PDF.
   - Verifies exact A4 geometry (210mm × 297mm), single-page layout (0 page overflow), vector font embedding (Times New Roman), zero chrome leaks (no UI buttons, headers, or status text in print), and default/user logo rendering.
   - `test-golden-path.js` verifies the complete 12-step end-to-end student flow in one comprehensive test.

---

## 3. Scripts Inventory

| Script | Purpose | Needs Dev Server Running? |
| :--- | :--- | :--- |
| `scripts/dev-server.js` | Built-in zero-dependency static HTTP development server (port 5173). | N/A (Starts server) |
| `scripts/test-defaults.js` | Verifies default form values, draft override, and cascade hint visibility via CDP. | Self-starting |
| `scripts/test-golden-path.js` | Full 12-step student journey end-to-end test (defaults, edit, logo, print, reload, reset). | Self-starting |
| `scripts/test-responsive.js` | Responsive layout audit and screenshot capture at 360px, 768px, 1280px, and 1920px. | Self-starting |
| `scripts/test-accessibility.js` | WCAG AA contrast measurement, landmarks, label associations, and keyboard tab order pass. | Self-starting |
| `scripts/test-phase4-interactions.js` | Multi-teacher add/remove, last-entry guard, reload persistence, and schema migration test. | Self-starting |
| `scripts/test-phase5-interactions.js` | Persistence polish: reset confirmation, quota handling, and cross-tab synchronization. | Self-starting |
| `scripts/test-phase6-print.js` | Comprehensive print fidelity suite: A4 portrait, vector fonts, multi-teacher, logo. | Self-starting |
| `scripts/test-phase7-http.js` | Validates HTTP status codes (200 for assets, 404 for directory traversal attempts). | Self-starting |
| `scripts/verify-hardening.js` | Grep audit for console calls, debugger statements, TODOs, secrets, and inline event handlers. | No |
| `scripts/analyze-print-pdf.py` | PyMuPDF PDF analyzer (verifies page dimensions, vector fonts, expected text, chrome absence). | No |
| `scripts/render-cover.js` | Rasterizes static HTML cover references to PNG for visual diffing. | Self-starting |

---

## 4. Environment Requirements
- **Node.js**: v18.0.0 or later (v25.x tested).
- **Google Chrome**: Installed at default OS path (`C:\Program Files\Google\Chrome\Application\chrome.exe` on Windows).
- **Python**: Python 3.10+ with `pymupdf` installed (for PDF print analysis).
