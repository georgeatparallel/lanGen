/**
 * stream.js
 * StreamManager — two-phase chat (POST /api/chat → GET /api/chat/stream/:id),
 * stop/abort, stream reconnection on tab-switch (visibilitychange), background
 * polling, and in-progress bubble reattachment on session switch.
 *
 * The shared _processSSELine() method is called by both sendMessage() and
 * resumeStream() to avoid duplicating the SSE-parsing loop.
 */

import { escapeHtml } from "./utils.js";

export class StreamManager {
  /**
   * @param {import('./state.js').AppState} state
   * @param {import('./renderer.js').ChatRenderer} renderer
   * @param {import('./ui.js').UIController} ui
   * @param {import('./attachment.js').AttachmentManager} attachment
   * @param {import('./session.js').SessionManager} session
   */
  constructor(state, renderer, ui, attachment, session) {
    this.state = state;
    this.renderer = renderer;
    this.ui = ui;
    this.attachment = attachment;
    this.session = session;

    /** Per-session active request tracking: sessionId → { abortController, taskId, backendSessionId } */
    this.sessionActivity = new Map();

    this._pollInterval = null;

    document.addEventListener("visibilitychange", () => this._onVisibilityChange());
  }

  /** Route the #action-btn click to send or stop depending on current state. */
  onActionClick() {
    if (this.ui._btnState.stopVisible) this.stopRequest();
    else this.sendMessage();
  }

  // ── Send ──────────────────────────────────────────────────────────────────

  /** POST /api/chat → GET /api/chat/stream/:id; drives the full agentic loop. */
  async sendMessage() {
    const input = document.getElementById("input");
    const text = input.value.trim();
    if (!text || this.sessionActivity.has(this.state.sessionId)) return;

    // Wait for file reader if attachment data isn't ready yet
    if (this.state.attachment && this.state.attachment.data === null) {
      await new Promise((resolve, reject) => {
        const deadline = Date.now() + 5000;
        const poll = setInterval(() => {
          if (this.state.attachment?.data !== null) { clearInterval(poll); resolve(); }
          else if (Date.now() > deadline) { clearInterval(poll); reject(new Error("Attachment read timeout")); }
        }, 50);
      }).catch(() => { this.attachment.removeAttachment(); });
    }

    console.log("[send] sendMessage called, text:", text.slice(0, 50));
    this.state.busy = true;
    this.ui.sendBtn.style.display = "none";
    this.ui.stopBtn.style.display = "flex";
    input.value = "";
    this.attachment.removeAttachment(true);
    this.ui.autoResize();

    this.renderer.addUserBubble(text, this.state.attachment?.data);
    this.state.history.push({ role: "user", content: text });

    const bubble = this.renderer.createAiBubble();

    // ctx is mutated by _processSSELine — all streaming state lives here
    const ctx = {
      bubble,
      toolEls: {},
      imageUrls: [],
      videoUrls: [],
      sourceUrls: [],
      lastText: null,
      textRendered: false,
    };

    this.ui.setStatus("Thinking…");

    const mySessionId = this.state.sessionId;
    const body = { messages: this.state.history, system: this.state.system, session_id: mySessionId };
    if (this.state.attachment) body.attachment = this.state.attachment;
    if (this.state.lastImageUrl) body.last_image_url = this.state.lastImageUrl;

    try {
      this.state.abortController = new AbortController();
      this.sessionActivity.set(mySessionId, { abortController: this.state.abortController, taskId: null });

      console.log("[send] Phase 1: POST /api/chat");
      const startResp = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: this.state.abortController.signal,
      });
      if (!startResp.ok) throw new Error("Failed to start generation");
      const { task_id, session_id: backendSessionId } = await startResp.json();
      this.state.taskId = task_id;
      const sa = this.sessionActivity.get(mySessionId);
      sa.taskId = task_id;
      if (backendSessionId) sa.backendSessionId = backendSessionId;
      console.log("[send] task_id:", task_id, "mySessionId:", mySessionId);

