const express = require('express');
const http = require('http');
const socketIO = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = socketIO(server);

const PORT = process.env.PORT || 3000;

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
    const isFlyingCapture = targetPiece && targetPiece[1] === 'K' && startCol === endCol && countPiecesBetween(startRow, startCol, endRow, endCol, board) === 0;
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

function removeRoom(roomId) {
  const room = rooms.get(roomId);
  if (!room) {
    return;
  }

  const redSocket = room.players.r ? getSocketById(room.players.r) : null;
  const blackSocket = room.players.b ? getSocketById(room.players.b) : null;

  if (redSocket) {
    redSocket.leave(roomId);
    playerMeta.delete(redSocket.id);
  }
  if (blackSocket) {
    blackSocket.leave(roomId);
    playerMeta.delete(blackSocket.id);
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
    rooms.set(roomId, {
      id: roomId,
      players: { r: socket.id, b: null },
      currentTurn: 'r',
      board: createInitialBoard(),
      gameOver: false
    });

    waitingRoomId = roomId;
    socket.join(roomId);
    playerMeta.set(socket.id, { roomId, side: 'r' });

    socket.emit('matchWaiting', {
      roomId,
      side: 'r',
      currentTurn: 'r'
    });

    console.log(`[Match] ${socket.id} created ${roomId} as red`);
    return;
  }

  const room = rooms.get(waitingRoomId);
  if (!room || room.players.b) {
    waitingRoomId = null;
    assignPlayerToRoom(socket);
    return;
  }

  room.players.b = socket.id;
  socket.join(room.id);
  playerMeta.set(socket.id, { roomId: room.id, side: 'b' });

  const redSocket = getSocketById(room.players.r);
  if (!redSocket) {
    removeRoom(room.id);
    assignPlayerToRoom(socket);
    return;
  }

  const payload = {
    roomId: room.id,
    currentTurn: room.currentTurn
  };

  redSocket.emit('matchFound', { ...payload, side: 'r' });
  socket.emit('matchFound', { ...payload, side: 'b' });
  io.to(room.id).emit('turnUpdate', { currentTurn: room.currentTurn });

  waitingRoomId = null;
  console.log(`[Match] ${room.id} started: r=${room.players.r}, b=${room.players.b}`);
}

io.on('connection', (socket) => {
  console.log(`[Socket] client connected: ${socket.id}`);
  assignPlayerToRoom(socket);

  socket.on('move', (payload) => {
    const meta = playerMeta.get(socket.id);
    if (!meta) {
      socket.emit('invalidMove', { reason: 'not-in-room' });
      return;
    }

    const room = rooms.get(meta.roomId);
    if (!room || !room.players.r || !room.players.b) {
      socket.emit('invalidMove', { reason: 'room-not-ready' });
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

    socket.to(meta.roomId).emit('opponentMove', {
      piece: movingPiece,
      from,
      to,
      captured: capturedPiece || null
    });

    if (capturedPiece && capturedPiece[1] === 'K') {
      room.gameOver = true;
      io.to(meta.roomId).emit('gameOver', {
        winner: meta.side,
        reason: 'capture-general'
      });
      return;
    }

    room.currentTurn = room.currentTurn === 'r' ? 'b' : 'r';
    io.to(meta.roomId).emit('turnUpdate', { currentTurn: room.currentTurn });

    const defenderSide = room.currentTurn;
    if (isGeneralInCheck(room.board, defenderSide)) {
      io.to(meta.roomId).emit('check', {
        sideUnderCheck: defenderSide
      });
    }
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

    room.board = createInitialBoard();
    room.currentTurn = 'r';
    room.gameOver = false;

    io.to(meta.roomId).emit('gameReset', {
      currentTurn: room.currentTurn
    });
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

    const opponentId = meta.side === 'r' ? room.players.b : room.players.r;
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
