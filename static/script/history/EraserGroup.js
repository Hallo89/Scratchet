/**
 * @typedef { Object } UndoEraseInfo
 * @prop { Array<Array> } initialWrapper A copy of the original PosWrapper.
 *                                       Is used to reinstate the target to its original form.
 * @prop { Array<Array> } newWrapper A copy of the PosWrapper after the erase process.
 *                                   Is used to redo the target to its erased form.
 * @prop { Array<Array> } target The target PosWrapper that holds the erased/initial PosData.
 */

class EraserGroup {
  /** @type { UndoEraseInfo[] } */
  #undoData;

  /** @param { UndoEraseInfo[] } data */
  constructor(data) {
    this.#undoData = EraserGroup.#buildUndoInfo(data);
  }

  undo() {
    for (const info of this.#undoData) {
      info.target.splice(0, info.target.length, info.initialWrapper);
    }
  }
  redo() {
    for (const info of this.#undoData) {
      info.target.splice(0, info.target.length, info.newWrapper);
    }
  }

  cleanup = this.undo;

  /** @param { UndoEraseInfo[] } undoOutline */
  static #buildUndoInfo(undoOutline) {
    for (const info of undoOutline) {
      info.newWrapper = [ ...info.target ];
    }
    return undoOutline;
  }
}
