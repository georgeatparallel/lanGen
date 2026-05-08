/**
 * sidebar.js
 * Sidebar — open/close/toggle for both mobile (slide-in drawer) and
 * desktop (collapsible panel). Restores the last desktop state from localStorage.
 */

import { $ } from "./utils.js";

export class Sidebar {
  constructor() {
    this._sb = $("session-sidebar");
    this._overlay = $("sidebar-overlay");
    this._restoreDesktopState();
  }

  /** @returns {boolean} True when the viewport is mobile-sized. */
  isMobile() {
    return window.matchMedia("(max-width: 768px)").matches;
  }

  /** Open the sidebar (slide in on mobile, un-collapse on desktop). */
  open() {
    if (this.isMobile()) {
      this._sb.classList.add("open");
      this._overlay.classList.add("open");
    } else {
      this._sb.classList.remove("collapsed");
      localStorage.setItem("sidebar-collapsed", "0");
    }
  }

  /** Close the sidebar (slide out on mobile, collapse on desktop). */
  close() {
    if (this.isMobile()) {
      this._sb.classList.remove("open");
      this._overlay.classList.remove("open");
    } else {
      this._sb.classList.add("collapsed");
      localStorage.setItem("sidebar-collapsed", "1");
    }
  }

  /** Toggle between open and closed. */
  toggle() {
    if (this.isMobile()) {
      this._sb.classList.contains("open") ? this.close() : this.open();
    } else {
      this._sb.classList.contains("collapsed") ? this.open() : this.close();
    }
  }

  /** Restore the desktop collapsed state saved in localStorage. */
  _restoreDesktopState() {
    if (!this.isMobile() && localStorage.getItem("sidebar-collapsed") === "1") {
      this._sb.classList.add("collapsed");
    }
  }
}
