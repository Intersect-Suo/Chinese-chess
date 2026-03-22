const express = require('express');
const http = require('http');
const socketIO = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = socketIO(server);

const PORT = process.env.PORT || 3000;
const VALID_SIDE_PREFERENCES = new Set(['r', 'b', 'random']);
const VALID_TIME_LIMITS = new Set([null, 30, 60, 120]);

app.use(express.static('public'));

let roomCounter = 1;
let waitingRoomId = null;
const rooms = new Map();
const playerMeta = new Map();

function createInitialBoard() {
  return [
    ['bR', 'bH', 'bE', 'bA', 'bK', 'bA', 'bE', 'bH', 'bR'],
    [null, null, null, null, null, null, null, null, null],
    [null, 'bC', null, null, null, null, null, 'bC', null],
    ['bP', null, 'bP', null, 'bP', null, 'bP', null, 'bP'],
    [null, null, null, null, null, null, null, null, null],
    [null, null, null, null, null, null, null, null, null],
    ['rP', null, 'rP', null, 'rP', null, 'rP', null, 'rP'],
    [null, 'rC', null, null, null, null, null, 'rC', null],
    [null, null, null, null, null, null, null, null, null],
    ['rR', 'rH', 'rE', 'rA', 'rK', 'rA', 'rE', 'rH', 'rR']
  ];
}

function cloneBoard(board) {
  return board.map((row) => row.slice());
}

function nextRoomId() {
  const id = `room-${roomCounter}`;
  roomCounter += 1;
  return id;
}

function getSocketById(id) {
  return io.sockets.connected[id] || null;
}

function inBounds(row, col) {
  return row >= 0 && row < 10 && col >= 0 && col < 9;
}

function isInsidePalace(side, row, col) {
  if (col < 3 || col > 5) {
    return false;
  }
  if (side === 'r') {
    return row >= 7 && row <= 9;
  }
  return row >= 0 && row <= 2;
}

function countPiecesBetween(startRow, startCol, endRow, endCol, board) {
  let count = 0;

  if (startRow === endRow) {
    const minCol = Math.min(startCol, endCol);
    const maxCol = Math.max(startCol, endCol);
    for (let col = minCol + 1; col < maxCol; col += 1) {
      if (board[startRow][col]) {
        count += 1;
      }
    }
    return count;
  }

  if (startCol === endCol) {
    const minRow = Math.min(startRow, endRow);
    const maxRow = Math.max(startRow, endRow);
    for (let row = minRow + 1; row < maxRow; row += 1) {
      if (board[row][startCol]) {
        count += 1;
      }
    }
    return count;
  }

  return -1;
}

function findGeneral(side, board) {
  const key = `${side}K`;
  for (let row = 0; row < 10; row += 1) {
    for (let col = 0; col < 9; col += 1) {
      if (board[row][col] === key) {
        return { row, col };
      }
    }
  }
  return null;
}

function areGeneralsFacing(board) {
  const red = findGeneral('r', board);
  const black = findGeneral('b', board);
  if (!red || !black || red.col !== black.col) {
    return false;
  }
  return countPiecesBetween(red.row, red.col, black.row, black.col, board) === 0;
}

function isForwardMove(side, deltaRow) {
  return side === 'r' ? deltaRow === -1 : deltaRow === 1;
}

function hasCrossedRiver(side, row) {
  return side === 'r' ? row <= 4 : row >= 5;
}

