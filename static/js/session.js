/**
 * session.js
 * SessionManager — session list API, loading/switching sessions, creating and
 * deleting sessions. Depends on StreamManager for in-progress task reattachment;
 * the dependency is injected late via setStream() to break the circular dep.
 */

import { $, escapeHtml, setCookie } from "./utils.js";
import { EMPTY_HTML } from "./history.js";

export class SessionManager {
  /**
   * @param {import('./state.js').AppState} state
   * @param {import('./renderer.js').ChatRenderer} renderer
   * @param {import('./history.js').HistoryRenderer} history
   * @param {import('./sidebar.js').Sidebar} sidebar
   */
  constructor(state, renderer, history, sidebar) {
    this.state = state;
    this.renderer = renderer;
    this.history = history;
    this.sidebar = sidebar;
    /** @type {import('./stream.js').StreamManager|null} — set via setStream() */
    this._stream = null;
  }

  /**
   * Inject the StreamManager after both objects are constructed.
   * Resolves the stream ↔ session circular dependency.
   * @param {import('./stream.js').StreamManager} stream
   */
  setStream(stream) {
    this._stream = stream;
  }

  /** Fetch and render the session list in the sidebar. */
  async loadSessions() {
    try {
      const res = await fetch("/api/sessions");
      const sessions = await res.json();
      const list = $("session-list");
      list.innerHTML = "";
      if (sessions.length === 0) {
        list.innerHTML = `<div style="padding:14px 12px;font-size:12px;color:var(--fg-faint);text-align:center;">No conversations yet</div>`;
        return;
      }
      const deleteIcon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>`;
      for (const s of sessions) {
        const item = document.createElement("div");
        item.className = "session-item" + (s.id === this.state.sessionId ? " active" : "");
        item.dataset.sessionId = s.id;
        item.innerHTML = `
          <div class="session-info">
            <div class="session-preview">${escapeHtml(s.preview)}</div>
            <div class="session-time">${s.time}</div>
          </div>
          <button class="session-delete" data-delete-id="${s.id}" aria-label="Delete session">${deleteIcon}</button>`;
        list.appendChild(item);
      }
    } catch (e) {
      console.error("Failed to load sessions:", e);
      const list = $("session-list");
      if (!list.children.length) {
        const placeholders = [
          { preview: "How transformers work in ML", time: "Today" },
          { preview: "Python web scraper script", time: "Today" },
          { preview: "Brainstorm product names", time: "Yesterday" },
        ];
        for (const s of placeholders) {
          const item = document.createElement("div");
          item.className = "session-item";
          item.innerHTML = `<div class="session-info"><div class="session-preview">${escapeHtml(s.preview)}</div><div class="session-time">${s.time}</div></div>`;
          list.appendChild(item);
        }
      }
    }
  }

  /**
   * Load a session by id, render its history, and handle in-progress task reattachment.
   * @param {string} id
   */
  async loadSession(id) {
    try {
      const res = await fetch(`/api/session/${id}`);
      const data = await res.json();
      this.state.sessionId = id;
      this.state.history = data.history || [];
      this.history.renderHistory();
      await this.loadSessions();
      setCookie("session_id", id, 365);
      if (this.sidebar.isMobile()) this.sidebar.close();
    } catch (e) {
      console.error("Failed to load session:", e);
    }

    // Check frontend activity map first (fastest path)
    let activity = this._stream?.sessionActivity.get(id);
    console.log("[loadSession] id=", id, "activity=", activity);
    if (activity?.taskId) {
      console.log("[loadSession] session already active, syncing buttons");
      this._stream.ui.sendBtn.style.display = "none";
      this._stream.ui.stopBtn.style.display = "flex";
      await this._stream.reattachInProgressBubble(id, activity.taskId);
      return;
    }

    // Fall back to backend active-task check (handles page-reload case)
    if (!activity) {
      try {
        const activeResp = await fetch("/api/sessions/active");
        const activeData = await activeResp.json();
        const found = activeData.active?.find(a => a.session_id === id);
        if (found) {
          activity = { taskId: found.task_id };
          console.log("[loadSession] found active task by id=", id);
        }
      } catch (e) {
        console.error("[loadSession] failed to check active sessions:", e);
      }
    }

    if (activity?.taskId) {
      console.log("[loadSession] reattaching in-progress bubble, taskId=", activity.taskId);
      await this._stream.reattachInProgressBubble(id, activity.taskId);
      return;
    }

    // No active task — sync buttons to idle
    if (this._stream?.sessionActivity.has(id)) {
      this._stream.ui.sendBtn.style.display = "none";
      this._stream.ui.stopBtn.style.display = "flex";
    } else {
      this._stream.ui.sendBtn.style.display = "";
      this._stream.ui.stopBtn.style.display = "none";
      this._stream.ui.sendBtn.disabled = false;
    }
  }

  /**
   * Delete a session after a confirmation prompt.
   * @param {string} id
   */
  async deleteSession(id) {
    if (!confirm("Delete this chat permanently?")) return;
    try {
      await fetch("/api/session/" + id, { method: "DELETE" });
      if (id === this.state.sessionId) await this.createNewSession();
      await this.loadSessions();
    } catch (e) {
      console.error("Failed to delete session:", e);
    }
  }

  /**
   * Create a new session on the backend and reset local state.
   * Always leaves the send button active and stop button hidden.
   */
  async createNewSession() {
    try {
      const res = await fetch("/api/session", { method: "POST" });
      const data = await res.json();
      this.state.sessionId = data.id;
      this.state.history = [];
      setCookie("session_id", data.id, 365);
      this.history.renderHistory();
      await this.loadSessions();
    } catch (e) {
      console.error("Failed to create session:", e);
      this.state.history = [];
      this.history.renderHistory();
    }
    if (this._stream) {
      this._stream.ui.sendBtn.style.display = "";
      this._stream.ui.stopBtn.style.display = "none";
      this._stream.ui.sendBtn.disabled = false;
    }
  }
}
