const notificationTemplate = (function() {
  const node = document.createElement('div');
  node.classList.add('notification');
  node.classList.add('button');
  return node;
}());

const canvas = document.getElementById('canvas');
const notificationWrapper = document.getElementById('notification-overlay');
const drawIndicator = document.getElementById('draw-indicator');;

const CURRENT_USER_ID = -1;
const SEND_INTERVAL = 100;

const ctx = canvas.getContext('2d');
const posUserCache = new Map(); // Map<userID, Set<posDataForUser>>
const globalPosBuffer = new Set(); // Set<posDataInOrderOfInsertion>
const lastPos = new Array(2);
let pressedMouseBtn = -1;
let posBuffer = new Array();


const sock = new WebSocket(`ws://${location.host}${location.pathname}socket`);

const hueSlider = new Slider89(document.getElementById('hue-slider'), {
  range: [0, 360],
  precision: 0,
  structure: `
    <thumb>
      <:indicator class=[slider-hue-indicator] style=[background-color: ${makeHSLString('$value')};]>
    </thumb>
  `
}, true);
hueSlider.addEvent('change:value', () => setStrokeStyle());

const widthSlider = new Slider89(document.getElementById('width-slider'), {
  range: [1, 80],
  value: 25,
  precision: 0,
  structure: `
    <thumb>
      <:value "$value" class=[slider-width-value]>
    </thumb>
  `
}, true);
widthSlider.addEvent('change:value', () => setLineWidth());
// Mist.
// widthSlider.addEvent('move', (slider, e) => {
//   if (e.ctrlKey) {
//     if (slider.step === false) {
//       slider.step = 10;
//     }
//   } else {
//     slider.step = false;
//   }
// });


document.getElementById('clear-button').addEventListener('click', clearCurrentUserCanvas);

sock.addEventListener('open', socketOpen);
sock.addEventListener('message', socketReceiveMessage);

canvas.addEventListener('contextmenu', canvasContext);

canvas.addEventListener('pointerdown', canvasDown);
window.addEventListener('pointerup', pointerUp);
canvas.addEventListener('mousemove', canvasDraw);
window.addEventListener('wheel', mouseWheel);


canvas.height = canvas.clientHeight;
canvas.width = canvas.clientWidth;

ctx.lineCap = 'round';
ctx.lineJoin = 'round';
setStrokeStyle();
setLineWidth();

setInterval(sendPositions, SEND_INTERVAL);


// ---- Events ----
function mouseWheel(e) {
  if (!e.ctrlKey && e.deltaY !== 0) {
    const direction = -1 * (e.deltaY / Math.abs(e.deltaY)); // either 1 or -1
    widthSlider.value += direction * 7;
  }
}

function canvasContext(e) {
  if (e.button === 2) {
    e.preventDefault();
  }
}

function canvasDown(e) {
  pressedMouseBtn = e.button;
  if (pressedMouseBtn === 2) {
    toggleDrawIndicatorEraseMode();
  }
  setLastPos(e.clientX, e.clientY);
  resetPosBuffer();
  canvasDraw(e);
}

function pointerUp() {
  sendPositions();
  pressedMouseBtn = -1;
  toggleDrawIndicatorEraseMode(true);
}

function canvasDraw(e) {
  moveDrawIndicator(e.clientX, e.clientY);
  if (pressedMouseBtn >= 0) {
    sendPositionsIfWidthHasChanged();

    if (pressedMouseBtn === 2) {
      erasePosData(e.clientX, e.clientY, CURRENT_USER_ID);
      redrawCanvas();
    } else {
      sendPositionsIfHueHasChanged();

      ctx.beginPath();
      ctx.moveTo(...lastPos);
      ctx.lineTo(e.clientX, e.clientY);
      ctx.stroke();

      setLastPos(e.clientX, e.clientY);
    }
    posBuffer.push(e.clientX, e.clientY);

    // hueSlider.value = (hueSlider.value + 1) % 360;
    // if (Math.round(Math.random()) === 0 || widthSlider.value <= 1) {
    //   widthSlider.value++;
    // } else {
    //   widthSlider.value--;
    // }
  }
}

