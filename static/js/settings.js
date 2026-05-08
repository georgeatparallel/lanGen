/**
 * settings.js
 * Settings — open/close the settings modal, handle tab navigation,
 * and persist settings back into app state on save.
 */

import { $ } from "./utils.js";

export class Settings {
  /**
   * @param {import('./state.js').AppState} state
   */
  constructor(state) {
    this.state = state;
    this._panel = $("settings-panel");

    for (const navItem of document.querySelectorAll(".settings-nav-item")) {
      navItem.addEventListener("click", () => this._switchTab(navItem));
    }

    for (const toggle of document.querySelectorAll(".toggle")) {
      toggle.addEventListener("click", () => toggle.classList.toggle("on"));
    }
  }

  /** Open the settings panel, pre-filling the system prompt field. */
  open() {
    $("sys-input").value = this.state.system;
    this._panel.classList.add("open");
  }

  /** Close the settings panel without saving. */
  close() {
    this._panel.classList.remove("open");
  }

  /**
   * Close if the click target is the backdrop overlay (not the modal box itself).
   * @param {MouseEvent} e
   */
  closeOnBackdrop(e) {
    if (e.target === this._panel) this.close();
  }

  /** Save settings from the modal back into app state, then close. */
  save() {
    this.state.system = $("sys-input").value.trim();
    this.close();
  }

  /**
   * Activate a settings tab by nav item.
   * @param {HTMLElement} navItem
   */
  _switchTab(navItem) {
    const tab = navItem.dataset.tab;
    for (const n of document.querySelectorAll(".settings-nav-item")) {
      n.classList.toggle("active", n === navItem);
    }
    for (const p of document.querySelectorAll(".settings-pane")) {
      p.classList.toggle("active", p.dataset.pane === tab);
    }
    $("settings-pane-title").textContent = navItem.textContent.trim();
  }
}
