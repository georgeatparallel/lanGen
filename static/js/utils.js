/**
 * utils.js
 * Pure utilities with no side effects and no DOM dependencies beyond
 * document.getElementById. Safe to import from any module.
 */

/**
 * Shorthand for document.getElementById.
 * @param {string} id
 * @returns {HTMLElement|null}
 */
export const $ = id => document.getElementById(id);

/**
 * Escape a string for safe HTML insertion.
 * @param {string} str
 * @returns {string}
 */
export function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Write a cookie with a given lifetime.
 * @param {string} name
 * @param {string} value
 * @param {number} days
 */
export function setCookie(name, value, days) {
  const d = new Date();
  d.setTime(d.getTime() + days * 86400000);
  document.cookie = `${name}=${value};expires=${d.toUTCString()};path=/;SameSite=Lax`;
}

/**
 * Read a cookie value by name.
 * @param {string} name
 * @returns {string}
 */
export function getCookie(name) {
  const v = document.cookie.match("(^|;)\\s*" + name + "\\s*=\\s*([^;]+)");
  return v ? v.pop() : "";
}

/**
 * Strip numbered source link footnotes appended by the backend.
 * @param {string} text
 * @returns {string}
 */
export function stripSourceLinks(text) {
  return text.replace(/\n\n\d+\.\s+\[.*?\]\(https?:\/\/[^)]+\)/g, "");
}
