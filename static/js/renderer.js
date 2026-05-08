/**
 * renderer.js
 * ChatRenderer — all DOM creation and mutation for the message list.
 * Handles user bubbles, AI bubbles, tool pills, image/video wrappers,
 * thinking blocks, sources, and post-processing of markdown-rendered media.
 */

import { escapeHtml } from "./utils.js";

export class ChatRenderer {
  /**
   * @param {import('./state.js').AppState} state
   * @param {import('./ui.js').UIController} ui
   */
  constructor(state, ui) {
    this.state = state;
    this.ui = ui;
    this._messages = document.getElementById("messages");
  }

  /**
   * Append a user message bubble to the message list.
   * @param {string} text - Plain text content.
   * @param {string|null} imgB64 - Base64-encoded image to show above text.
   * @returns {HTMLElement} The outer .msg.user row element.
   */
  addUserBubble(text, imgB64) {
    this.ui.hideEmpty();
    const div = document.createElement("div");
    div.className = "msg user";
    let thumb = "";
    if (imgB64) {
      const mime = imgB64.startsWith("/9j") ? "image/jpeg" : "image/png";
      thumb = `<img class="attach-thumb-small" src="data:${mime};base64,${imgB64}" alt="Sent image" onclick="window.open(this.src)">`;
    }
    div.innerHTML = `<div class="avatar">U</div><div class="bubble">${thumb}${escapeHtml(text)}</div>`;
    this._messages.appendChild(div);
    this.ui.scrollBottom();
    return div;
  }

  /**
   * Append an AI message row with animated thinking dots and return the bubble.
   * @returns {HTMLElement} The `.bubble` element — callers append content to it.
   */
  createAiBubble() {
    this.ui.hideEmpty();
    const div = document.createElement("div");
    div.className = "msg ai";
    div.innerHTML = `<div class="avatar"><svg><use href="/static/icon-compact.svg"/></svg></div><div class="bubble"><div class="thinking"><div class="thinking-dots"><span></span><span></span><span></span></div>Thinking&hellip;</div></div>`;
    this._messages.appendChild(div);
    this.ui.scrollBottom();
    return div.querySelector(".bubble");
  }