function checkValidMove(piece, startRow, startCol, endRow, endCol, board) {
  if (!piece || !inBounds(startRow, startCol) || !inBounds(endRow, endCol)) {
    return false;
  }
  if (startRow === endRow && startCol === endCol) {
    return false;
  }

  const side = piece[0];
  const type = piece[1];
  const targetPiece = board[endRow][endCol];

  if (targetPiece && targetPiece[0] === side) {
    return false;
  }

  const dr = endRow - startRow;
  const dc = endCol - startCol;
  const absDr = Math.abs(dr);
  const absDc = Math.abs(dc);
  let baseValid = false;

  if (type === 'R') {
    if (startRow === endRow || startCol === endCol) {
      baseValid = countPiecesBetween(startRow, startCol, endRow, endCol, board) === 0;
    }
  } else if (type === 'H') {
    if ((absDr === 2 && absDc === 1) || (absDr === 1 && absDc === 2)) {
      const legRow = absDr === 2 ? startRow + dr / 2 : startRow;
      const legCol = absDc === 2 ? startCol + dc / 2 : startCol;
      baseValid = !board[legRow][legCol];
    }
  } else if (type === 'E') {
    if (absDr === 2 && absDc === 2) {
      const eyeRow = startRow + dr / 2;
      const eyeCol = startCol + dc / 2;
      const riverCheck = side === 'r' ? endRow >= 5 : endRow <= 4;
      baseValid = riverCheck && !board[eyeRow][eyeCol];
    }
  } else if (type === 'A') {
    baseValid = absDr === 1 && absDc === 1 && isInsidePalace(side, endRow, endCol);
  } else if (type === 'K') {
    const isFlyingCapture = targetPiece
      && targetPiece[1] === 'K'
      && startCol === endCol
      && countPiecesBetween(startRow, startCol, endRow, endCol, board) === 0;
    if (isFlyingCapture) {
      baseValid = true;
    } else {
      baseValid = absDr + absDc === 1 && isInsidePalace(side, endRow, endCol);
    }
  } else if (type === 'C') {
    if (startRow === endRow || startCol === endCol) {
      const between = countPiecesBetween(startRow, startCol, endRow, endCol, board);
      if (!targetPiece) {
        baseValid = between === 0;
      } else {
        baseValid = between === 1;
      }
    }
  } else if (type === 'P') {
    const oneStep = absDr + absDc === 1;
    if (oneStep) {
      const crossed = hasCrossedRiver(side, startRow);
      if (isForwardMove(side, dr) && dc === 0) {
        baseValid = true;
      } else if (crossed && dr === 0 && absDc === 1) {
        baseValid = true;
      }
    }
  }

  if (!baseValid) {
    return false;
  }

  const trial = cloneBoard(board);
  trial[endRow][endCol] = piece;
  trial[startRow][startCol] = null;
  return !areGeneralsFacing(trial);
}

function isGeneralInCheck(board, defenderSide) {
  const generalPos = findGeneral(defenderSide, board);
  if (!generalPos) {
    return false;
  }

  const attackerSide = defenderSide === 'r' ? 'b' : 'r';
  for (let row = 0; row < 10; row += 1) {
    for (let col = 0; col < 9; col += 1) {
      const piece = board[row][col];
      if (!piece || piece[0] !== attackerSide) {
        continue;
      }

      if (checkValidMove(piece, row, col, generalPos.row, generalPos.col, board)) {
        return true;
      }
    }
  }

  return false;
}

function sanitizeSettings(input, current) {
  const next = {
    preferredSide: current.preferredSide,
    timeLimitSeconds: current.timeLimitSeconds
  };

  if (input && typeof input.preferredSide === 'string' && VALID_SIDE_PREFERENCES.has(input.preferredSide)) {
    next.preferredSide = input.preferredSide;
  }

  if (input && Object.prototype.hasOwnProperty.call(input, 'timeLimitSeconds')) {
    const parsed = input.timeLimitSeconds === null ? null : Number(input.timeLimitSeconds);
    if (VALID_TIME_LIMITS.has(parsed)) {
      next.timeLimitSeconds = parsed;
    }
  }

  return next;
}

function createSnapshot(room) {
  return {
    board: cloneBoard(room.board),
    currentTurn: room.currentTurn,
    lastMove: room.lastMove ? { ...room.lastMove, from: { ...room.lastMove.from }, to: { ...room.lastMove.to } } : null,
    gameOver: room.gameOver,
    turnTimeLeft: room.turnTimeLeft
  };
}

function restoreSnapshot(room, snapshot) {
  room.board = cloneBoard(snapshot.board);
  room.currentTurn = snapshot.currentTurn;
  room.lastMove = snapshot.lastMove
    ? { ...snapshot.lastMove, from: { ...snapshot.lastMove.from }, to: { ...snapshot.lastMove.to } }
    : null;
  room.gameOver = snapshot.gameOver;
  room.turnTimeLeft = snapshot.turnTimeLeft;
}

