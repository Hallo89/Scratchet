import type { SocketRoom } from 'SocketRoom';
import { SocketRateHandler } from 'SocketRateHandler';
import { ScratchetError } from 'ScratchetError';
import Global from 'Global';

export type SocketID = number;
export type RoomCode = number;
export type RoomName = string;
export type Username = string;

export class SocketUser {
  static socketIDCounter: SocketID = 0;

  readonly sock: WebSocket;
  readonly id: SocketID;
  readonly defaultName: Username;
  rate: SocketRateHandler; 
  isActive = false;

  #rooms: Map<SocketRoom, Username>;

  constructor(sock: WebSocket) {
    this.sock = sock;
    this.id = SocketUser.socketIDCounter++;
    this.defaultName = SocketUser.createDefaultName(this.id);
    this.rate = new SocketRateHandler();
    this.#rooms = new Map();
  }
  
  init() {
    this.isActive = true;
    return this;
  }

  // ---- Room handling ----
  addToRoom(socketRoom: SocketRoom, username?: Username) {
    username = this.getUsernameFromValidation(username);
    this.#rooms.set(socketRoom, username);
  }
  removeFromRoom(socketRoom: SocketRoom) {
    this.#rooms.delete(socketRoom);
  }
  getRooms() {
    return this.#rooms.keys();
  }

  getNameForRoom(socketRoom: SocketRoom): Username {
    // NOTE The entry is assumed to exist and not asserted!
    return this.#rooms.get(socketRoom)!;
  }
  setNameForRoom(socketRoom: SocketRoom, newUsername: string) {
    newUsername = this.getUsernameFromValidation(newUsername);
    this.#rooms.set(socketRoom, newUsername);
  }

  // ---- WebSocket handling ----
  send(data: string | ArrayBuffer) {
    if (this.sock.readyState === 1) {
      if (!this.isActive) {
        throw new ScratchetError(`Tried to send while inactive (data: ${data})`);
      }
      this.sock.send(data);
    }
  }

  sendInitialJoinData(socketRoom: SocketRoom) {
    // NOTE: `defaultName` is sent on every new join request redundantly
    // for simplicity purposes
    const data = JSON.stringify({
      evt: 'joinData',
      val: {
        roomCode: socketRoom.roomCode,
        roomName: socketRoom.roomName,
        username: this.getNameForRoom(socketRoom),
        defaultName: this.defaultName,
        peers: this.getTransmittablePeerArray(socketRoom)
      }
    });
    this.send(data);
  }

  // ---- ArrayBuffer handling ----
  prependIDToBuffer(dataArr: Int16Array): ArrayBuffer {
    const newData = new Int16Array(dataArr.length + 1);
    newData.set(dataArr, 1);
    newData[0] = this.id;
    return newData.buffer;
  }

  // ---- Helper functions ----
  getUsernameFromValidation(username?: Username): Username {
    if (Global.Validator.validateUsername(username)) {
      return username!;
    }
    return this.defaultName;
  }

  getTransmittablePeerArray(socketRoom: SocketRoom) {
    const peerArr = new Array();
    for (const socketUser of socketRoom.getUsers()) {
      if (socketUser !== this) {
        const username = socketUser.getNameForRoom(socketRoom);
        peerArr.push([ socketUser.id, username ]);
      }
    }
    return peerArr;
  }

  toString() {
    return `SocketUser #${this.id} (${this.isActive ? 'active' : 'inactive'})`;
  }

  // ---- Static helper functions ----
  // TODO this can be taken from UsernameHandler
  static createDefaultName(userID: SocketID): Username {
    return 'User #' + userID;
  }
}