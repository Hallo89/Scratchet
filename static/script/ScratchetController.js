class ScratchetController {
  defaultOwnUsername;

  isInitialized = false;

  rooms = new Map();
  activeRoom;

  posBufferServer = new Array();
  posBufferClient = new Array();
  willSendCompleteMetaData = true;

  constructor() {
    const persistentUsername = localStorage.getItem(LOCALSTORAGE_USERNAME_KEY);
    if (persistentUsername) {
      this.setDefaultUsername(persistentUsername, true);
    }
  }

  init() {
    hueSlider.addEvent('change:value', this.changeHue.bind(this));
    widthSlider.addEvent('change:value', this.changeWidth.bind(this));
    clearDrawingButton.addEventListener('click', this.clearDrawing.bind(this));

    // Set the join room input to the same width as the copy room link overlay
    copyRoomLinkOverlay.classList.add('active');
    joinRoomOverlayInput.style.maxWidth =
      (copyRoomLinkContent.offsetWidth / parseFloat(getComputedStyle(copyRoomLinkContent).fontSize)) + 'em';
    copyRoomLinkOverlay.classList.remove('active');

    setInterval(this.sendPositions.bind(this), SEND_INTERVAL);
    setInterval(this.sendCompleteMetaDataNextTime.bind(this), SEND_FULL_METADATA_INTERVAL);

    this.isInitialized = true;
  }

  // ---- Event handling ----
  // TODO fallback for an undefined `activeRoom` in case no rooms are active
  changeHue(slider) {
    this.activeRoom.setStrokeStyle(slider.value);
    this.activeRoom.hue = slider.value;
  }
  changeWidth(slider) {
    this.activeRoom.setLineWidth(slider.value);
    this.activeRoom.width = slider.value
    document.documentElement.style.setProperty('--strokeWidth', slider.value + 'px');
  }

  clearDrawing() {
    this.activeRoom.clearCurrentUserCanvas();
    this.sendCompleteMetaDataNextTime();
    sendMessage('clearUser', null, this.activeRoom.roomCode);
  }

  windowResized() {
    for (const room of this.rooms.values()) {
      room.setDimensions();
      room.redrawCanvas();
    }
  }

  joinRoom(roomcode) {
    roomcode = ScratchetRoom.validateValueToRoomCode(roomcode);
    if (roomcode) {
      sendMessage('joinRoom', roomcode);
      collapseJoinRoomOverlay();
    }
    return !!roomcode;
  }

  async copyRoomLink() {
    if (!navigator.clipboard) {
      copyRoomLinkOverlay.classList.toggle('active');
      return;
    }

    await navigator.clipboard.writeText(this.activeRoom.roomCodeLink);

    if (matchMedia('(hover: hover)').matches) {
      copyRoomLinkOverlay.classList.add('copied');
      dispatchTimeout();
    } else {
      copyRoomLinkOverlay.classList.toggle('active');
      if (copyRoomLinkOverlay.classList.contains('active')) {
        setTimeout(function() {
          copyRoomLinkOverlay.classList.add('copied');
          dispatchTimeout();
        }, 175);
      }
    }

    function dispatchTimeout() {
      setTimeout(function() {
        copyRoomLinkOverlay.classList.remove('copied');
      }, 750);
    }
  }

  changeCurrentRoomName(newRoomName) {
    this.activeRoom.changeRoomName(newRoomName);
  }

  roomListNodeClick(room) {
    this.switchActiveRoom(room);
  }

  changeOwnUsername(newUsername) {
    if (/^[Uu]ser #\d+$/.test(newUsername)) {
      this.resetUsernameInput();
    } else if (newUsername !== this.activeRoom.nameHandler.getUsername(CURRENT_USER_ID)) {
      this.activeRoom.nameHandler.changeUsername(CURRENT_USER_ID, newUsername);
      this.setDefaultUsername(newUsername);
      sendMessage('changeName', newUsername, this.activeRoom.roomCode);
    }
  }

  // ---- Username handling ----
  resetUsernameInput() {
    localStorage.removeItem(LOCALSTORAGE_USERNAME_KEY);
    this.activeRoom.nameHandler.setUsernameInput();
  }
  setDefaultUsername(username, skipLocalStorage) {
    this.defaultOwnUsername = username;
    if (!skipLocalStorage) {
      localStorage.setItem(LOCALSTORAGE_USERNAME_KEY, username);
    }
  }

  // ---- Room handling ----
  addNewRoom(roomCode, peers, activate) {
    if (!this.defaultOwnUsername) {
      throw new Error('@ addNewRoom: No default username has been set');
    }

    const newRoom = new ScratchetRoom(roomCode, this.defaultOwnUsername, peers);
    roomNameInput.textContent = newRoom.roomName;

    newRoom.roomListNode.addEventListener('click', this.roomListNodeClick.bind(this, newRoom));
    roomList.appendChild(newRoom.roomListNode);

    this.rooms.set(roomCode, newRoom);
    this.updateRoomIndicator();
    if (activate) {
      this.switchActiveRoom(newRoom);
    }
  }

  switchActiveRoom(room) {
    this.activeRoom = room;

    room.focusCanvas();

    room.nameHandler.setUsernameInput();
    room.nameHandler.appendUserList();
    room.nameHandler.updateUserIndicator();

    copyRoomLinkContent.textContent = room.roomCodeLink;
  }

  updateRoomIndicator() {
    roomListButton.textContent = this.rooms.size;
  }

  // ---- Canvas handling ----
  highlightUser(userID) {
    this.activeRoom.redrawCanvas(this.activeRoom.posUserCache.get(userID));
  }

  addToPosBuffer(posX, posY) {
    this.posBufferClient.push(posX, posY);
    this.posBufferServer.push(posX, posY);
  }

  initializePosBufferNormal(lastPosX, lastPosY) {
    const hue = this.activeRoom.hue;
    const width = this.activeRoom.width;
    let flag = 0;

    this.posBufferServer = new Array(2);

    if (!this.willSendCompleteMetaData && getClientMetaHue(this.posBufferClient) === hue) {
      flag |= 0b0010;
    } else {
      this.lastHue = hue;
      this.posBufferServer.push(this.lastHue);
    }
    if (!this.willSendCompleteMetaData && getClientMetaWidth(this.posBufferClient) === width) {
      flag |= 0b0001;
    } else {
      this.lastWidth = width;
      this.posBufferServer.push(this.lastWidth);
    }

    this.posBufferServer.push(lastPosX, lastPosY);
    this.posBufferServer[0] = this.activeRoom.roomCode;
    this.posBufferServer[1] = flag;

    this.posBufferClient = [hue, width, lastPosX, lastPosY, flag];
  }
  initializePosBufferErase() {
    this.posBufferServer = [this.activeRoom.roomCode, MODE.ERASE, this.activeRoom.width];
    this.posBufferClient = [];
  }

  // TODO this can probably be made less redundant
  resetPosBuffer() {
    if (getPendingServerMetaMode(this.posBufferServer) === MODE.ERASE) {
      this.initializePosBufferErase();
    } else {
      this.initializePosBufferNormal(
        this.posBufferClient[this.posBufferClient.length - 2],
        this.posBufferClient[this.posBufferClient.length - 1],
      );
    }
  }
  // Only update width and hue
  updatePosBuffer() {
    if (getPendingServerMetaMode(this.posBufferServer) === MODE.ERASE) {
      this.initializePosBufferErase();
    } else if (this.posBufferClient.length > 0) {
      this.initializePosBufferNormal(
        this.posBufferClient[2],
        this.posBufferClient[3],
      );
    }
  }

  sendCompleteMetaDataNextTime() {
    this.willSendCompleteMetaData = true;
  }

  // ---- Socket handling ----
  sendPositions() {
    const mode = getPendingServerMetaMode(this.posBufferServer);

    if (mode === MODE.ERASE && this.posBufferServer.length > (META_LEN.ERASE + EXTRA_SERVER_META_LEN)
        || this.posBufferClient.length > META_LEN.NORMAL) {
      const posData = new Int16Array(this.posBufferServer);
      sock.send(posData.buffer);
      if (this.posBufferClient.length > 0) {
        this.activeRoom.addClientDataToBuffer(new Int16Array(this.posBufferClient), CURRENT_USER_ID);
        // posBufferServer needs to be checked due to asynchronities
        // between willSendCompleteMetaData and sendPositions
        // And to ensure that it only resets on normal mode
        if (this.willSendCompleteMetaData && mode === 0) {
          this.willSendCompleteMetaData = false;
        }
      }
      this.resetPosBuffer();
    } else {
      this.updatePosBuffer();
    }
  }

  // Overrule timer if hue or stroke width has changed
  sendPositionsIfWidthHasChanged() {
    if (this.activeRoom.width !== getClientMetaWidth(this.posBufferClient)) {
      this.sendPositions();
    }
  }
  sendPositionsIfHueHasChanged() {
    if (this.activeRoom.hue !== getClientMetaHue(this.posBufferClient)) {
      this.sendPositions();
    }
  }

  parseSocketData(data) {
    const mode = getReceivedServerMetaMode(data);
    const userID = data[0];
    const roomCode = data[1];
    data = data.subarray(2);

    const targetRoom = this.rooms.get(roomCode);

    switch (mode) {
      case MODE.BULK_INIT:
        targetRoom.handleBulkInitData(data, userID);
        break;
      case MODE.ERASE:
        targetRoom.handleEraseData(data, userID);
        break;
      default:
        targetRoom.addServerDataToBuffer(data, userID);
    }
  }

  // ---- Socket message events ----
  userDisconnect(userID) {
    for (const roomCode of this.rooms.keys()) {
      // TODO Better notification handling:
      // - "{user of current room} has disconnected"
      // - "{user} has left room {room}"
      this.userLeave(userID, roomCode);
    }
  }
  userLeave(userID, roomCode) {
    const room = this.rooms.get(roomCode);
    if (room) {
      const username = room.nameHandler.removeUserFromUserList(userID);

      room.clearUserBufferAndRedraw(userID);
      room.posUserCache.delete(userID);

      dispatchNotification(`${username} has left the room`);
    }
  }
  userJoin(userID, roomCode, username) {
    const room = this.rooms.get(roomCode);
    if (room) {
      room.nameHandler.addUserToUserList(userID, username);
      room.sendJoinedUserBuffer();

      dispatchNotification(`${username} has entered the room`);
    }
  }
  userClearData(userID) {
    this.activeRoom.clearUserBufferAndRedraw(userID);
  }
  userChangeName(userID, newUsername) {
    const prevUsername = this.activeRoom.nameHandler.getUsername(userID);
    const username = this.activeRoom.nameHandler.changeUsername(userID, newUsername);

    dispatchNotification(`${prevUsername} --> ${username}`);
  }

  ownUserGetJoinData(value) {
    // For async reasons, the real user ID is solely used for the username
    if (!this.defaultOwnUsername) {
      this.setDefaultUsername(value.name);
    }
    this.addNewRoom(value.room, value.peers, true);

    if (!this.isInitialized) {
      this.init();
    }
  }

  // ---- Socket events ----
  socketOpen() {
    console.info('connected!');

    const initValue = {};
    if (this.defaultOwnUsername) {
      initValue.name = this.defaultOwnUsername;
    }
    sendMessage('connectInit', initValue);
  }

  async socketReceiveMessage(e) {
    if (e.data instanceof Blob) {
      // Scratchet ArrayBuffer: [playerID, metadata?, ...positions]
      const data = new Int16Array(await e.data.arrayBuffer());
      this.parseSocketData(data);
    } else {
      const data = JSON.parse(e.data);
      switch (data.evt) {
        case 'disconnect':
          this.userDisconnect(data.usr);
          break;
        case 'leave': {
          this.userLeave(data.usr, data.room);
          break;
        }
        case 'join': {
          this.userJoin(data.usr, data.room, data.val);
          break;
        }
        case 'clearUser': {
          this.userClearData(data.usr);
          break;
        }
        case 'changeName': {
          this.userChangeName(data.usr, data.val);
          break;
        }
        case 'joinData': {
          this.ownUserGetJoinData(data.val);
          break;
        }
      }
    }
  }
}