      console.log("[send] Phase 2: GET /api/chat/stream/" + task_id);
      const streamResp = await fetch(`/api/chat/stream/${task_id}`, {
        signal: this.state.abortController.signal,
      });
      if (!streamResp.body) throw new Error("No response body");
      const reader = streamResp.body.getReader();
      const decoder = new TextDecoder();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        for (const line of decoder.decode(value, { stream: true }).split("\n")) {
          this._processSSELine(line, ctx);
        }
      }

      if (ctx.lastText || ctx.imageUrls.length > 0 || ctx.videoUrls.length > 0) {
        let historyContent = (ctx.lastText || "")
          .replace(/!\[generated\]\([^)]*\)/g, "")
          .replace(/!\[video\]\([^)]*\)/g, "")
          .trim();
        for (const url of ctx.imageUrls) {
          if (!historyContent.includes(url)) historyContent += "\n\n![generated](" + url + ")";
        }
        for (const url of ctx.videoUrls) {
          if (!historyContent.includes(url)) historyContent += "\n\n![video](" + url + ")";
        }
        const streamWrap = bubble.querySelector("#streaming-text");
        if (streamWrap) streamWrap.remove();
        if (historyContent) {
          this.renderer.renderTextContent(bubble, historyContent);
          this.renderer.postProcessImages(bubble);
          this.renderer.postProcessVideos(bubble);
        }
        const res = await fetch("/api/session");
        const data = await res.json();
        this.state.history = data.history || [];
        this.session.loadSessions();
      }

    } catch (err) {
      console.log("[send] CATCH:", err.message, err.name);
      const dots = bubble.querySelector(".thinking");
      if (dots) dots.remove();
      const errorIcon = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>`;
      if (this.state.taskId && (err.name === "AbortError" || err.type === "network-error")) {
        this.state.backgroundTask = true;
        bubble.innerHTML = `<div class="error-bubble">${errorIcon} Generation running in background…<br><span style="font-size:11px;opacity:0.6">Switch back to see results</span></div>`;
        this.ui.setStatus("Background");
      } else if (err.name === "AbortError") {
        bubble.innerHTML = `<div class="error-bubble">${errorIcon} Cancelled</div>`;
        this.ui.setStatus("Cancelled");
      } else {
        bubble.innerHTML = `<div class="error-bubble">${errorIcon} Network error: ${escapeHtml(err.message)}</div>`;
        this.ui.setStatus("Error");
      }
    } finally {
      for (const el of bubble.querySelectorAll(".tool-status")) this.renderer.markToolDone(el);
      this.renderer.markResearchDone(bubble);
      this.attachment.removeAttachment();
      if (!this.state.backgroundTask) this.sessionActivity.delete(mySessionId);
      if (this.state.sessionId === mySessionId && !this.state.backgroundTask) {
        this.state.busy = false;
        this.state.abortController = null;
        this.ui.sendBtn.style.display = "";
        this.ui.stopBtn.style.display = "none";
        this.ui.sendBtn.disabled = false;
        document.getElementById("input").focus();
      }
    }
  }

  // ── Stop ─────────────────────────────────────────────────────────────────

  /** Abort the current request and cancel the backend task. */
  stopRequest() {
    this.state.userStopped = true;
    const act = this.sessionActivity.get(this.state.sessionId);
    if (act?.abortController) act.abortController.abort();
    if (act?.taskId) fetch(`/api/chat/cancel/${act.taskId}`, { method: "POST" }).catch(() => {});
    if (!act) {
      if (this.state.abortController) this.state.abortController.abort();
      if (this.state.taskId) fetch(`/api/chat/cancel/${this.state.taskId}`, { method: "POST" }).catch(() => {});
    }
  }

  // ── Resume ────────────────────────────────────────────────────────────────

  /**
   * Reconnect to a live stream for an in-progress task.
   * Used by both the visibilitychange handler and reattachInProgressBubble.
   * @param {string} taskId
   * @param {HTMLElement} bubble
   * @param {object} toolEls - Existing pill element map (may be empty for reattach).
   * @returns {Promise<boolean>} True on success.
   */
  async resumeStream(taskId, bubble, toolEls) {
    this.state.abortController = new AbortController();
    try {
      const streamResp = await fetch(`/api/chat/stream/${taskId}`, {
        signal: this.state.abortController.signal,
      });
      if (!streamResp.body) return false;
      const reader = streamResp.body.getReader();
      const decoder = new TextDecoder();

      const imageUrls = [];
      const videoUrls = [];
      const ctx = { bubble, toolEls, imageUrls, videoUrls, sourceUrls: [], lastText: null };

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        for (const line of decoder.decode(value, { stream: true }).split("\n")) {
          this._processSSELine(line, ctx);
        }
      }

      const statusResp = await fetch(`/api/chat/status/${taskId}`);
      if (statusResp.ok) {
        const status = await statusResp.json();
        if (status.text || imageUrls.length > 0 || videoUrls.length > 0) {
          let content = (status.text || "")
            .replace(/!\[generated\]\([^)]*\)/g, "")
            .replace(/!\[video\]\([^)]*\)/g, "")
            .trim();
          for (const url of imageUrls) {
            if (!content.includes(url)) content += "\n\n![generated](" + url + ")";
          }
          for (const url of videoUrls) {
            if (!content.includes(url)) content += "\n\n![video](" + url + ")";
          }
          const streamWrap = bubble.querySelector("#streaming-text");
          if (streamWrap) streamWrap.remove();
          if (content && !ctx.textRendered) {
            this.renderer.renderTextContent(bubble, content);
            this.renderer.postProcessImages(bubble);
            this.renderer.postProcessVideos(bubble);
          }
          const res = await fetch("/api/session");
          const data = await res.json();
          this.state.history = data.history || [];
          this.session.history.renderHistory();
          this.session.loadSessions();
        }
      }
      return true;
    } catch (err) {
      console.warn("Stream reconnection failed:", err.message);
      return false;
    }
  }

  /**
   * Create a new AI bubble for an in-progress task and resume its stream.
   * Called when switching to a session that has an active backend task.
   * @param {string} sessionId
   * @param {string} taskId
   */
  async reattachInProgressBubble(sessionId, taskId) {
    console.log("[reattach] sessionId=", sessionId, "taskId=", taskId);
    const statusResp = await fetch(`/api/chat/status/${taskId}`);
    if (!statusResp.ok) { console.warn("[reattach] status check failed"); return; }
    const status = await statusResp.json();
    console.log("[reattach] status done=", status.done);
    if (status.done) {
      this.ui.sendBtn.style.display = "";
      this.ui.stopBtn.style.display = "none";
      return;
    }

    const div = document.createElement("div");
    div.className = "msg ai";
    div.innerHTML = `<div class="avatar"><svg><use href="/static/icon-compact.svg"/></svg></div><div class="bubble"></div>`;
    document.getElementById("messages").appendChild(div);
    const bubble = div.querySelector(".bubble");

    this.sessionActivity.set(sessionId, { abortController: null, taskId });

    if (status.text)      this.renderer.renderTextContent(bubble, status.text, "streaming-text");
    if (status.reasoning) this.renderer.addThinkingBlock(bubble, status.reasoning);

    await this.resumeStream(taskId, bubble, {});
  }

  // ── Background polling ────────────────────────────────────────────────────

  /**
   * Poll the task status endpoint once.
   * @param {string} taskId
   * @param {HTMLElement} bubble
   * @returns {Promise<boolean>} True when the task is done or errored.
   */
  async pollTask(taskId, bubble) {
    try {
      const resp = await fetch(`/api/chat/status/${taskId}`);
      if (!resp.ok) return false;
      const data = await resp.json();

      if (data.done) {
        this.state.polling = false;
        this.state.backgroundTask = false;
        const imageUrls = [];
        const videoUrls = [];
        const sourceUrls = [];
        for (const eventJson of data.events) {
          const evt = JSON.parse(eventJson);
          if (evt.type === "status")  this.renderer.addToolStatus(bubble, evt.tool, evt.args);
          else if (evt.type === "image" && evt.url) {
            if (!imageUrls.includes(evt.url)) imageUrls.push(evt.url);
          } else if (evt.type === "video" && evt.url) {
            if (!videoUrls.includes(evt.url)) videoUrls.push(evt.url);
            this.renderer.addVideo(bubble, evt.url, evt.prompt || "");
          } else if (evt.type === "thinking" && evt.content) {
            this.renderer.addThinkingBlock(bubble, evt.content);
          } else if (evt.type === "sources") {
            sourceUrls.push(...(evt.urls || []).filter((u, i, a) => a.indexOf(u) === i));
            this.renderer.renderSources(bubble, sourceUrls);
          }
        }
        const dots = bubble.querySelector(".thinking");
        if (dots) dots.remove();
        for (const el of bubble.querySelectorAll(".tool-status")) this.renderer.markToolDone(el);

        if (data.text || imageUrls.length > 0 || videoUrls.length > 0) {
          let text = (data.text || "")
            .replace(/!\[generated\]\([^)]*\)/g, "")
            .replace(/!\[video\]\([^)]*\)/g, "")
            .trim();
          for (const url of imageUrls) {
            if (!text.includes(url)) text += "\n\n![generated](" + url + ")";
          }
          for (const url of videoUrls) {
            if (!text.includes(url)) text += "\n\n![video](" + url + ")";
          }
          if (text) {
            this.renderer.renderTextContent(bubble, text);
            this.renderer.postProcessImages(bubble);
            this.renderer.postProcessVideos(bubble);
          }
          const res = await fetch("/api/session");
          const d = await res.json();
          this.state.history = d.history || [];
          this.session.loadSessions();
        }
        this.ui.setStatus("Ready");
        return true;
      }

      if (data.error && !bubble.querySelector(".error-bubble")) {
        this.state.backgroundTask = false;
        const errorIcon = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>`;
        bubble.innerHTML = `<div class="error-bubble">${errorIcon} ${escapeHtml(data.error)}</div>`;
        this.ui.setStatus("Error");
        return true;
      }
      return false;
    } catch {
      return false;
    }
  }

  // ── Tab visibility ────────────────────────────────────────────────────────

  async _onVisibilityChange() {
    if (document.hidden && this.state.taskId && !this.state.polling) {
      if (this.state.abortController) this.state.abortController.abort();
      this.state.polling = true;
      const bubble = document.querySelector("#messages .msg.ai:last-child .bubble");
      this._pollInterval = setInterval(async () => {
        const done = await this.pollTask(this.state.taskId, bubble);
        if (done) {
          clearInterval(this._pollInterval);
          this._pollInterval = null;
          this.state.busy = false;
          this.state.polling = false;
          this.state.backgroundTask = false;
          this.state.taskId = null;
          this.ui.sendBtn.style.display = "";
          this.ui.stopBtn.style.display = "none";
        }
      }, 3000);

    } else if (!document.hidden && this.state.taskId) {
      if (this._pollInterval) {
        clearInterval(this._pollInterval);
        this._pollInterval = null;
      }
      this.state.polling = false;
      this.state.backgroundTask = false;

      const bubble = document.querySelector("#messages .msg.ai:last-child .bubble");
      if (bubble) {
        bubble.innerHTML = `<div class="thinking"><div class="thinking-dots"><span></span><span></span><span></span></div> Reconnecting&hellip;</div>`;
      }
      const resumed = await this.resumeStream(this.state.taskId, bubble, {});

      if (!resumed) {
        this.state.polling = true;
        this._pollInterval = setInterval(async () => {
          const done = await this.pollTask(this.state.taskId, bubble);
          if (done) {
            clearInterval(this._pollInterval);
            this._pollInterval = null;
            this.state.busy = false;
            this.state.polling = false;
            this.state.backgroundTask = false;
            this.state.taskId = null;
            this.ui.sendBtn.style.display = "";
            this.ui.stopBtn.style.display = "none";
          }
        }, 3000);
      } else {
        this.state.taskId = null;
        this.state.busy = false;
        this.ui.sendBtn.style.display = "";
        this.ui.stopBtn.style.display = "none";
        this.ui.setStatus("Ready");
      }
    }
  }

  // ── SSE line processor ────────────────────────────────────────────────────

  /**
   * Parse and dispatch a single SSE data line into the appropriate renderer call.
   * Shared by sendMessage() and resumeStream() to avoid duplication.
   *
   * @param {string} line - Raw line from the stream reader.
   * @param {object} ctx - Mutable context shared within one streaming session.
   * @param {HTMLElement} ctx.bubble
   * @param {object} ctx.toolEls
   * @param {string[]} ctx.imageUrls
   * @param {string[]} ctx.videoUrls
   * @param {string[]} ctx.sourceUrls
   * @param {string|null} [ctx.lastText]
   * @param {boolean} [ctx.textRendered]
   */
  _processSSELine(line, ctx) {
    if (!line.startsWith("data: ")) return;
    const raw = line.slice(6).trim();
    if (raw === "[DONE]") return;

    let evt;
    try { evt = JSON.parse(raw); } catch { return; }

    const { bubble, toolEls } = ctx;

    if (evt.type === "status") {
      const el = this.renderer.addToolStatus(bubble, evt.tool, evt.args);
      toolEls[evt.tool] = el;
      this.ui.setStatus(evt.tool === "web_search" ? "Searching…" : "Generating…");

    } else if (evt.type === "progress") {
      this.renderer.updateToolProgress(bubble, evt.tool, evt.value, evt.max);

    } else if (evt.type === "download_progress") {
      this.renderer.handleDownloadProgress(bubble, evt);

    } else if (evt.type === "image") {
      if (toolEls[evt.tool || "generate_image"]) this.renderer.markToolDone(toolEls[evt.tool || "generate_image"]);
      if (evt.url && !ctx.imageUrls.includes(evt.url)) ctx.imageUrls.push(evt.url);
      if (evt.url) this.state.lastImageUrl = evt.url;

    } else if (evt.type === "video") {
      if (toolEls[evt.tool]) this.renderer.markToolDone(toolEls[evt.tool]);
      if (evt.url && !ctx.videoUrls.includes(evt.url)) ctx.videoUrls.push(evt.url);
      this.renderer.addVideo(bubble, evt.url, evt.prompt || "");
      this.ui.setStatus("Video ready");

    } else if (evt.type === "thinking") {
      this.renderer.addThinkingBlock(bubble, evt.content);

    } else if (evt.type === "sources") {
      const urls = (evt.urls || []).filter((u, i, a) => a.indexOf(u) === i);
      ctx.sourceUrls.push(...urls.filter(u => !ctx.sourceUrls.includes(u)));
      this.renderer.renderSources(bubble, ctx.sourceUrls);

    } else if (evt.type === "text") {
      for (const el of bubble.querySelectorAll(".tool-status")) this.renderer.markToolDone(el);
      const dots = bubble.querySelector(".thinking");
      if (dots) dots.remove();
      if (evt.content) {
        this.renderer.markResearchDone(bubble);
        ctx.textRendered = true;
        ctx.lastText = evt.content;
        this.renderer.renderTextContent(bubble, evt.content, "streaming-text");
      }
      this.ui.setStatus("Ready");

    } else if (evt.type === "error") {
      const dots = bubble.querySelector(".thinking");
      if (dots) dots.remove();
      const errorIcon = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>`;
      bubble.innerHTML = `<div class="error-bubble">${errorIcon} ${escapeHtml(evt.msg)}</div>`;
      this.ui.setStatus("Error");
    }
  }
}
