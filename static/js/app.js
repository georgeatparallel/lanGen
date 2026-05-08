/**
 * app.js
 * Entry point — constructs all classes, resolves the stream↔session circular
 * dependency, wires every event listener, and runs the init sequence.
 */

import { AppState }        from "./state.js";
import { $, getCookie }    from "./utils.js";
import { UIController }    from "./ui.js";
import { AttachmentManager } from "./attachment.js";
import { ChatRenderer }    from "./renderer.js";
import { HistoryRenderer } from "./history.js";
import { SessionManager }  from "./session.js";
import { StreamManager }   from "./stream.js";
import { Sidebar }         from "./sidebar.js";
import { Settings }        from "./settings.js";

// ── Configure marked ──────────────────────────────────────────────────────
marked.setOptions({ breaks: true, gfm: true });

// ── Construct all modules ─────────────────────────────────────────────────
const state      = new AppState();
const ui         = new UIController(state);
const renderer   = new ChatRenderer(state, ui);
const history    = new HistoryRenderer(state, renderer, ui);
const attachment = new AttachmentManager(state, ui);
const sidebar    = new Sidebar();
const settings   = new Settings(state);
const session    = new SessionManager(state, renderer, history, sidebar);
const stream     = new StreamManager(state, renderer, ui, attachment, session);

// Resolve circular dep: session needs stream for reattachInProgressBubble
session.setStream(stream);

// ── Event listeners ───────────────────────────────────────────────────────

// Sidebar controls
$("sidebar-collapse").addEventListener("click", () => sidebar.toggle());
$("sidebar-close").addEventListener("click",    () => sidebar.close());
$("sidebar-overlay").addEventListener("click",  () => sidebar.close());

// New chat
$("new-chat-btn").addEventListener("click", () => {
  session.createNewSession();
  if (sidebar.isMobile()) sidebar.close();
});

// Topbar buttons
document.querySelectorAll(".topbar-mobile-only").forEach(btn =>
  btn.addEventListener("click", () => sidebar.open())
);
document.querySelectorAll(".topbar-show-sidebar").forEach(btn =>
  btn.addEventListener("click", () => sidebar.toggle())
);
document.querySelector('.topbar-right .topbar-btn[aria-label="New chat"]').addEventListener("click", () => {
  session.createNewSession();
  if (sidebar.isMobile()) sidebar.close();
});

// Session list (event delegation for click and delete)
$("session-list").addEventListener("click", e => {
  const delBtn = e.target.closest(".session-delete");
  if (delBtn) {
    e.stopPropagation();
    session.deleteSession(delBtn.dataset.deleteId);
    return;
  }
  const item = e.target.closest(".session-item[data-session-id]");
  if (item) session.loadSession(item.dataset.sessionId);
});

// Sidebar search filter
$("sidebar-search").addEventListener("input", e => {
  const q = e.target.value.trim().toLowerCase();
  for (const item of document.querySelectorAll("#session-list .session-item")) {
    const txt = item.querySelector(".session-preview")?.textContent.toLowerCase() || "";
    item.style.display = (!q || txt.includes(q)) ? "" : "none";
  }
});

// Attach button opens hidden file input
$("attach-btn").addEventListener("click", () => $("file-input").click());

// Send / stop
$("action-btn").addEventListener("click", () => stream.onActionClick());

// Textarea: auto-resize + enter-to-send
const input = $("input");
input.addEventListener("input", () => { ui.autoResize(); ui._syncActionBtn(); });
input.addEventListener("keydown", e => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    stream.sendMessage();
  }
});

// Clear chat
$("clear-btn").addEventListener("click", () => history.clearChat());

// Settings
document.querySelector(".sb-settings-btn").addEventListener("click", () => settings.open());
$("settings-close-btn").addEventListener("click", () => settings.close());
$("settings-panel").addEventListener("click",  e => settings.closeOnBackdrop(e));
document.querySelector(".btn-cancel").addEventListener("click", () => settings.close());
document.querySelector(".btn-save").addEventListener("click",   () => settings.save());

// Suggestion chips (event delegation on #messages since EMPTY_HTML is dynamic)
$("messages").addEventListener("click", e => {
  const chip = e.target.closest(".chip[data-fill]");
  if (chip) ui.fillInput(chip.dataset.fill);
});

// Keyboard shortcuts
document.addEventListener("keydown", e => {
  if ((e.metaKey || e.ctrlKey) && e.key === "k") {
    e.preventDefault();
    session.createNewSession();
    if (sidebar.isMobile()) sidebar.close();
  }
  if (e.key === "Escape") {
    if ($("settings-panel").classList.contains("open")) settings.close();
    else if ($("session-sidebar").classList.contains("open")) sidebar.close();
  }
});

// ── Init ──────────────────────────────────────────────────────────────────

// Fetch and display the model name
(async () => {
  try {
    const res = await fetch("/api/info");
    const data = await res.json();
    const pill = $("model-pill");
    if (pill && data.model) pill.textContent = data.model;
  } catch { /* server not ready yet */ }
})();

// Restore session or create a new one
(async () => {
  const sid = getCookie("session_id");
  if (sid) {
    try {
      const res = await fetch("/api/session");
      const data = await res.json();
      if (data.id === sid) {
        state.sessionId = sid;
        state.history = data.history || [];
        history.renderHistory();
        await session.loadSessions();

        // Reattach any in-progress task from a previous page load
        try {
          const activeResp = await fetch("/api/sessions/active");
          const activeData = await activeResp.json();
          const found = activeData.active?.find(a => a.session_id === sid);
          if (found) {
            await stream.reattachInProgressBubble(sid, found.task_id);
            input.focus();
            return;
          }
        } catch { /* no active tasks */ }

        ui._syncActionBtn();
        input.focus();
        return;
      }
    } catch { /* session gone, fall through */ }
  }
  await session.createNewSession();
  ui._syncActionBtn();
  input.focus();
})();
