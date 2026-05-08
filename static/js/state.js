/**
 * state.js
 * AppState — single source of truth for all mutable application state.
 * All fields are plain properties; no reactive magic needed at this scale.
 */

export class AppState {
  constructor() {
    this.history = [];
    this.busy = false;
    this.system = "";
    this.abortController = null;
    this.sessionId = "";
    this.attachment = null;
    this.taskId = null;
    this.polling = false;
    this.streamStarted = false;
    this.lastTextLen = 0;
    this.backgroundTask = false;
    this.lastImageUrl = "";
    this.userStopped = false;
  }
}
