/**
 * ui.js
 * UIController — manages status indicators, scroll, empty-state visibility,
 * the input textarea auto-resize, chip fill, and the send/stop button morphing.
 *
 * The sendBtn / stopBtn objects are compat shims: other modules set
 * `.style.display` on them and UIController translates that into the correct
 * #action-btn class mutations, preserving the original button-toggle semantics.
 */

import { $ } from "./utils.js";

export class UIController {
  /**
   * @param {import('./state.js').AppState} state
   */
  constructor(state) {
    this.state = state;
    this._messages = $("messages");
    this._input = $("input");
    this._actionBtn = $("action-btn");
    this._btnState = { sendVisible: true, stopVisible: false };

    const self = this;

    /** Proxy object — callers set .style.display to show/hide send affordance. */
    this.sendBtn = {
      _disabled: false,
      style: {
        set display(v) {
          self._btnState.sendVisible = v !== "none";
          if (self._btnState.sendVisible) self._btnState.stopVisible = false;
          self._syncActionBtn();
        },
        get display() { return self._btnState.sendVisible ? "" : "none"; },
      },
      set disabled(v) {
        this._disabled = v;
        if (!self._btnState.stopVisible) self._actionBtn.disabled = v;
      },
      get disabled() { return this._disabled; },
    };

    /** Proxy object — callers set .style.display to show/hide stop affordance. */
    this.stopBtn = {
      style: {
        set display(v) {
          self._btnState.stopVisible = v !== "none";
          if (self._btnState.stopVisible) self._btnState.sendVisible = false;
          self._syncActionBtn();
        },
        get display() { return self._btnState.stopVisible ? "flex" : "none"; },
      },
    };

    this._messages.addEventListener("scroll", () => {
      $("topbar").classList.toggle("scrolled", this._messages.scrollTop > 4);
    });
  }

  /**
   * Synchronize #action-btn classes with the current send/stop proxy state.
   * Called automatically whenever sendBtn or stopBtn display is changed.
   */
  _syncActionBtn() {
    if (this._btnState.stopVisible) {
      this._actionBtn.classList.add("is-stop");
      this._actionBtn.classList.remove("is-empty");
      this._actionBtn.disabled = false;
      this._actionBtn.setAttribute("aria-label", "Stop generation");
    } else {
      this._actionBtn.classList.remove("is-stop");
      this._actionBtn.setAttribute("aria-label", "Send message");
      const isEmpty = this._input.value.trim() === "" && !this.state.attachment;
      this._actionBtn.classList.toggle("is-empty", isEmpty);
      this._actionBtn.disabled = isEmpty;
    }
  }

  /**
   * Update the status dot and label in the sidebar footer.
   * @param {string} txt - Human-readable status, e.g. "Ready", "Thinking…"
   */
  setStatus(txt) {
    $("status-text").textContent = txt;
    const dot = $("logo-dot");
    if (txt === "Ready") {
      dot.className = "idle";
      dot.style.background = "var(--success)";
    } else if (txt === "Error" || txt === "Cancelled") {
      dot.className = "";
      dot.style.background = "var(--error)";
    } else {
      dot.className = "";
      dot.style.background = "var(--accent)";
    }
  }

  /** Scroll the message list to the bottom. */
  scrollBottom() {
    this._messages.scrollTop = this._messages.scrollHeight;
  }

  /** Remove the #empty hero and exit is-empty layout mode. */
  hideEmpty() {
    const e = $("empty");
    if (e) e.remove();
    $("main-col").classList.remove("is-empty");
  }

  /** Enter is-empty layout mode (centered hero + input bar). */
  showEmptyMode() {
    $("main-col").classList.add("is-empty");
  }

  /**
   * Fill the input textarea with a suggestion and focus it.
   * @param {string} text
   */
  fillInput(text) {
    this._input.value = text;
    this._input.focus();
    this.autoResize();
    this._syncActionBtn();
  }

  /** Auto-resize the textarea to fit its content (up to max-height). */
  autoResize() {
    this._input.style.height = "auto";
    const h = Math.min(this._input.scrollHeight, 220);
    this._input.style.height = h + "px";
    this._input.classList.toggle("is-overflowing", this._input.scrollHeight > 220);
  }
}
