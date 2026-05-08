/**
 * history.js
 * HistoryRenderer — re-renders the full conversation from state.history,
 * manages the empty-state hero HTML, and provides the clearChat action.
 */

import { stripSourceLinks } from "./utils.js";

/** Static HTML for the empty-state hero. Chips use data-fill for event delegation. */
export const EMPTY_HTML = `<div id="empty">
  <div class="empty-icon">
    <svg><use href="/static/icon-full.svg"/></svg>
  </div>
  <div class="empty-title">How can I help today?</div>
  <div class="empty-hint">Web search · Image generation · Multimodal · 100% local</div>
  <div class="empty-chips">
    <button class="chip" data-fill="Search for the latest AI news">Search AI news</button>
    <button class="chip" data-fill="Generate an image of a futuristic city at night">Generate an image</button>
    <button class="chip" data-fill="Explain how transformers work in machine learning">Explain transformers</button>
  </div>
</div>`;

export class HistoryRenderer {
  /**
   * @param {import('./state.js').AppState} state
   * @param {import('./renderer.js').ChatRenderer} renderer
   * @param {import('./ui.js').UIController} ui
   */
  constructor(state, renderer, ui) {
    this.state = state;
    this.renderer = renderer;
    this.ui = ui;
    this._messages = document.getElementById("messages");
  }

  /**
   * Re-render the entire conversation from state.history.
   * Replaces all message DOM, then post-processes images/videos/sources.
   */
  renderHistory() {
    this._messages.innerHTML = "";
    if (this.state.history.length === 0) {
      this._messages.innerHTML = EMPTY_HTML;
      this.ui.showEmptyMode();
      return;
    }
    document.getElementById("main-col").classList.remove("is-empty");

    let assistantHasImage = false;
    for (const msg of this.state.history) {
      if (msg.role === "user") {
        const div = document.createElement("div");
        div.className = "msg user";
        const bubble = document.createElement("div");
        bubble.className = "bubble";
        const el = document.createElement("div");
        el.innerHTML = marked.parse(msg.content || "");
        this.renderer.postProcessImages(el);
        bubble.appendChild(el);
        div.innerHTML = `<div class="avatar">U</div>`;
        div.appendChild(bubble);
        this._messages.appendChild(div);
        this.ui.hideEmpty();
      } else if (msg.role === "assistant") {
        if (!msg.content) continue;
        this.ui.hideEmpty();
        const div = document.createElement("div");
        div.className = "msg ai";
        const el = document.createElement("div");
        el.innerHTML = marked.parse(stripSourceLinks(msg.content || ""));
        const bubble = document.createElement("div");
        bubble.className = "bubble";
        bubble.appendChild(el);
        div.innerHTML = `<div class="avatar"><svg><use href="/static/icon-compact.svg"/></svg></div>`;
        div.appendChild(bubble);
        this._messages.appendChild(div);
        assistantHasImage = this.renderer.postProcessImages(bubble) || assistantHasImage;
        this.renderer.postProcessVideos(bubble);
        if (msg.sources && msg.sources.length) {
          this.renderer.renderSources(bubble, msg.sources);
        }
      } else if (msg.role === "tool") {
        this.ui.hideEmpty();
        const div = document.createElement("div");
        div.className = "msg tool-result";
        const resultText = msg.content || "";
        let displayText = resultText;
        let fallbackImg = null;
        try {
          const parsed = JSON.parse(resultText);
          displayText = parsed.text || "";
          fallbackImg = parsed.url || null;
        } catch { /* plain text */ }
        div.innerHTML = `<div class="avatar"></div><div class="bubble"><span style="color:var(--fg-faint);font-size:0.8em;font-family:monospace;">&#x2713; Tool result</span></div>`;
        this._messages.appendChild(div);

        if (fallbackImg && !assistantHasImage) {
          const bubble = div.querySelector(".bubble");
          const img = document.createElement("img");
          img.className = "gen-image";
          img.src = fallbackImg;
          img.alt = "";
          img.title = "Click to open full size";
          img.onclick = () => { const w = window.open(); w.document.write(`<img src="${img.src}" style="max-width:100%">`); };
          img.onerror = () => { const w = img.closest(".gen-image-wrap") || img.parentElement; if (w) w.remove(); };
          this.renderer._wrapImage(img, fallbackImg, bubble);
        } else if (displayText) {
          const el = document.createElement("div");
          el.innerHTML = marked.parse(displayText);
          div.querySelector(".bubble").appendChild(el);
        }
      }
    }
  }

  /**
   * Wipe the current conversation (local only — does not call the server).
   * Shows the empty-state hero and resets status.
   */
  clearChat() {
    if (!confirm("Clear all messages? This cannot be undone.")) return;
    this.state.history = [];
    this._messages.innerHTML = EMPTY_HTML;
    this.ui.showEmptyMode();
    this.ui.setStatus("Ready");
  }
}