// ---- Canvas ----
function redrawCanvas() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  for (const posDataWrapper of globalPosBuffer) {
    drawFromData(posDataWrapper);
  }
}

function clearCurrentUserCanvas() {
  sendMessage('clearUser');
  clearUserBufferAndRedraw(CURRENT_USER_ID);
}

function drawFromData(posDataWrapper) {
  const metadata = posDataWrapper[0];
  setStrokeStyle(metadata[0]);
  setLineWidth(metadata[1]);

  ctx.beginPath();
  ctx.moveTo(metadata[2], metadata[3]);
  for (let i = 1; i < posDataWrapper.length; i++) {
    for (let j = 0; j < posDataWrapper[i].length; j += 2) {
      ctx.lineTo(posDataWrapper[i][j], posDataWrapper[i][j + 1]);
    }
  }
  ctx.stroke();

  setStrokeStyle();
  setLineWidth();
}
function addPosDataToBufferAndDraw(dataArr, userID) {
  posDataWrapper = addPosDataToBuffer(userID, dataArr);
  drawFromData(posDataWrapper);
}

// --- Canvas helper functions ---
function setLineWidth(width = widthSlider.value) {
  ctx.lineWidth = width;
  if (width === widthSlider.value) {
    document.documentElement.style.setProperty('--strokeWidth', width + 'px');
  }
}
function setStrokeStyle(hue = hueSlider.value) {
  ctx.strokeStyle = makeHSLString(hue);
}
function makeHSLString(hue = hueSlider.value) {
  return `hsl(${hue}, 75%, 70%)`
}

// -- Draw indicator --
function moveDrawIndicator(posX, posY) {
  document.documentElement.style.setProperty('--mouseX', posX + 'px');
  document.documentElement.style.setProperty('--mouseY', posY + 'px');
}
function toggleDrawIndicatorEraseMode(reset) {
  if (reset) {
    drawIndicator.classList.remove('erase');
  } else {
    drawIndicator.classList.add('erase');
  }
}

// -- Pos buffer --
function setLastPos(posX, posY) {
  lastPos[0] = posX;
  lastPos[1] = posY;
}
function resetPosBuffer() {
  if (pressedMouseBtn === 2) {
    posBuffer = [-2, widthSlider.value];
  } else {
    posBuffer = [hueSlider.value, widthSlider.value, ...lastPos];
  }
}


// ---- Buffer functions ----
function parseBufferData(data, userID) {
  if (data[0] === -1) {
    // Bulk init data
    handleBulkInitData(data, userID);
  } else if (data[0] === -2) {
    // Erased data
    handleEraseData(data, userID);
  } else {
    addPosDataToBufferAndDraw(data, userID);
  }
}
function handleBulkInitData(data, userID) {
  let index = 1;
  for (let i = 1; i < data.length; i++) {
    if (data[i] === -1) {
      addPosDataToBufferAndDraw(data.subarray(index, i), userID);
      index = i + 1;
    }
  }
  addPosDataToBufferAndDraw(data.subarray(index), userID);
}
function handleEraseData(data, userID) {
  if (posUserCache.has(userID)) {
    const userPointsArr = Array.from(posUserCache.get(userID));

    for (let i = 2; i < data.length; i += 2) {
      erasePosData(data[i], data[i + 1], userID, data[1]);
    }
    redrawCanvas();
  }
}
function erasePosData(posDataX, posDataY, userID, eraserWidth = widthSlider.value) {
  if (!posUserCache.has(userID)) return;
  for (const posDataWrapper of posUserCache.get(userID)) {

    for (let i = 1; i < posDataWrapper.length; i++) {
      const posData = posDataWrapper[i];

      const newPoints = new Array();
      for (let k = 0; k < posData.length; k += 2) {
        // Push only the points back into the array which are not in range of the erase pos
        if (Math.abs(posData[k] - posDataX) > eraserWidth || Math.abs(posData[k + 1] - posDataY) > eraserWidth) {
          newPoints.push(posData[k], posData[k + 1]);
        }
      }

      if (newPoints.length > 0) {
        posDataWrapper[i] = new Int32Array(newPoints);
      } else {
        globalPosBuffer.delete(posDataWrapper);
        posUserCache.get(userID).delete(posDataWrapper);
      }
    }
  }
}

