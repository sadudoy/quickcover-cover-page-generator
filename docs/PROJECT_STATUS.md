# Quick Cover — Project Status & Roadmap

## 1. Project Phase Matrix

| Phase | Description | Status | Verification Notes |
| :--- | :--- | :--- | :--- |
| **Phase 01** | **Dual Reference Intake, Foundation & Analysis** | **IMPLEMENTED — VERIFIED** | Both reference PDFs verified and rasterized; dev server and comparative analysis complete. |
| **Phase 02** | **Static Cover Template & Exact CSS A4 Geometry** | **IMPLEMENTED — VERIFIED** | `cover.css` frozen at SHA-256 hash `055132E8...9320EE`, static lab/assignment covers verified pixel-accurate. |
| **Phase 03** | **Interactive Form, Live Preview & Persistence** | **IMPLEMENTED — VERIFIED** | Live preview data binding, course cascade, IndexedDB logo persistence with fallback, localStorage draft. |
| **Phase 04** | **Multiple Teachers: Dynamic List & Reference Alignment** | **IMPLEMENTED — VERIFIED** | Dynamic add/remove teacher rows, shared pinned signature line, dual-page layout match from reference. |
| **Phase 04.5/04.6** | **Quick Cover Rebrand & Design System Alignment** | **IMPLEMENTED — VERIFIED** | Clean design system tokens, landing page at `/index.html`, neutral shadows, inline SVGs, zero AI clichés. |
| **Phase 05** | **Persistence Polish: Reset, Feedback & Cross-Tab** | **IMPLEMENTED — VERIFIED** | Safe form reset, storage status feedback, QuotaExceededError handling, cross-tab sync via storage events. |
| **Phase 06** | **Export & Print Fidelity** | **IMPLEMENTED — VERIFIED** | `@page` A4 portrait print stylesheet (`print.css`), zero chrome leaks, vector Times New Roman text in PDF. |
| **Phase 07** | **Final Polish: Teacher Role Removal, Defaults, Logo, A11Y, Tests** | **IMPLEMENTED — NOT VERIFIED** | Teacher model simplified to `{ name, designation }`, default values pre-filled (BAUST/CSE/2/II), default logo bundled, responsive verified at 360/768/1280/1920px, WCAG AA contrast, unit test suite (node:test), 12-step golden path test. |

---

## 2. Deferred Features
The following capabilities were explicitly evaluated and deferred for future roadmaps:
1. **PNG / Image Export**: Print-to-PDF provides pure vector fidelity without canvas rasterization artifacts or memory spikes; client-side PNG canvas export deferred.
2. **Offline Progressive Web App (PWA)**: ServiceWorker caching and Web App Manifest deferred.
3. **Dark Mode UI**: Pure light theme matching physical paper editing context; automatic dark mode switching deferred.
4. **Teacher Role Custom Field**: Removed in Phase 7 to streamline cover layout; deferred if user requests custom role prefix support.
5. **"No Logo at All" Option**: Currently toggles between custom user logo and default BAUST institutional logo; completely blank header box option deferred.
6. **CSE Department Course Data Seeding**: CSE department currently has no seeded course entries in `dropdowns.json`; cascade hint is surfaced until data is populated.

---

## 3. Known Limitations
1. **A4 Dimension Tolerance**: Print-to-PDF dimensions render at 209.89mm × 297.01mm (~0.1mm under spec due to 72 pt/in rounding in browser engines).
2. **Browser Print Engine**: Export relies on native Chromium/browser print-to-PDF subsystem (`window.print()`).
3. **No User Accounts / Cloud Sync**: Drafts and logos are stored strictly on the local device (localStorage + IndexedDB).
4. **Catalogue Completeness**: `dropdowns.json` contains full course data for EEE; other departments (such as CSE) rely on manual typing with the cascade hint displayed.

---

## 4. Manual Actions Required Before Phase 8 (Deployment)
1. Ensure production static hosting serves root `/` as landing page and `/create.html` as the generator tool.
2. Verify MIME type headers (`image/png`, `text/css`, `application/json`) on host environment.
3. Confirm host does not alter static assets or inject scripts.
