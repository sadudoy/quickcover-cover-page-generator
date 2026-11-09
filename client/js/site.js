/**
 * Cover Craft — Shared Site Behavior
 */

const THEME_STORAGE_KEY = 'cc_theme';

export function getSavedTheme() {
  try {
    return localStorage.getItem(THEME_STORAGE_KEY) || 'light';
  } catch {
    return 'light';
  }
}

export function updateThemeLabels(theme) {
  const labels = document.querySelectorAll('.theme-toggle-label');
  labels.forEach((label) => {
    label.textContent = theme === 'dark' ? 'Light Mode' : 'Dark Mode';
  });

  const buttons = document.querySelectorAll('.theme-toggle-btn');
  buttons.forEach((btn) => {
    btn.setAttribute(
      'aria-label',
      theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'
    );
    btn.setAttribute(
      'title',
      theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'
    );
  });
}

export function applyTheme(theme) {
  if (typeof document === 'undefined') return;
  if (theme === 'dark') {
    document.documentElement.setAttribute('data-theme', 'dark');
  } else {
    document.documentElement.removeAttribute('data-theme');
  }
  updateThemeLabels(theme);
}

export function toggleTheme() {
  const current =
    document.documentElement.getAttribute('data-theme') === 'dark'
      ? 'dark'
      : 'light';
  const next = current === 'dark' ? 'light' : 'dark';
  try {
    localStorage.setItem(THEME_STORAGE_KEY, next);
  } catch {}
  applyTheme(next);
  return next;
}

// Immediate application to prevent flashing
if (typeof document !== 'undefined') {
  applyTheme(getSavedTheme());
}

document.addEventListener('DOMContentLoaded', () => {
  // Sync theme once DOM is fully parsed
  applyTheme(getSavedTheme());

  // Attach click listener to all theme toggle buttons
  const themeButtons = document.querySelectorAll('.theme-toggle-btn');
  themeButtons.forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      toggleTheme();
    });
  });

  const yearEl = document.getElementById('year');
  if (yearEl) {
    yearEl.textContent = String(new Date().getFullYear());
  }

  const toggleBtn = document.getElementById('mobile-menu-toggle');
  const navMenu = document.getElementById('main-nav');

  if (toggleBtn && navMenu) {
    toggleBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const isOpen = navMenu.classList.toggle('is-open');
      toggleBtn.setAttribute('aria-expanded', String(isOpen));
    });

    // Close menu when a link is clicked
    navMenu.querySelectorAll('a').forEach((link) => {
      link.addEventListener('click', () => {
        navMenu.classList.remove('is-open');
        toggleBtn.setAttribute('aria-expanded', 'false');
      });
    });

    // Close menu when clicking outside
    document.addEventListener('click', (event) => {
      if (
        navMenu.classList.contains('is-open') &&
        !navMenu.contains(event.target) &&
        !toggleBtn.contains(event.target)
      ) {
        navMenu.classList.remove('is-open');
        toggleBtn.setAttribute('aria-expanded', 'false');
      }
    });

    // Close menu on Escape key
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && navMenu.classList.contains('is-open')) {
        navMenu.classList.remove('is-open');
        toggleBtn.setAttribute('aria-expanded', 'false');
        toggleBtn.focus();
      }
    });
  }
});
