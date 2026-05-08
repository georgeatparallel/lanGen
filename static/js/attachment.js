/**
 * attachment.js
 * AttachmentManager — handles file selection via the hidden file input,
 * shows a thumbnail/pill preview, and clears the attachment on send or cancel.
 */

import { $, escapeHtml } from "./utils.js";

export class AttachmentManager {
  /**
   * @param {import('./state.js').AppState} state
   * @param {import('./ui.js').UIController} ui
   */
  constructor(state, ui) {
    this.state = state;
    this.ui = ui;
    this._fileInput = $("file-input");
    this._preview = $("attachment-preview");

    this._fileInput.addEventListener("change", e => this._onFileChange(e));
    this._preview.addEventListener("click", e => {
      if (e.target.closest(".attach-remove")) this.removeAttachment();
    });
  }

  /** @param {Event} e */
  _onFileChange(e) {
    const file = e.target.files[0];
    if (!file) return;
    const isImage = file.type.startsWith("image/");
    const previewUrl = isImage ? URL.createObjectURL(file) : null;

    this.state.attachment = {
      type: isImage ? "image" : "pdf",
      data: null,
      filename: file.name,
      mime_type: file.type,
      _previewUrl: previewUrl,
    };
    this.showPreview();
    this.ui._syncActionBtn();

    const reader = new FileReader();
    reader.onload = ev => {
      if (this.state.attachment) {
        this.state.attachment.data = ev.target.result.split(",")[1];
      }
    };
    reader.readAsDataURL(file);
    this._fileInput.value = "";
  }

  /** Render the attachment thumbnail or pill in the preview bar. */
  showPreview() {
    const att = this.state.attachment;
    if (!att) return;
    this._preview.style.display = "flex";
    if (att.type === "image") {
      const src = att._previewUrl || `data:${escapeHtml(att.mime_type)};base64,${att.data}`;
      this._preview.innerHTML = `
        <img class="attach-thumb" src="${src}" alt="Attachment preview">
        <button class="attach-remove" title="Remove attachment" aria-label="Remove attachment">&#x2715;</button>`;
    } else {
      const pdfIcon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>`;
      this._preview.innerHTML = `
        <div class="attach-pill">${pdfIcon}<span>${escapeHtml(att.filename)}</span></div>
        <button class="attach-remove" title="Remove attachment" aria-label="Remove attachment">&#x2715;</button>`;
    }
  }

  /**
   * Clear the attachment.
   * @param {boolean} [previewOnly] - If true, only revoke the object URL without
   *   clearing state (used when send is in progress and the file is no longer needed
   *   in the UI but the data is still referenced).
   */
  removeAttachment(previewOnly = false) {
    if (this.state.attachment?._previewUrl) {
      URL.revokeObjectURL(this.state.attachment._previewUrl);
    }
    if (previewOnly) return;
    this.state.attachment = null;
    this._preview.style.display = "none";
    this._preview.innerHTML = "";
    this.ui._syncActionBtn();
  }
}