function emitTimerUpdate(room) {
  io.to(room.id).emit('timerUpdate', {
    enabled: room.settings.timeLimitSeconds !== null,
    activeSide: room.currentTurn,
    secondsLeft: room.turnTimeLeft,
    timeLimitSeconds: room.settings.timeLimitSeconds
  });
}

function stopTurnTimer(room) {
  if (room.timer) {
    clearInterval(room.timer);
    room.timer = null;
  }
}

function startTurnTimer(room, keepCurrentTime = false) {
  stopTurnTimer(room);

  if (room.gameOver) {
    return;
  }

  const limit = room.settings.timeLimitSeconds;
  if (limit === null) {
    room.turnTimeLeft = null;
    emitTimerUpdate(room);
    return;
  }

  if (!keepCurrentTime || typeof room.turnTimeLeft !== 'number' || room.turnTimeLeft <= 0) {
    room.turnTimeLeft = limit;
  }

  emitTimerUpdate(room);

  room.timer = setInterval(() => {
    if (room.gameOver) {
      stopTurnTimer(room);
      return;
    }

    room.turnTimeLeft -= 1;
    emitTimerUpdate(room);

    if (room.turnTimeLeft > 0) {
      return;
    }

    room.gameOver = true;
    stopTurnTimer(room);
    const loser = room.currentTurn;
    const winner = loser === 'r' ? 'b' : 'r';
    io.to(room.id).emit('gameOver', {
      winner,
      loser,
      reason: 'timeout'
    });
  }, 1000);
}

function resetRoomGameState(room) {
  room.board = createInitialBoard();
  room.currentTurn = 'r';
  room.gameOver = false;
  room.lastMove = null;
  room.pendingUndo = null;
  room.turnTimeLeft = room.settings.timeLimitSeconds;
  room.history = [createSnapshot(room)];
}

function broadcastSettings(room) {
  io.to(room.id).emit('roomSettingsUpdated', {
    settings: {
      preferredSide: room.settings.preferredSide,
      timeLimitSeconds: room.settings.timeLimitSeconds
    },
    hostId: room.hostId
  });
}

function buildMatchPayload(room, side, isHost) {
  return {
    roomId: room.id,
    side,
    isHost,
    started: !!room.started,
    ready: { ...room.ready },
    currentTurn: room.currentTurn,
    settings: {
      preferredSide: room.settings.preferredSide,
      timeLimitSeconds: room.settings.timeLimitSeconds
    },
    board: cloneBoard(room.board),
    lastMove: room.lastMove
  };
}

function assignSidesByPreference(room) {
  if (!room.hostId || !room.guestId) {
    return;
  }

  const hostSide = room.settings.preferredSide === 'random'
    ? (Math.random() < 0.5 ? 'r' : 'b')
    : room.settings.preferredSide;
  const guestSide = hostSide === 'r' ? 'b' : 'r';

  room.players = { r: null, b: null };
  room.players[hostSide] = room.hostId;
  room.players[guestSide] = room.guestId;

  const hostMeta = playerMeta.get(room.hostId);
  if (hostMeta) {
    hostMeta.side = hostSide;
    hostMeta.isHost = true;
  }

  const guestMeta = playerMeta.get(room.guestId);
  if (guestMeta) {
    guestMeta.side = guestSide;
    guestMeta.isHost = false;
  }

  room.ready = { r: false, b: false };
}

function getSocketSide(room, socketId) {
  if (room.players.r === socketId) {
    return 'r';
  }
  if (room.players.b === socketId) {
    return 'b';
  }
  return null;
}

function emitReadyState(room) {
  const redSocket = room.players.r ? getSocketById(room.players.r) : null;
  const blackSocket = room.players.b ? getSocketById(room.players.b) : null;

  if (redSocket) {
    redSocket.emit('readyStateUpdate', {
      side: 'r',
      started: !!room.started,
      ready: { ...room.ready }
    });
  }

  if (blackSocket) {
    blackSocket.emit('readyStateUpdate', {
      side: 'b',
      started: !!room.started,
      ready: { ...room.ready }
    });
  }
}

