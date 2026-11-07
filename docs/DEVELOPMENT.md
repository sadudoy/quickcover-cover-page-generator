# Quick Cover — Development Guide

## 1. Prerequisites
- **Node.js**: v18.0.0 or later (v25.x tested).
- **npm**: v9.0.0 or later (v11.x tested).
- Modern web browser supporting ES Modules and standard CSS `@page` printing (Chrome, Edge, Firefox, Safari).

---

## 2. No Build Step Contract
> **Important**: Quick Cover has **NO BUILD STEP**.
> There is no Webpack, Vite, Rollup, Babel, PostCSS, or Tailwind compiler.
> Files in `client/` are standard HTML, CSS, and ES modules that run directly and immediately in the browser runtime.

---

## 3. Running the Local Development Server
To launch the dependency-free static dev server:
```bash
npm run dev
```
- By default, the server listens at **`http://localhost:5173`**.
- It serves the `./client` directory as the web root.
- The port can be customized via `PORT=3000 npm run dev`.
- The dev server includes MIME type detection (`text/javascript`, `image/png`, `text/css`, etc.) and strict path-traversal prevention (`404` / `403` on traversal attempts).

---

## 4. Running Tests
Quick Cover uses Node's native test runner (`node:test`) and strict assertions (`node:assert/strict`):
```bash
npm test
```
See [`docs/TESTING.md`](file:///d:/CSE/Projects/cover-page-generator/docs/TESTING.md) for full test suites and CDP automated interaction scripts.

---

## 5. Storage Architecture

### Two-Layer Persistence
1. **Form Draft Storage (`localStorage`)**:
   - Stored under key `covercraft-draft-v1`.
   - Serialized as versioned JSON: `{ draftVersion: 2, docType, university, department, level, term, courseCode, courseTitle, docNumber, docTitle, comment, studentName, studentId, experimentDate, submissionDate, teachers }`.
   - Debounced at 500ms on user input.
   - Guarded against cross-tab ping-pong loops via `isApplyingRemoteChange`.

2. **Logo Storage (`IndexedDB` with `localStorage` Fallback)**:
   - Primary: Stored as raw binary `Blob` in IndexedDB (`covercraft-db`, store `logos`, key `covercraft-logo`).
   - Fallback: If IndexedDB is blocked (e.g. private/incognito mode), automatically stores base64 data URL under localStorage key `covercraft-logo-fallback-v1`.
   - Max file size: 2 MB.

### `loadDraft()` Return Contract
`loadDraft()` in `client/js/storage.js` returns a structured result object:
```javascript
{
  status: 'ok' | 'empty' | 'corrupt' | 'newer_version' | 'unavailable',
  data: object | null,
  version?: number
}
```
- `'ok'`: Valid draft returned in `data`.
- `'empty'`: No draft exists in storage.
- `'corrupt'`: JSON parse failed; corrupted draft is automatically pruned.
- `'newer_version'`: Draft version > 2 (newer app version created it).
- `'unavailable'`: `localStorage` is disabled or threw a security exception.

---

## 6. Teacher Data Model

In Phase 7, the teacher model was simplified to remove the "Role" field:
```javascript
teachers = [
  { name: 'Dr. Jane Smith', designation: 'Professor' }
];
```
- Each teacher row has two inputs: **Name** and **Designation** (with `<datalist id="teacher-designations-list">`).
- **Remove button**: Disabled when only 1 teacher entry remains.
- **Preview rendering**: Always displays `Teacher Name: <name>` (never a role prefix). If designation is provided, displays `Designation: <designation>`.
- **Backward Migration**: Legacy v1 scalar drafts (`{ teacherName, teacherDesignation }`) and v2 drafts containing `role` properties are silently accepted on load and rewritten without role on next save.

---

## 7. Form Defaults & Cascade Hints

### `DEFAULT_FORM_VALUES`
Pre-filled starting values for new visitors:
```javascript
export const DEFAULT_FORM_VALUES = {
  university: 'Bangladesh Army University of Science and Technology (BAUST), Saidpur',
  department: 'Department of Computer Science and Engineering (CSE)',
  level: '2',
  term: 'II'
};
```
- **Application Rule**: Defaults apply **ONLY** when no draft exists (`loadDraft().status === 'empty'`).
- If a returning student has saved an explicit blank value, the blank value is respected and defaults are **not** re-applied.
- **"Start over"**: Resets default fields to `DEFAULT_FORM_VALUES` (university, department, level, term) and blanks all other fields. Status updates to `"Reset to defaults."`.

### Cascade Hint Visibility
The cascade hint (`#cascade-hint`) appears under the Course Code field:
- **Visible ONLY when**:
  1. Department input is non-empty AND matches a known department in `dropdowns.json`.
  2. The filtered courses list for that department, level, and term is empty (`length === 0`).
- **Hidden when**: Filtered list has courses, department input is empty, or department is not recognized in the catalogue.

---

## 8. Institution Logo State Machine

The preview institution logo operates across three states:
1. `'user'`: User has uploaded a custom image. Rendered from blob object URL or storage fallback.
2. `'default'`: No user logo uploaded. Renders bundled asset `/assets/default-logo.png` (copied from `reference/defaultLogo/logo.png`).
3. `'none'`: Neither user logo nor default logo image is available (e.g. image 404). Defensive fallback displays inline SVG placeholder.

### Logo Actions
- **Upload**: Validates image type and 2 MB size limit. Saves to storage and updates preview. Surfaces `"Logo saved."` (or `"Logo saved (fallback storage)."` if fallback path was used).
- **Reset Logo**: Replaces the old "Remove logo" action. Deletes stored user logo and reverts preview to `/assets/default-logo.png`. Surfaces `"Logo reset to default."`.

---

## 9. Cover Freeze Contract & Print Architecture

### `cover.css` Freeze Contract
- `client/css/cover.css` is **FROZEN** at SHA-256 hash `055132E855624DF5B83BD91D2E819BBAFAE34CEC0BF5E03064F6AA0D689320EE`.
- All tool chrome and editor styles are strictly isolated in `client/css/form.css` and `client/css/site.css`.
- The `.a4-cover` DOM structure inside `create.html` mirrors the static references `cover-lab.html` and `cover-assignment.html`.

### Print Stylesheet (`client/css/print.css`)
- Defines `@page { size: A4 portrait; margin: 0; }`.
- In `@media print`, hides all browser chrome (`.site-header`, `.form-panel`, `.site-footer`, `.preview-toolbar`, `.editor-note`).
- Resets preview container scaling: `#cover-preview { transform: none !important; }`.
- Ensures the printed output is a single 210mm × 297mm sheet containing pure vector Times New Roman text and crisp institution logos.