  /**
   * Append a tool-status pill to a bubble.
   * @param {HTMLElement} bubble
   * @param {string} tool - Tool name, e.g. "web_search", "generate_image".
   * @param {object} args - Tool arguments (query, prompt, url, etc.).
   * @returns {HTMLElement} The pill element.
   */
  addToolStatus(bubble, tool, args) {
    const el = document.createElement("div");
    el.dataset.tool = tool;
    const isSearch = tool === "web_search";
    const isFetch  = tool === "fetch_page";
    const isLegacy = tool === "generate_image";

    if (isSearch || isFetch) {
      let panel = bubble.querySelector(".research-panel");
      if (!panel) {
        panel = document.createElement("div");
        panel.className = "research-panel";
        panel.innerHTML = `
          <div class="research-panel-header">
            <div class="spinner"></div>
            Researching <strong class="research-count">0</strong>&nbsp;sources
          </div>
          <ul class="research-sources"></ul>`;
        bubble.appendChild(panel);
      }

      const list = panel.querySelector(".research-sources");
      const li = document.createElement("li");
      li.className = "research-source";

      let labelText, badgeClass, badgeText, href;
      if (isSearch) {
        labelText = args.query || "";
        badgeClass = "search";
        badgeText = "ddg";
        href = `https://duckduckgo.com/?q=${encodeURIComponent(labelText)}`;
      } else {
        const rawUrl = args.url || "";
        try {
          const u = new URL(rawUrl);
          labelText = u.hostname.replace(/^www\./, "");
        } catch { labelText = rawUrl.replace(/^https?:\/\//, "").split("/")[0]; }
        badgeClass = "fetch";
        badgeText = "page";
        href = rawUrl;
      }

      li.innerHTML = `<a class="source-domain" href="${escapeHtml(href)}" target="_blank" rel="noopener">${escapeHtml(labelText)}</a><span class="source-badge ${badgeClass}">${escapeHtml(badgeText)}</span>`;
      list.appendChild(li);

      const countEl = panel.querySelector(".research-count");
      if (countEl) countEl.textContent = list.children.length;

      this.ui.scrollBottom();
      return li;
    }

    if (isLegacy) el.className = "tool-status imggen";
    else          el.className = "tool-status comfy";

    const imgIcon   = `<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>`;
    const videoIcon = `<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/></svg>`;

    const promptText = (args.prompt || "").slice(0, 60);
    const suffix = (args.prompt || "").length > 60 ? "…" : "";
    const toolLabel = tool.replace(/_/g, " ");
    const isVideo = tool.startsWith("t2v_") || tool.startsWith("i2v_");
    const icon = isVideo ? videoIcon : imgIcon;
    const label = `${toolLabel}: <em>${escapeHtml(promptText)}${suffix}</em>`;

    el.innerHTML = `<div class="spinner"></div>${icon}${label}<div class="tool-status-progress" style="display:none"><div class="tool-status-bar"><div class="tool-status-bar-fill" style="width:0%"></div></div><span class="tool-status-frac">0/0</span></div>`;
    bubble.appendChild(el);
    this.ui.scrollBottom();
    return el;
  }

  /**
   * Update the inline progress bar on a tool status pill.
   * @param {HTMLElement} bubble
   * @param {string} tool
   * @param {number} value
   * @param {number} max
   */
  updateToolProgress(bubble, tool, value, max) {
    const el = bubble.querySelector(`.tool-status[data-tool="${tool}"]`);
    if (!el) return;
    const prog = el.querySelector(".tool-status-progress");
    const bar  = el.querySelector(".tool-status-bar-fill");
    const frac = el.querySelector(".tool-status-frac");
    if (prog) prog.style.display = "flex";
    if (bar)  bar.style.width = (max > 0 ? (value / max * 100).toFixed(1) : 0) + "%";
    if (frac) frac.textContent = `${value}/${max}`;
  }

  /**
   * Get or create the download-status row for a given filename.
   * @param {HTMLElement} bubble
   * @param {string} filename
   * @returns {HTMLElement}
   */
  getOrCreateDownloadStatus(bubble, filename) {
    let el = bubble.querySelector(`.download-status[data-filename="${filename}"]`);
    if (el) return el;
    el = document.createElement("div");
    el.className = "download-status";
    el.dataset.filename = filename;
    const dlIcon = `<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>`;
    el.innerHTML = `<div class="spinner"></div>${dlIcon}<span>Downloading <em>${escapeHtml(filename)}</em></span><div class="tool-status-progress" style="display:flex"><div class="tool-status-bar"><div class="tool-status-bar-fill" style="width:0%"></div></div><span class="tool-status-frac">0%</span></div>`;
    bubble.appendChild(el);
    this.ui.scrollBottom();
    return el;
  }

  /**
   * Update or complete a download-status row.
   * @param {HTMLElement} bubble
   * @param {object} evt - Event with filename, pct, done, error fields.
   */
  handleDownloadProgress(bubble, evt) {
    const el = this.getOrCreateDownloadStatus(bubble, evt.filename);
    const checkIcon = `<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`;
    if (evt.pct === 100 || evt.done) {
      el.className = "tool-status done";
      el.innerHTML = `${checkIcon} Downloaded ${escapeHtml(evt.filename)}`;
      setTimeout(() => {
        el.style.transition = "opacity 0.4s ease";
        el.style.opacity = "0";
        setTimeout(() => el.remove(), 400);
      }, 2000);
    } else if (evt.pct < 0) {
      el.style.borderColor = "rgba(239,68,68,0.3)";
      el.style.color = "#f87171";
      el.innerHTML = `<span>Download failed: ${escapeHtml(evt.filename)}${evt.error ? " — " + escapeHtml(evt.error) : ""}</span>`;
    } else {
      const bar  = el.querySelector(".tool-status-bar-fill");
      const frac = el.querySelector(".tool-status-frac");
      if (bar)  bar.style.width = evt.pct + "%";
      if (frac) frac.textContent = evt.pct + "%";
    }
  }

  /**
   * Transition a tool-status pill to the done state and fade it out.
   * @param {HTMLElement|null} el - The pill element.
   */
  markToolDone(el) {
    if (!el || el.classList.contains("done")) return;
    const tool = el.dataset.tool || "web_search";
    el.className = "tool-status done";
    const checkIcon = `<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`;

    let label = "";
    let extra = "";
    if (tool === "web_search") {
      const match = (el.dataset.result || "").match(/"title"/g);
      const count = match ? match.length : 0;
      label = count > 0 ? `Search: ${count} results` : "Search complete";
      const ddgMatch = el.innerHTML.match(/<a class="tool-status-link"[^>]*>[^<]*<\/a>/);
      if (ddgMatch) extra = ddgMatch[0];
    } else if (tool === "fetch_page") {
      label = "Page fetched";
      const linkMatch = el.innerHTML.match(/<a class="tool-status-link"[^>]*>[^<]*<\/a>/);
      if (linkMatch) extra = linkMatch[0];
    } else if (tool === "generate_image") {
      label = "Image ready";
    } else {
      label = tool.replace(/_/g, " ") + " done";
    }
    el.innerHTML = `${checkIcon} ${label}${extra}`;
    setTimeout(() => {
      el.style.transition = "opacity 0.4s ease";
      el.style.opacity = "0";
      setTimeout(() => el.remove(), 400);
    }, 2400);
  }

  /**
   * Fade out and remove the research panel from a bubble when the AI starts responding.
   * @param {HTMLElement} bubble
   */
  markResearchDone(bubble) {
    const panel = bubble.querySelector(".research-panel");
    if (!panel) return;
    panel.style.opacity = "0";
    setTimeout(() => panel.remove(), 350);
  }

  /**
   * Insert a generated image into a bubble, wrapped in a download-capable card.
   * Skips duplicates by data-gen-url.
   * @param {HTMLElement} bubble
   * @param {string} src - Image URL.
   * @param {HTMLImageElement|null} existingImg - Pre-existing img element to wrap.
   * @returns {boolean} Whether an image was inserted.
   */
  addImage(bubble, src, existingImg) {
    if (!bubble) return false;
    if (bubble.querySelector(`.gen-image-wrap[data-gen-url="${src}"]`)) return false;
    let img = existingImg || bubble.querySelector(`img[src="${src}"]`);
    if (img && !img.closest(".gen-image-wrap")) {
      img.classList.add("gen-image");
      return this._wrapImage(img, src);
    }
    const newImg = document.createElement("img");
    newImg.className = "gen-image";
    newImg.src = src;
    newImg.alt = "";
    newImg.title = "Click to open full size";
    newImg.onclick = () => { const w = window.open(); w.document.write(`<img src="${newImg.src}" style="max-width:100%">`); };
    newImg.onerror = () => { const w = newImg.closest(".gen-image-wrap") || newImg.parentElement; if (w) w.remove(); };
    return this._wrapImage(newImg, src, bubble);
  }

  /**
   * Wrap an image element in a .gen-image-wrap card with a download button.
   * @param {HTMLImageElement} img
   * @param {string} src
   * @param {HTMLElement} [parent] - Fallback parent when img has no parentNode.
   * @returns {boolean}
   */
  _wrapImage(img, src, parent) {
    const wrap = document.createElement("div");
    wrap.className = "gen-image-wrap";
    wrap.dataset.genUrl = src;
    if (img.parentNode) {
      img.parentNode.insertBefore(wrap, img);
      wrap.appendChild(img);
    } else {
      (parent || document.body).appendChild(wrap);
      wrap.appendChild(img);
    }
    const dlIcon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>`;
    const dlBtn = document.createElement("button");
    dlBtn.className = "dl-btn";
    dlBtn.innerHTML = `${dlIcon} Download`;
    dlBtn.onclick = () => {
      const a = document.createElement("a");
      a.href = img.src;
      a.download = `generated-${Date.now()}.png`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    };
    wrap.appendChild(dlBtn);
    this.ui.scrollBottom();
    return true;
  }

  /**
   * Append a generated video player to a bubble.
   * @param {HTMLElement} bubble
   * @param {string} src - Video URL.
   * @param {string} prompt - Alt text / aria-label for the video.
   */
  addVideo(bubble, src, prompt) {
    if (!bubble) return;
    if (bubble.querySelector(`.gen-video-wrap[data-gen-url="${src}"]`)) return;
    const wrap = document.createElement("div");
    wrap.className = "gen-video-wrap";
    wrap.dataset.genUrl = src;
    const video = document.createElement("video");
    video.className = "gen-video";
    video.src = src;
    video.controls = true;
    video.preload = "metadata";
    video.playsInline = true;
    video.setAttribute("aria-label", prompt || "generated video");
    const dlIcon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>`;
    const dlBtn = document.createElement("button");
    dlBtn.className = "dl-btn";
    dlBtn.innerHTML = `${dlIcon} Download video`;
    dlBtn.onclick = () => {
      const a = document.createElement("a");
      a.href = src;
      a.download = `generated-${Date.now()}.mp4`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    };
    wrap.appendChild(video);
    wrap.appendChild(dlBtn);
    bubble.appendChild(wrap);
    this.ui.scrollBottom();
  }

  /**
   * Render or update markdown text content inside a bubble.
   * If wrapperId is provided, uses/creates a child div with that id so streaming
   * updates replace content in-place rather than appending.
   * @param {HTMLElement} bubble
   * @param {string} text - Markdown source.
   * @param {string} [wrapperId] - Id for the in-place streaming wrapper.
   */
  renderTextContent(bubble, text, wrapperId) {
    const dots = bubble.querySelector(".thinking");
    if (dots) dots.remove();
    if (wrapperId) {
      let wrap = bubble.querySelector("#" + wrapperId);
      if (!wrap) {
        wrap = document.createElement("div");
        wrap.id = wrapperId;
        bubble.appendChild(wrap);
      }
      wrap.innerHTML = marked.parse(text);
    } else {
      const el = document.createElement("div");
      el.innerHTML = marked.parse(text);
      bubble.appendChild(el);
    }
    this.ui.scrollBottom();
  }

  /**
   * Get or lazily create the .thinking-content element inside a bubble.
   * @param {HTMLElement} bubble
   * @returns {HTMLElement}
   */
  _getOrCreateThinkingBlock(bubble) {
    let block = bubble.querySelector(".thinking-block");
    if (!block) {
      block = document.createElement("div");
      block.className = "thinking-block";
      block.innerHTML = `<details open><summary>Thinking</summary><div class="thinking-content"></div></details>`;
      const streamWrap = bubble.querySelector("#streaming-text");
      if (streamWrap) bubble.insertBefore(block, streamWrap);
      else bubble.appendChild(block);
    }
    return block.querySelector(".thinking-content");
  }

  /**
   * Append a thinking/reasoning chunk to the collapsible thinking block.
   * @param {HTMLElement} bubble
   * @param {string} content
   */
  addThinkingBlock(bubble, content) {
    const contentEl = this._getOrCreateThinkingBlock(bubble);
    const p = document.createElement("div");
    p.style.cssText = "margin-bottom:8px;padding-bottom:8px;border-bottom:1px solid var(--hairline);";
    p.textContent = content;
    contentEl.appendChild(p);
    contentEl.scrollTop = contentEl.scrollHeight;
  }

  /**
   * Append a standalone error bubble (used for non-streaming errors).
   * @param {string} text
   */
  addError(text) {
    const div = document.createElement("div");
    div.className = "msg ai";
    const errorIcon = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>`;
    div.innerHTML = `<div class="avatar"><svg><use href="/static/icon-compact.svg"/></svg></div><div class="error-bubble">${errorIcon} ${escapeHtml(text)}</div>`;
    this._messages.appendChild(div);
    this.ui.scrollBottom();
  }

  /**
   * Render or update the collapsible sources panel in a bubble.
   * @param {HTMLElement} bubble
   * @param {string[]} urls
   */
  renderSources(bubble, urls) {
    if (!urls.length) return;
    const linkIcon = `<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>`;

    const buildItems = list => {
      list.innerHTML = "";
      for (let i = 0; i < urls.length; i++) {
        const u = urls[i];
        let title = "Source " + (i + 1);
        let displayUrl = u;
        try {
          const parsed = new URL(u);
          const host = parsed.hostname.replace(/^www\./, "");
          const path = parsed.pathname.split("/").filter(Boolean);
          title = path.length
            ? path[0].replace(/[-_]/g, " ").replace(/\b\w/g, c => c.toUpperCase())
            : host;
          displayUrl = host + (path.length ? "/" + path.slice(0, 2).join("/") : "");
        } catch { /* fallback */ }
        const a = document.createElement("a");
        a.href = u;
        a.target = "_blank";
        a.rel = "noopener";
        a.className = "source-item";
        a.innerHTML = `<span class="source-title">${escapeHtml(title)}</span><span class="source-url">${escapeHtml(displayUrl)}</span>`;
        list.appendChild(a);
      }
    };

    let el = bubble.querySelector(".sources-details");
    if (!el) {
      el = document.createElement("details");
      el.className = "sources-details";
      const summary = document.createElement("summary");
      summary.innerHTML = `${linkIcon} ${urls.length} Source${urls.length > 1 ? "s" : ""}`;
      el.appendChild(summary);
      const list = document.createElement("div");
      list.className = "sources-list";
      buildItems(list);
      el.appendChild(list);
      const streamWrap = bubble.querySelector("#streaming-text");
      if (streamWrap) bubble.insertBefore(el, streamWrap);
      else bubble.appendChild(el);
    } else {
      const summary = el.querySelector("summary");
      if (summary) summary.innerHTML = `${linkIcon} ${urls.length} Source${urls.length > 1 ? "s" : ""}`;
      const list = el.querySelector(".sources-list");
      if (list) buildItems(list);
    }
    this.ui.scrollBottom();
  }

  /**
   * Scan a container for unwrapped <img> tags and wrap them as generated images.
   * Cleans up duplicate src references and escaped quote artifacts.
   * @param {HTMLElement} container
   * @returns {boolean} Whether any images were promoted.
   */
  postProcessImages(container) {
    const allImgs = container.querySelectorAll("img[src]");
    const seenUrls = new Set();
    for (const img of allImgs) {
      if (img.closest(".gen-image-wrap")) continue;
      if (img.src.startsWith("%22") || img.src.includes("%22http")) {
        img.src = img.src.replace(/%22/g, "");
      }
      if (seenUrls.has(img.src)) { img.remove(); continue; }
      seenUrls.add(img.src);
    }
    let found = false;
    for (const img of container.querySelectorAll("img[src]")) {
      if (img.closest(".gen-image-wrap")) continue;
      if (this.addImage(container, img.src, img)) found = true;
    }
    return found;
  }

  /**
   * Promote <img> elements with video src extensions into <video> players.
   * @param {HTMLElement} bubble
   */
  postProcessVideos(bubble) {
    for (const img of bubble.querySelectorAll('img[src$=".mp4"], img[src$=".webm"]')) {
      if (img.closest(".gen-video-wrap")) continue;
      const src = img.src;
      if (bubble.querySelector(`.gen-video-wrap[data-gen-url="${src}"]`)) { img.remove(); continue; }
      const placeholder = document.createElement("span");
      img.parentNode.replaceChild(placeholder, img);
      const wrap = document.createElement("div");
      wrap.className = "gen-video-wrap";
      wrap.dataset.genUrl = src;
      const video = document.createElement("video");
      video.className = "gen-video";
      video.src = src;
      video.controls = true;
      video.preload = "metadata";
      video.playsInline = true;
      const dlIcon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>`;
      const dlBtn = document.createElement("button");
      dlBtn.className = "dl-btn";
      dlBtn.innerHTML = `${dlIcon} Download video`;
      dlBtn.onclick = () => {
        const a = document.createElement("a");
        a.href = src;
        a.download = `generated-${Date.now()}.mp4`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
      };
      wrap.appendChild(video);
      wrap.appendChild(dlBtn);
      placeholder.parentNode.replaceChild(wrap, placeholder);
    }
  }
}