function tryStartGame(room) {
  if (room.started || !room.players.r || !room.players.b) {
    return false;
  }

  if (!room.ready.r || !room.ready.b) {
    return false;
  }

  room.started = true;
  resetRoomGameState(room);

  const redSocket = room.players.r ? getSocketById(room.players.r) : null;
  const blackSocket = room.players.b ? getSocketById(room.players.b) : null;

  if (redSocket) {
    redSocket.emit('gameStarted', {
      side: 'r',
      board: cloneBoard(room.board),
      currentTurn: room.currentTurn,
      lastMove: room.lastMove,
      settings: room.settings
    });
  }

  if (blackSocket) {
    blackSocket.emit('gameStarted', {
      side: 'b',
      board: cloneBoard(room.board),
      currentTurn: room.currentTurn,
      lastMove: room.lastMove,
      settings: room.settings
    });
  }
  io.to(room.id).emit('turnUpdate', { currentTurn: room.currentTurn });
  emitReadyState(room);
  startTurnTimer(room);

  return true;
}

function getUndoSteps() {
  return 1;
}

function applyUndo(room) {
  const rollbackSteps = getUndoSteps();
  if (room.history.length <= rollbackSteps) {
    return null;
  }

  room.history.splice(room.history.length - rollbackSteps, rollbackSteps);
  const snapshot = room.history[room.history.length - 1];
  restoreSnapshot(room, snapshot);
  room.pendingUndo = null;
  startTurnTimer(room, true);

  return { rollbackSteps, snapshot };
}

function removeRoom(roomId) {
  const room = rooms.get(roomId);
  if (!room) {
    return;
  }

  stopTurnTimer(room);

  const redSocket = room.players.r ? getSocketById(room.players.r) : null;
  const blackSocket = room.players.b ? getSocketById(room.players.b) : null;
  const waitingSocket = room.waitingPlayerId ? getSocketById(room.waitingPlayerId) : null;

  if (redSocket) {
    redSocket.leave(roomId);
    playerMeta.delete(redSocket.id);
  }
  if (blackSocket) {
    blackSocket.leave(roomId);
    playerMeta.delete(blackSocket.id);
  }
  if (waitingSocket) {
    waitingSocket.leave(roomId);
    playerMeta.delete(waitingSocket.id);
  }

  rooms.delete(roomId);
  if (waitingRoomId === roomId) {
    waitingRoomId = null;
  }
}

function assignPlayerToRoom(socket) {
  if (playerMeta.has(socket.id)) {
    return;
  }

  if (!waitingRoomId) {
    const roomId = nextRoomId();
    const room = {
      id: roomId,
      hostId: socket.id,
      guestId: null,
      waitingPlayerId: socket.id,
      players: { r: null, b: null },
      settings: {
        preferredSide: 'random',
        timeLimitSeconds: null
      },
      ready: { r: false, b: false },
      started: false,
      currentTurn: 'r',
      board: createInitialBoard(),
      gameOver: false,
      lastMove: null,
      history: [],
      pendingUndo: null,
      pendingRestart: null,
      turnTimeLeft: null,
      timer: null
    };

    resetRoomGameState(room);

    rooms.set(roomId, room);
    waitingRoomId = roomId;

    socket.join(roomId);
    playerMeta.set(socket.id, { roomId, side: null, isHost: true });

    socket.emit('matchWaiting', {
      roomId,
      side: null,
      isHost: true,
      started: false,
      ready: { r: false, b: false },
      currentTurn: room.currentTurn,
      settings: room.settings
    });

    console.log('[Match] ' + socket.id + ' created ' + roomId + ' as host');
    return;
  }

  const room = rooms.get(waitingRoomId);
  if (!room || room.players.r || room.players.b || !room.waitingPlayerId) {
    waitingRoomId = null;
    assignPlayerToRoom(socket);
    return;
  }

  const hostSocket = getSocketById(room.hostId);
  if (!hostSocket) {
    removeRoom(room.id);
    assignPlayerToRoom(socket);
    return;
  }

  room.waitingPlayerId = null;
  room.guestId = socket.id;

  socket.join(room.id);
  playerMeta.set(socket.id, { roomId: room.id, side: null, isHost: false });

  assignSidesByPreference(room);
  room.started = false;
  resetRoomGameState(room);
  emitReadyState(room);

  const hostMeta = playerMeta.get(room.hostId);
  const guestMeta = playerMeta.get(room.guestId);
  const hostSide = hostMeta ? hostMeta.side : null;
  const guestSide = guestMeta ? guestMeta.side : null;

  hostSocket.emit('matchFound', buildMatchPayload(room, hostSide, true));
  socket.emit('matchFound', buildMatchPayload(room, guestSide, false));

  waitingRoomId = null;
  console.log('[Match] ' + room.id + ' lobby ready: r=' + room.players.r + ', b=' + room.players.b + ', limit=' + room.settings.timeLimitSeconds);
}