function addPosDataToBuffer(userID, posData) {
  const posDataWrapper = createPosDataWrapper(posData);
  globalPosBuffer.add(posDataWrapper);
  let cache = posUserCache.get(userID);
  if (!cache) {
    cache = new Set();
    posUserCache.set(userID, cache);
  }
  cache.add(posDataWrapper);
  return posDataWrapper;
}

function clearUserBufferAndRedraw(userID) {
  const userCache = posUserCache.get(userID);
  if (userCache) {
    for (const posDataWrapper of userCache) {
      globalPosBuffer.delete(posDataWrapper);
    }
    userCache.clear();
  }
  redrawCanvas();
}

function sendJoinedUserBuffer(targetUserID) {
  if (posUserCache.has(CURRENT_USER_ID)) {
    const joinedBuffer = new Array();
    for (const posDataWrapper of posUserCache.get(CURRENT_USER_ID)) {
      joinedBuffer.push(-1, ...posDataWrapper[0]);
      for (let i = 1; i < posDataWrapper.length; i++) {
        joinedBuffer.push(...posDataWrapper[i]);
      }
    }
    sock.send(new Int32Array(joinedBuffer));
  }
}

function createPosDataWrapper(posData) {
  // Split data packets into [ metadata, ...positionData ]
  return [ posData.subarray(0, 4), posData.subarray(4) ];
}


// ---- Socket ----
function sendPositions() {
  if (posBuffer[0] === -2 && posBuffer.length > 2 || posBuffer.length > 4) {
    const data = new Int32Array(posBuffer);
    sock.send(data.buffer);
    if (posBuffer[0] >= 0) {
      addPosDataToBuffer(CURRENT_USER_ID, data);
    }
    resetPosBuffer();
  }
}
// Overrule timer if hue or stroke width has changed
function sendPositionsIfWidthHasChanged() {
  // NOTE: This assumes that the width stays at position 1 in both normal & erase mode
  if (widthSlider.value !== posBuffer[1]) {
    sendPositions();
  }
}
function sendPositionsIfHueHasChanged() {
  if (hueSlider.value !== posBuffer[0]) {
    sendPositions();
  }
}

function socketOpen() {
  console.info('connected!');
}

async function socketReceiveMessage(e) {
  if (e.data instanceof Blob) {
    // Scratchet ArrayBuffer: [playerID, metadata?, ...positions]
    const data = new Int32Array(await e.data.arrayBuffer());
    const userID = data[0];

    parseBufferData(data.subarray(1), userID);
  } else {
    const data = JSON.parse(e.data);
    switch (data.evt) {
      case 'disconnect':
        console.info(data.usr + ' disconnected');
        dispatchNotification(`User #${data.usr} has left the room`)
        clearUserBufferAndRedraw(data.usr);
        posUserCache.delete(data.usr);
        break;
      case 'connect':
        console.info(data.usr + ' connected, sending my data');
        dispatchNotification(`User #${data.usr} has entered the room`)
        sendJoinedUserBuffer();
        break;
      case 'clearUser':
        console.info(data.usr + ' cleared their drawing');
        clearUserBufferAndRedraw(data.usr);
        break;
    }
  }
}

// --- Helper functions ---
function sendMessage(event, value) {
  const data = {
    evt: event
  };
  if (value != null) {
    data.val = value;
  }
  sock.send(JSON.stringify(data));
}


// ---- Notifications ----
function dispatchNotification(content) {
  const notification = notificationTemplate.cloneNode(true);
  notification.textContent = content;
  notificationWrapper.appendChild(notification);
  setTimeout(() => {
    notification.classList.add('remove');
    setTimeout(() => {
      notification.remove();
    }, 200);
  }, 1600);
}
