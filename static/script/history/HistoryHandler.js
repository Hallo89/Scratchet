import { BrushGroup } from '~/history/BrushGroup.js';
import { EraserGroup } from '~/history/EraserGroup.js';

/** @typedef { import('~/user/User.js').User } User */
/** @typedef { import('~/history/EraserGroup.js').EraserHistoryData } EraserHistoryData */

export class HistoryHandler {
  /** @type { Array<BrushGroup | EraserGroup> } */
  history = [];
  historyIndex = 0;

  #user;
  #brushStartingLen;

  /** @type { EraserHistoryData[] } */
  #eraseHistoryStack = [];

  /** @param { User } user Reference to the bound user. */
  constructor(user) {
    this.#user = user;
    this.#updateBrushLen();
  }

  // ---- Undo/Redo ----
  undo(count) {
    this.addGroup();
    for (let i = 0; i < count; i++) {
      if (this.historyIndex > 0) {
        const group = this.history[this.historyIndex - 1];
        group.undo();
        this.historyIndex--;
      }
    }
    this.#updateBrushLen();
  }
  redo(count) {
    this.addGroup();
    for (let i = 0; i < count; i++) {
      if (this.historyIndex < this.history.length) {
        const group = this.history[this.historyIndex];
        group.redo();
        this.historyIndex++;
      }
    }
    this.#updateBrushLen();
  }

  // ---- Group handling ----
  addGroup() {
    this.#addBrushGroup();
    this.#addEraserGroup();
  }
  #addBrushGroup() {
    if (this.#brushStartingLen < this.#user.posCache.length) {
      this.#addToHistory(new BrushGroup(this.#user.posCache, this.#brushStartingLen, this.#user.posCache.length));
      this.#updateBrushLen();
    }
  }
  #addEraserGroup() {
    if (this.#eraseHistoryStack.length > 0) {
      this.#addToHistory(new EraserGroup(this.#eraseHistoryStack));
      this.#eraseHistoryStack = [];
    }
  }

  // ---- History handling ----
  /** Empty the whole history. */
  empty() {
    this.addGroup();
    this.#updateBrushLen();
    this.historyIndex = 0;
    this.history = [];
  }
  /**
   * Clears the history up until the current history index,
   * shaving off any redo data.
   *
   * @privateRemarks
   * The discarded groups need to be traversed in reverse
   * to transform any PosWrappers in the correct order.
   */
  clear() {
    if (this.historyIndex < this.history.length) {
      const discardedGroups = this.history.splice(this.historyIndex, Infinity);
      for (let i = discardedGroups.length - 1; i >= 0; i--) {
        const group = discardedGroups[i];
        // TODO Common group interface
        group.cleanup(this.#user);
      }
    }
    this.#updateBrushLen();
  }

  #addToHistory(group) {
    this.clear();
    this.history.push(group);
    this.historyIndex++;
  }

  // ---- Helper functions ----
  #updateBrushLen() {
    this.#brushStartingLen = this.#user.posCache.length;
  }

  /**
   * Add an eraser undo entry to the eraser history stack
   * without checking whether a compatible entry already exists.
   * @param { Int16Array[][] } targetWrapper See {@link EraserHistoryData.target}
   * @param { Int16Array[][] } initialWrapper See {@link EraserHistoryData.initialWrapper}
   */
  addEraseDataUnchecked(targetWrapper, initialWrapper) {
    this.#eraseHistoryStack.push(/** @type EraserHistoryData */ ({
      initialWrapper,
      posWrapper: null,
      target: targetWrapper
    }));
  }
  /**
   * Add an eraser undo entry to the eraser history stack.
   * @param { Int16Array[][] } targetWrapper See {@link EraserHistoryData.target}
   * @param { Int16Array[][] } initialWrapper See {@link EraserHistoryData.initialWrapper}
   */
  addEraseData(targetWrapper, initialWrapper) {
    if (!this.#eraseHistoryStack.some(data => data.target === targetWrapper)) {
      this.addEraseDataUnchecked(targetWrapper, initialWrapper);
    }
  }
}
