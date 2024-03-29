import * as Meta from '~/constants/meta.js';
import { controller } from '~/init.js';
import { BrushBuffer } from '~/buffer/BrushBuffer.js';
import { EraseBuffer } from '~/buffer/EraseBuffer.js';
import { UndoBuffer } from '~/buffer/UndoBuffer.js';
import { RedoBuffer } from '~/buffer/RedoBuffer.js';

/** @typedef { import('~/buffer/SendBuffer.js').SendBuffer } SendBuffer */

export class CanvasSendHandler {
  activeIntervals = new Set();

  /** @type { SendBuffer | null } */
  activeBuffer = null;
  roomCode;

  buffers = {};

  /** @type { BrushBuffer } */
  get brush() {
    return this.buffers.brush;
  }
  /** @type { EraseBuffer } */
  get erase() {
    return this.buffers.erase;
  }

  constructor(roomCode, sendClientFn) {
    this.roomCode = roomCode;

    this.send = this.send.bind(this);

    this.buffers.brush = new BrushBuffer(sendClientFn, this.send);
    this.buffers.erase = new EraseBuffer(this.send);
    this.buffers.undo = new UndoBuffer(this.send);
    this.buffers.redo = new RedoBuffer(this.send);
  }


  // ---- Timers ----
  activateTimers() {
    this.activeIntervals.add(
      setInterval(this.send, Meta.SEND_INTERVAL));
  }
  clearTimers() {
    for (const intervalID of this.activeIntervals) {
      clearInterval(intervalID);
    }
    this.activeIntervals.clear();
  }


  // ---- Adding data ----
  addData(bufferName, ...data) {
    const buffer = this.buffers[bufferName];
    if (this.activeBuffer === buffer) {
      this.activeBuffer.add(...data);
    } else {
      this.send();

      this.activeBuffer = buffer;
      this.activeBuffer.reset();
      this.activeBuffer.add(...data);
    }
  }


  // ---- Send handling ----
  send() {
    if (this.activeBuffer?.ready) {
      this.sendData(this.activeBuffer.buffer);
      this.activeBuffer.update();
      return true;
    }
    return false;
  }

  /**
   * Send a history marker ({@link Meta.MODE.HISTORY_MARKER}).
   * This has its own function because it doesn't make sense
   * to create a dedicated buffer for it.
   */
  sendHistoryMarker() {
    this.sendData([ Meta.MODE.HISTORY_MARKER ]);
  }

  /**
   * Directly send a data packet with the mandatory preparation
   * (e.g. a room code is added).
   * @param { number[] } data All data that needs to be sent.
   */
  sendData(data) {
    const finalData = new Int16Array(data.length + 1);
    finalData.set(data, 1);
    finalData[0] = this.roomCode;
    controller.sock.send(finalData.buffer);
  }
}
