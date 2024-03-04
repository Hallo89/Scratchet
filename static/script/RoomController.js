'use strict';
class RoomController {
  /** @type UserBulkInit */
  ownUser;

  hasErased = false;
  isDrawing = false;

  tools;
  /** @type CanvasSendHandler */
  sendHandler;
  /** @type ScratchetTool */
  activeTool;

  view;
  posHandler;


  /**
    * @param { HTMLCanvasElement } canvas
    * @param { number } roomCode
    * @param { string } globalUsername
    */
  constructor(canvas, roomCode, globalUsername) {
    this.addOwnClientDataToBuffer = this.addOwnClientDataToBuffer.bind(this);

    this.sendHandler = new CanvasSendHandler(roomCode, this.addOwnClientDataToBuffer);
    this.posHandler = new PositionDataHandler();
    this.view = new CanvasViewTransform(canvas, this.posHandler, [ this.sendHandler.brush.liveClientBuffer ]);
    this.ownUser = new UserBulkInit(globalUsername, this.posHandler, true);

    this.tools = {
      brush: new Brush(
        val => {
          this.sendHandler.brush.updateWidth(val);
        },
        val => {
          this.sendHandler.brush.updateHue(val);
        }),
      eraser: new Eraser(val => this.sendHandler.erase.updateWidth(val)),
    };

    canvas.addEventListener('pointerdown', this.canvasDown.bind(this));
    canvas.addEventListener('pointermove', this.canvasDraw.bind(this));

    this.sendHandler.brush.updateHue(this.tools.brush.hue);
    this.sendHandler.brush.updateWidth(this.tools.brush.width);
    this.sendHandler.erase.updateWidth(this.tools.eraser.width);

    this.view.setTransform();
  }

  // ---- Event functions ----
  canvasContext(e) {
    if (e.button === 2) {
      e.preventDefault();
    }
  }

  canvasDown(e) {
    if (e.button === 0) {
      this.isDrawing = true;
      this.ownUser.historyHandler.clear();

      // Roughly equivalent to `this.activeTool instanceof ...`, but switch-able
      switch (this.activeTool.constructor) {
        case Brush: {
          this.sendHandler.brush.reset();
          break;
        }
        case Eraser: {
          ui.toggleDrawIndicatorEraseMode();
          break;
        }
      }
    }

    if (e.pointerType !== 'touch') {
      this.canvasDraw(e);
    }
  }

  canvasDraw(e) {
    if (controls3D.touchIsActive) return;

    this.view.setCurrentMousePos(e.clientX, e.clientY);
    ui.moveDrawIndicator(e.clientX, e.clientY);

    if (this.isDrawing) {
      const [posX, posY] = this.view.getPosWithTransform(e.clientX, e.clientY);

      switch (this.activeTool.constructor) {
        case Brush: {
          this.sendHandler.addData('brush', posX, posY);
          this.view.update();
          break;
        }
        case Eraser: {
          if (this.ownUser.erase(posX, posY, this.tools.eraser.width)) {
            this.hasErased = true;
          }
          if (this.hasErased) {
            this.view.update();
            this.sendHandler.brush.sendCompleteMetaDataNextTime();
            this.sendHandler.addData('erase', posX, posY);
          }
          break;
        }
      }
    }
  }

  finalizeOwnDraw() {
    this.sendHandler.send();
    this.sendHandler.brush.reset();
    if (this.isDrawing === true) {
      this.addOwnHistoryGroup();
      this.view.update();
      this.isDrawing = false;
      this.hasErased = false;
      ui.toggleDrawIndicatorEraseMode(true);
    }
  }

  // ---- User handling ----
  addOwnHistoryGroup() {
    this.addHistoryGroup(this.ownUser);
    this.sendHandler.sendHistoryMarker();
  }
  /** @param { User } user */
  addHistoryGroup(user) {
    user.historyHandler.addGroup();
  }

  ownUndo() {
    this.undo(this.ownUser, 1);
    this.sendHandler.addData('undo', 1);
  }
  ownRedo() {
    this.redo(this.ownUser, 1);
    this.sendHandler.addData('redo', 1);
  }

  /** @param { User } user */
  undo(user, count) {
    user.historyHandler.undo(count);
    this.view.update();
  }
  /** @param { User } user */
  redo(user, count) {
    user.historyHandler.redo(count);
    this.view.update();
  }


  // ---- Buffer functions ----
  handleBulkInitData(data, user) {
    user.handleBulkInit(data);
    this.view.update();
  }
  sendBulkInitBuffer() {
    if (this.ownUser.posCache.length > 0) {
      const buffer = UserBulkInit.getSendableBuffer(this.ownUser, this.posHandler);
      this.sendHandler.sendData(buffer);
    }
  }

  /**
   * @param { Int16Array } data
   * @param { User } user
   */
  handleEraseData(data, user) {
    for (let i = Meta.LEN.ERASE; i < data.length; i += 2) {
      user.erase(data[i], data[i + 1], Meta.getClientWidth(data));
    }
    this.view.update();
  }

  /** @param { User } user */
  clearUserBufferAndRedraw(user) {
    if (user.emptyBuffer()) {
      this.view.update();
    }
  }
  addServerDataToBufferAndDraw(posData, user) {
    user.setColorIndicator(Meta.getClientHue(posData));
    user.addServerDataToBuffer(posData);
    this.view.update();
  }
  addOwnClientDataToBuffer(posData) {
    this.ownUser.addClientDataToBuffer(posData);
    this.view.update();
  }
}