io.on('connection', (socket) => {
  console.log(`[Socket] client connected: ${socket.id}`);
  assignPlayerToRoom(socket);

  socket.on('updateRoomSettings', (payload) => {
    const meta = playerMeta.get(socket.id);
    if (!meta) {
      return;
    }

    const room = rooms.get(meta.roomId);
    if (!room || room.hostId !== socket.id) {
      return;
    }

    if (room.started) {
      socket.emit('settingsRejected', { reason: 'game-already-started' });
      return;
    }

    room.settings = sanitizeSettings(payload, room.settings);

    if (room.guestId) {
      assignSidesByPreference(room);
      room.started = false;
      resetRoomGameState(room);

      const hostSocket = getSocketById(room.hostId);
      const guestSocket = getSocketById(room.guestId);
      const hostMeta = playerMeta.get(room.hostId);
      const guestMeta = playerMeta.get(room.guestId);

      if (hostSocket && hostMeta) {
        hostSocket.emit('matchFound', buildMatchPayload(room, hostMeta.side, true));
      }
      if (guestSocket && guestMeta) {
        guestSocket.emit('matchFound', buildMatchPayload(room, guestMeta.side, false));
      }

      room.pendingRestart = null;
      emitReadyState(room);
    } else {
      resetRoomGameState(room);
      room.ready = { r: false, b: false };
    }

    broadcastSettings(room);
  });

  socket.on('setReady', () => {
    const meta = playerMeta.get(socket.id);
    if (!meta) {
      return;
    }

    const room = rooms.get(meta.roomId);
    if (!room || room.started || room.gameOver) {
      return;
    }

    const side = getSocketSide(room, socket.id);
    if (!side) {
      return;
    }

    meta.side = side;
    room.ready[side] = true;
    emitReadyState(room);
    tryStartGame(room);
  });

  socket.on('requestRestart', () => {
    const meta = playerMeta.get(socket.id);
    if (!meta) {
      return;
    }

    const room = rooms.get(meta.roomId);
    if (!room || !room.started) {
      return;
    }

    if (room.pendingRestart) {
      socket.emit('restartResult', { accepted: false, message: '已有重新开始请求待处理' });
      return;
    }

    const mySide = getSocketSide(room, socket.id);
    if (!mySide) {
      return;
    }

    const opponentSide = mySide === 'r' ? 'b' : 'r';
    const opponentId = room.players[opponentSide];
    const opponentSocket = opponentId ? getSocketById(opponentId) : null;
    if (!opponentSocket) {
      socket.emit('restartResult', { accepted: false, message: '对手不在线，无法重新开始' });
      return;
    }

    room.pendingRestart = {
      requesterId: socket.id,
      opponentId
    };

    socket.emit('restartRequestSent');
    opponentSocket.emit('restartRequested', { requesterSide: mySide });
  });

  socket.on('respondRestart', (payload) => {
    const meta = playerMeta.get(socket.id);
    if (!meta) {
      return;
    }

    const room = rooms.get(meta.roomId);
    if (!room || !room.pendingRestart) {
      return;
    }

    if (room.pendingRestart.opponentId !== socket.id) {
      return;
    }

    const requesterSocket = getSocketById(room.pendingRestart.requesterId);
    const accepted = !!(payload && payload.accept);

    if (!accepted) {
      if (requesterSocket) {
        requesterSocket.emit('restartResult', { accepted: false, message: '对方拒绝了重新开始请求' });
      }
      socket.emit('restartResult', { accepted: false, message: '你已拒绝重新开始' });
      room.pendingRestart = null;
      return;
    }

    room.pendingRestart = null;
    room.started = false;
    room.gameOver = false;
    room.pendingUndo = null;
    stopTurnTimer(room);
    resetRoomGameState(room);
    room.ready = { r: false, b: false };

    io.to(room.id).emit('restartApplied', {
      board: cloneBoard(room.board),
      currentTurn: room.currentTurn,
      lastMove: null,
      settings: room.settings,
      message: '对局已重置，请重新准备，等待房主确认设置'
    });
    emitReadyState(room);
  });

  socket.on('move', (payload) => {
    const meta = playerMeta.get(socket.id);
    if (!meta || !meta.side) {
      socket.emit('invalidMove', { reason: 'not-in-room' });
      return;
    }

    const room = rooms.get(meta.roomId);
    if (!room || !room.players.r || !room.players.b) {
      socket.emit('invalidMove', { reason: 'room-not-ready' });
      return;
    }

    if (!room.started) {
      socket.emit('invalidMove', { reason: 'game-not-started' });
      return;
    }

    if (room.pendingUndo) {
      socket.emit('invalidMove', { reason: 'undo-pending' });
      return;
    }

    if (room.gameOver) {
      socket.emit('invalidMove', { reason: 'game-over' });
      return;
    }

    if (!payload || !payload.from || !payload.to) {
      socket.emit('invalidMove', { reason: 'invalid-payload' });
      return;
    }

    if (room.currentTurn !== meta.side) {
      socket.emit('invalidMove', { reason: 'not-your-turn' });
      return;
    }

    const from = payload.from;
    const to = payload.to;

    if (!inBounds(from.row, from.col) || !inBounds(to.row, to.col)) {
      socket.emit('invalidMove', { reason: 'out-of-bounds' });
      return;
    }

    const movingPiece = room.board[from.row][from.col];
    if (!movingPiece || movingPiece[0] !== meta.side) {
      socket.emit('invalidMove', { reason: 'invalid-piece' });
      return;
    }

    if (!checkValidMove(movingPiece, from.row, from.col, to.row, to.col, room.board)) {
      socket.emit('invalidMove', { reason: 'invalid-move' });
      return;
    }

    const capturedPiece = room.board[to.row][to.col];
    room.board[to.row][to.col] = movingPiece;
    room.board[from.row][from.col] = null;
    room.lastMove = {
      side: meta.side,
      piece: movingPiece,
      from,
      to
    };

    socket.to(meta.roomId).emit('opponentMove', {
      piece: movingPiece,
      from,
      to,
      captured: capturedPiece || null
    });

    io.to(meta.roomId).emit('lastMoveUpdate', { lastMove: room.lastMove });

    if (capturedPiece && capturedPiece[1] === 'K') {
      room.gameOver = true;
      stopTurnTimer(room);
      room.history.push(createSnapshot(room));
      io.to(meta.roomId).emit('gameOver', {
        winner: meta.side,
        reason: 'capture-general'
      });
      return;
    }

    room.currentTurn = room.currentTurn === 'r' ? 'b' : 'r';
    room.turnTimeLeft = room.settings.timeLimitSeconds;
    room.history.push(createSnapshot(room));

    io.to(meta.roomId).emit('turnUpdate', { currentTurn: room.currentTurn });
    startTurnTimer(room);

    const defenderSide = room.currentTurn;
    if (isGeneralInCheck(room.board, defenderSide)) {
      io.to(meta.roomId).emit('check', {
        sideUnderCheck: defenderSide
      });
    }
  });

  socket.on('requestUndo', () => {
    const meta = playerMeta.get(socket.id);
    if (!meta || !meta.side) {
      return;
    }

    const room = rooms.get(meta.roomId);
    if (!room || room.gameOver || !room.started) {
      return;
    }

    if (room.pendingUndo) {
      socket.emit('undoRequestFailed', { reason: 'undo-pending' });
      return;
    }

    const rollbackSteps = getUndoSteps();
    if (room.history.length <= rollbackSteps) {
      socket.emit('undoRequestFailed', { reason: 'no-history' });
      return;
    }

    const opponentSide = meta.side === 'r' ? 'b' : 'r';
    const opponentId = room.players[opponentSide];
    const opponentSocket = opponentId ? getSocketById(opponentId) : null;
    if (!opponentSocket) {
      socket.emit('undoRequestFailed', { reason: 'opponent-offline' });
      return;
    }

    room.pendingUndo = {
      requesterId: socket.id,
      requesterSide: meta.side,
      opponentId
    };

    socket.emit('undoRequestSent');
    opponentSocket.emit('undoRequested', {
      requesterSide: meta.side,
      rollbackSteps
    });
  });

  socket.on('respondUndo', (payload) => {
    const meta = playerMeta.get(socket.id);
    if (!meta || !meta.side) {
      return;
    }

    const room = rooms.get(meta.roomId);
    if (!room || !room.pendingUndo) {
      return;
    }

    if (room.pendingUndo.opponentId !== socket.id) {
      return;
    }

    const requesterSocket = getSocketById(room.pendingUndo.requesterId);
    const accepted = !!(payload && payload.accept);

    if (!accepted) {
      if (requesterSocket) {
        requesterSocket.emit('undoResult', {
          accepted: false,
          message: '对方拒绝了悔棋请求'
        });
      }
      socket.emit('undoResult', {
        accepted: false,
        message: '你已拒绝悔棋'
      });
      room.pendingUndo = null;
      return;
    }

    const undoResult = applyUndo(room);
    if (!undoResult) {
      if (requesterSocket) {
        requesterSocket.emit('undoResult', {
          accepted: false,
          message: '当前局面无法悔棋'
        });
      }
      socket.emit('undoResult', {
        accepted: false,
        message: '当前局面无法悔棋'
      });
      room.pendingUndo = null;
      return;
    }

    io.to(room.id).emit('undoApplied', {
      rollbackSteps: undoResult.rollbackSteps,
      board: cloneBoard(room.board),
      currentTurn: room.currentTurn,
      lastMove: room.lastMove,
      message: undoResult.rollbackSteps === 2 ? '悔棋成功，回退到请求方回合前' : '悔棋成功，回退一步'
    });
  });

  socket.on('resetGame', () => {
    const meta = playerMeta.get(socket.id);
    if (!meta) {
      return;
    }

    const room = rooms.get(meta.roomId);
    if (!room) {
      return;
    }

    resetRoomGameState(room);
    io.to(meta.roomId).emit('gameReset', {
      currentTurn: room.currentTurn,
      board: cloneBoard(room.board),
      lastMove: room.lastMove,
      settings: room.settings
    });
    startTurnTimer(room);
  });

  socket.on('disconnect', (reason) => {
    console.log(`[Socket] client disconnected: ${socket.id}, reason: ${reason}`);

    const meta = playerMeta.get(socket.id);
    if (!meta) {
      return;
    }

    const room = rooms.get(meta.roomId);
    if (!room) {
      playerMeta.delete(socket.id);
      return;
    }

    let opponentId = null;
    if (room.waitingPlayerId && room.waitingPlayerId === socket.id) {
      opponentId = null;
    } else if (meta.side) {
      opponentId = meta.side === 'r' ? room.players.b : room.players.r;
    }

    const opponentSocket = opponentId ? getSocketById(opponentId) : null;
    if (opponentSocket) {
      opponentSocket.emit('opponentEscaped');
    }

    removeRoom(room.id);
  });
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`[Server] Port ${PORT} is already in use. Stop the existing process or run with PORT=<newPort> npm start.`);
    process.exit(1);
  }

  console.error('[Server] Failed to start:', err.message);
  process.exit(1);
});

server.listen(PORT, () => {
  console.log(`[Server] Xiangqi server is running on http://localhost:${PORT}`);
});
