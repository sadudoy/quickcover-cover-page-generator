/**
 * Cover Craft — Shared Site Behavior
 */

document.addEventListener('DOMContentLoaded', () => {
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
