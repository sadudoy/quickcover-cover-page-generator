<div align="center">
  <img src="client/assets/logo.png" alt="Cover Craft Logo" width="120" />
  <h1>Cover Craft</h1>
  <p><strong>A professional A4 cover page generator for university assignments and lab reports.</strong></p>
  <p>
    <a href="https://covercraftgo.web.app/"><strong>Live Demo</strong></a>
  </p>
  <br />
  <img src="client/assets/hero.png" alt="Cover Craft Application Preview" width="850" />
</div>

---

## Overview

Cover Craft is a client-side web application engineered to generate standardized, print-ready university assignment and lab report cover pages with exact institutional precision. Operating entirely within the browser, it renders a real-time ISO A4 preview (210mm x 297mm) and exports pixel-perfect, single-page vector PDFs without page overflows or print chrome artifacts. The application features dynamic multi-teacher management, an intelligent cascading course catalogue, automatic draft persistence via LocalStorage, and a fully responsive interface tailored for both desktop workstations and mobile devices.

---

## Features

- **Exact A4 Print and PDF Fidelity**: Conforms strictly to ISO A4 physical dimensions (210mm x 297mm). Exports crisp vector PDFs through the browser print dialog with zero header/footer leaks and no trailing blank pages.
- **Dual Document Layouts**: Switch seamlessly between **Lab Report** (includes Experiment Date) and **Assignment** document formats with appropriate metadata alignment.
- **Dynamic Multi-Teacher Support**: Add, edit, or remove multiple instructors. The layout automatically balances card heights and maintains an anchored signature line.
- **Cascading Course Catalogue**: Dynamically filters course codes and titles by selected department, level, and term, with bidirectional autofill between course codes and titles.
- **Mobile-Optimized Input Controls**: Dynamically provides native picker dropdowns on mobile screens for effortless selection, with fallback to manual typing when required.
- **Client-Side Draft Persistence**: Automatically debounces and saves drafts to LocalStorage, ensuring work is preserved across browser refreshes and tab sessions.
- **Custom Institutional Branding**: Supports custom institution logo uploads with local persistence, alongside pre-configured institutional defaults.
- **Zero External Dependencies**: Operates with zero build tooling, zero package managers at runtime, and no external framework overhead.

---

## Tech Stack

| Component | Technology | Details |
| :--- | :--- | :--- |
| **Markup** | HTML5 | Semantic structure, accessible landmarks, and ARIA live regions |
| **Styling** | CSS3 | Native CSS custom properties, Flexbox, CSS Grid, `@page`, and print media queries |
| **Logic** | JavaScript (ES Modules) | Standard modern ES modules without bundlers or transpilation |
| **Persistence** | Web Storage & IndexedDB | LocalStorage for form drafts; IndexedDB for uploaded image blobs |
| **Deployment** | Firebase Hosting | Global CDN distribution with HTTPS enforcement |

> Cover Craft requires **zero build steps** and **zero runtime dependencies**. All rendering, state management, and export routines execute natively in any standard modern web browser.

---

## Getting Started

### Prerequisites

- A modern web browser (Google Chrome, Mozilla Firefox, Microsoft Edge, or Apple Safari).
- [Node.js](https://nodejs.org/) (version 18 or higher) for the local static development server.

### Local Development Setup

1. **Clone the repository:**
   ```bash
   git clone https://github.com/sadudoy/QuickCover-cover-page-generator
   cd cover-page-generator
   ```

2. **Install dependencies (optional):**
   The project has no external runtime dependencies. To run the automated verification and testing suites, install the development dependencies:
   ```bash
   npm install
   ```

3. **Start the local development server:**
   ```bash
   npm run dev
   ```

4. **Access the application:**
   Open your browser and navigate to:
   - **Landing Page:** [http://localhost:5173/](http://localhost:5173/)
   - **Workspace:** [http://localhost:5173/create.html](http://localhost:5173/create.html)

### Testing

Run the automated test suite using Node's native test runner:

```bash
npm test
```

---
## Author

### Sad Ibna Forid


- **GitHub:** [Visit my GitHub](https://github.com/sadudoy)
- **LinkedIn:** [Connect with me](https://linkedin.com/in/sadudoy)
- **Email:** [Send me an email](mailto:sadudoy29@gmail.com)

---

[![GitHub](https://img.shields.io/badge/GitHub-181717?style=for-the-badge&logo=github&logoColor=white)](https://github.com/sadudoy)
[![LinkedIn](https://img.shields.io/badge/LinkedIn-0A66C2?style=for-the-badge&logo=linkedin&logoColor=white)](https://linkedin.com/in/sadudoy)
[![Email](https://img.shields.io/badge/Email-EA4335?style=for-the-badge&logo=gmail&logoColor=white)](mailto:sadudoy29@gmail.com)

<div align="center">
  <p>© 2026 Cover Craft. All rights reserved.</p>
</div>
