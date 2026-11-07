# Quick Cover — Project Status & Roadmap

## 1. Project Phase Matrix

| Phase | Description | Status | Verification Notes |
| :--- | :--- | :--- | :--- |
| **Phase 01** | **Dual Reference Intake, Foundation & Analysis** | **COMPLETE — VERIFIED** | Both reference PDFs verified and rasterized; dev server and comparative analysis complete. |
| **Phase 02** | **Static Cover Template & Exact CSS A4 Geometry** | **COMPLETE — VERIFIED** | `cover.css` frozen at SHA-256 hash `055132E8...9320EE`, static lab/assignment covers verified pixel-accurate. |
| **Phase 03** | **Interactive Form, Live Preview & Persistence** | **COMPLETE — VERIFIED** | Live preview data binding, course cascade, IndexedDB logo persistence with fallback, localStorage draft. |
| **Phase 04** | **Multiple Teachers: Dynamic List & Reference Alignment** | **COMPLETE — VERIFIED** | Dynamic add/remove teacher rows, shared pinned signature line, dual-page layout match from reference. |
| **Phase 04.5/04.6** | **Quick Cover Rebrand & Design System Alignment** | **COMPLETE — VERIFIED** | Clean design system tokens, landing page at `/index.html`, neutral shadows, inline SVGs, zero AI clichés. |
| **Phase 05** | **Persistence Polish: Reset, Feedback & Cross-Tab** | **COMPLETE — VERIFIED** | Safe form reset, storage status feedback, QuotaExceededError handling, cross-tab sync via storage events. |
| **Phase 06** | **Export & Print Fidelity** | **COMPLETE — VERIFIED** | `@page` A4 portrait print stylesheet (`print.css`), zero chrome leaks, vector Times New Roman text in PDF. |
| **Phase 07** | **Final Polish: Teacher Role Removal, Defaults, Logo, A11Y, Tests** | **COMPLETE — VERIFIED** | Teacher model simplified to `{ name, designation }`, default values pre-filled (BAUST/CSE/2/II), default logo bundled, responsive verified at 360/768/1280/1920px, WCAG AA contrast, unit test suite (node:test), 12-step golden path test. |
| **Phase 07B** | **UI Redesign, Logo Fix & Responsive Polish** | **COMPLETE — VERIFIED** | Restored modern SaaS aesthetic, rigidly constrained logo box (`36.78mm × 35.97mm`), dynamic course code cascade placeholder, zero layout bleed, 100% test pass. |
| **Phase 08** | **Final Regression, Deployment Prep & Handover** | **COMPLETE — VERIFIED** | System-wide regression verified, `cover.css` SHA-256 contract intact, production static deployment guides created (`docs/HANDOVER.md`), README updated, ready to deploy. |

---

## 2. Deferred Features
The following capabilities were explicitly evaluated and deferred for future roadmaps:
1. **PNG / Image Export**: Print-to-PDF provides pure vector fidelity without canvas rasterization artifacts or memory spikes; client-side PNG canvas export deferred.
2. **Offline Progressive Web App (PWA)**: ServiceWorker caching and Web App Manifest deferred.
3. **Dark Mode UI**: Pure light theme matching physical paper editing context; automatic dark mode switching deferred.
4. **Teacher Role Custom Field**: Removed in Phase 7 to streamline cover layout; deferred if user requests custom role prefix support.
5. **"No Logo at All" Option**: Currently toggles between custom user logo and default BAUST institutional logo; completely blank header box option deferred.

---

## 3. Known Limitations & Notes
1. **A4 Dimension Tolerance**: Print-to-PDF dimensions render at 209.89mm × 297.01mm (~0.1mm under spec due to 72 pt/in rounding in browser engines).
2. **Browser Print Engine**: Export relies on native Chromium/browser print-to-PDF subsystem (`window.print()`). Users select "Save as PDF" destination in the browser print dialog to generate vector PDF files.
3. **No User Accounts / Cloud Sync**: Drafts and logos are stored strictly on the local device (localStorage + IndexedDB). Zero data is transmitted to remote servers.
4. **Catalogue Completeness (CSE Courses Pending)**: `dropdowns.json` contains full course data for EEE. The CSE department currently has no seeded course entries, so the cascade hint ("No preset courses...") displays and allows students to type course codes directly. Users can seed CSE courses at any time by following [`docs/HANDOVER.md`](HANDOVER.md).

---

## 4. Deployment Readiness
- **Status**: **READY TO DEPLOY**
- **Hosting**: Direct static hosting via Netlify, Vercel, GitHub Pages, or any static HTTP file server.
- **Build Requirement**: 0 build steps.
