# Quick Cover — Handover & Maintenance Guide

Welcome to **Quick Cover**! This document is the definitive guide for maintaining, updating, and deploying the Quick Cover application.

---

## 1. Architecture Overview

Quick Cover is a 100% client-side, zero-dependency web application:
- **No Node.js runtime required in production**: The entire app runs directly inside the end-user's web browser.
- **Zero build step**: No Webpack, Vite, Rollup, or Babel needed. All code is authored in standard vanilla HTML5, CSS3, and native ES modules.
- **Deployable anywhere**: Because all production code lives in `client/`, deploying consists of serving that single directory via any static HTTP web server or host.

---

## 2. How to Update Course Data (`dropdowns.json`)

All university, department, and course suggestions are stored in [`client/data/dropdowns.json`](file:///d:/CSE/Projects/cover-page-generator/client/data/dropdowns.json).

### 2.1 File Structure
The file contains three root arrays:
```json
{
  "universities": [ ... ],
  "departments": [ ... ],
  "courses": [ ... ]
}
```

### 2.2 Adding or Updating Departments
Each department object requires:
- `code`: Unique identifier string (e.g., `"CSE"`, `"EEE"`, `"ME"`, `"CE"`).
- `name`: Full display name (e.g., `"Department of Computer Science and Engineering"`).

Example:
```json
{
  "code": "CSE",
  "name": "Department of Computer Science and Engineering"
}
```

### 2.3 Adding Courses (e.g. for CSE, ME, CE)
Every course entry in the `"courses"` array must have all five required keys:
- `code`: The course code string (e.g., `"CSE 2201"` or `"CSE-2201"`).
- `title`: The course title string (e.g., `"Object Oriented Programming"`).
- `dept`: The department code matching an entry in `"departments"` (e.g., `"CSE"`).
- `level`: The academic level string (`"1"`, `"2"`, `"3"`, or `"4"`).
- `term`: The academic term string (`"I"` or `"II"`).

Example entry:
```json
{
  "code": "CSE 2201",
  "title": "Computer Architecture",
  "dept": "CSE",
  "level": "2",
  "term": "II"
}
```

### 2.4 Data Integrity Rules
- Every `course.dept` must match an existing `department.code`.
- Values are case-insensitive when searched in the application, but consistent uppercase format is recommended for codes.
- Run `npm test` after editing `dropdowns.json` to verify schema compliance automatically.

---

## 3. How to Update Pre-Filled Defaults

When a new user visits `/create.html` for the first time (or clicks "Reset" / "Start over"), default values are automatically loaded into the form.

### 3.1 Changing Default Text Values
All default form values are defined at the top of [`client/js/create.js`](file:///d:/CSE/Projects/cover-page-generator/client/js/create.js):

```javascript
export const DEFAULT_FORM_VALUES = Object.freeze({
  university: 'Bangladesh Army University of Science and Technology (BAUST), Saidpur',
  department: 'Department of Computer Science and Engineering (CSE)',
  level: '2',
  term: 'II'
});
```

To change any default:
1. Open `client/js/create.js`.
2. Update the corresponding string inside `DEFAULT_FORM_VALUES`.
3. If changing defaults, update unit test expectations in `tests/unit.test.js` to match.

### 3.2 Updating the Default Institution Logo
- The default institution logo is stored as a PNG at [`client/assets/default-logo.png`](file:///d:/CSE/Projects/cover-page-generator/client/assets/default-logo.png).
- To replace the default logo:
  1. Prepare your institutional logo image (PNG format recommended, transparent background).
  2. Overwrite `client/assets/default-logo.png`.
  3. Ensure the file dimensions remain within reason (e.g., 200px to 800px wide). The CSS automatically constrains the image to fit within the `36.78mm × 35.97mm` bounding box without distortion.

---

## 4. How Print Export Works & The `cover.css` Freeze Contract

### 4.1 Print Mechanism
- Quick Cover uses native browser vector printing via `window.print()`.
- When the user clicks **"Print / Save as PDF"**:
  1. `window.print()` triggers the browser's native print engine.
  2. [`client/css/print.css`](file:///d:/CSE/Projects/cover-page-generator/client/css/print.css) activates under `@media print`.
  3. `print.css` hides all UI chrome (`.site-header`, `.form-panel`, `.site-footer`, buttons, and status notices).
  4. The preview container un-scales, and the `#cover-preview .a4-cover` sheet expands to exact physical A4 portrait dimensions (`210mm × 297mm`).
  5. The resulting PDF is 100% vector text (Times New Roman) and crisp images on exactly 1 page.

### 4.2 The `cover.css` Freeze Contract (CRITICAL)
- [`client/css/cover.css`](file:///d:/CSE/Projects/cover-page-generator/client/css/cover.css) contains the exact physical geometry, margins, border positions, and font sizes matching institutional standards.
- **NEVER MODIFY `client/css/cover.css`** unless you explicitly intend to change the printed cover layout for all documents.
- Any UI or editor styling changes should be made exclusively in [`client/css/form.css`](file:///d:/CSE/Projects/cover-page-generator/client/css/form.css) or [`client/css/site.css`](file:///d:/CSE/Projects/cover-page-generator/client/css/site.css).

---

## 5. Deployment Instructions

Because the application is 100% static, deployment takes less than two minutes.

### 5.1 Deploying to Netlify (Recommended)

#### Option A: Drag-and-Drop (Instant)
1. Go to [app.netlify.com](https://app.netlify.com).
2. Drag the `client/` folder directly into the Netlify "Sites" drop zone.
3. Your site is live immediately!

#### Option B: Git-Integrated Continuous Deployment
1. Push your repository to GitHub, GitLab, or Bitbucket.
2. In Netlify, click **"Add new site" > "Import an existing project"**.
3. Configure build settings:
   - **Base directory**: Leave blank.
   - **Build command**: Leave blank (no build step!).
   - **Publish directory**: `client`
4. Click **Deploy Site**.

### 5.2 Deploying to Vercel

#### Via Vercel Web Dashboard
1. Go to [vercel.com/new](https://vercel.com/new).
2. Import your GitHub repository.
3. In **Project Settings**:
   - **Framework Preset**: `Other`
   - **Root Directory**: `client`
   - **Build Command**: None (leave empty)
   - **Output Directory**: Leave empty
4. Click **Deploy**.

#### Via Vercel CLI
```bash
npm install -g vercel
vercel deploy --prod client
```

### 5.3 Deploying to GitHub Pages
1. In your GitHub repository settings, navigate to **Pages**.
2. Under **Build and deployment > Source**, select **Deploy from a branch**.
3. Select your branch and set the folder to `/ (root)` or use a GitHub Action that publishes the `client/` folder to the `gh-pages` branch.

### 5.4 Deploying to Firebase Hosting
Firebase configuration (`firebase.json` with `"public": "client"`) is already included:
```bash
npm install -g firebase-tools
firebase login
firebase deploy
```

---

## 6. Local Development & Verification

### Running Locally
```bash
npm run dev
```
Open [http://localhost:5173/](http://localhost:5173/) in any modern browser.

### Running Automated Regression Tests
```bash
npm test
```
All 67 tests should report green passes.

### Running End-to-End CDP Suites
```bash
node scripts/test-golden-path.js    # 12-step full student workflow
node scripts/test-phase6-print.js   # PDF print fidelity validation
```
