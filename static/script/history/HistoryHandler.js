import { BrushGroup } from '~/history/BrushGroup.js';
import { EraserGroup } from '~/history/EraserGroup.js';

/** @typedef { import('~/user/User.js').User } User */
/** @typedef { import('~/history/EraserGroup.js').EraserHistoryData } EraserHistoryData */

export class HistoryHandler {
  /** @type { Array<BrushGroup | EraserGroup> } */
  history = [];
  historyIndex = 0;

  #user;

  currentBrush;
  currentEraser;
  /**
   * Counts the amount of times a ping has been invoked
   * while the current group was being constructed.
   *
   * This can be interpreted as the connection having been safely
   * online for this many pings within this group
   * (which represents a time frame on a linear time scale).
   * @see {@link markIntact}
   */
  intactCounter = 0;

  /** @param { User } user Reference to the bound user. */
  constructor(user) {
    this.#user = user;
    this.currentEraser = new EraserGroup();
    this.currentBrush = new BrushGroup();
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
  }

  // ---- Group handling ----
  addGroup() {
    if (this.#addGenericGroup(this.currentBrush)) {
      this.currentBrush = new BrushGroup();
    }
    if (this.#addGenericGroup(this.currentEraser)) {
      this.currentEraser = new EraserGroup();
    }
  }
  #addGenericGroup(group) {
    if (group.historyData.length > 0) {
      group.close(this.intactCounter);
      this.#addToHistory(group);
      return true;
    }
    return false;
  }

  // ---- History handling ----
  /** Empty the whole history. */
  empty() {
    this.addGroup();
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
  }

  /**
   * Increment intact counter of the currently built group,
   * which the group will adopt once it is added to the history.
   * @see {@link #intactCounter}
   */
  markIntact() {
    this.intactCounter++;
  }

  #addToHistory(group) {
    this.clear();
    this.history.push(group);
    this.historyIndex++;
    this.intactCounter = 0;
  }
}
