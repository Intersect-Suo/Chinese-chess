(() => {
  const canvas = document.getElementById('xiangqi-board');
  const ctx = canvas.getContext('2d');
  const restartBtn = document.getElementById('restart-btn');
  const undoBtn = document.getElementById('undo-btn');
  const applySettingsBtn = document.getElementById('apply-settings-btn');
  const sideSelect = document.getElementById('side-select');
  const timeSelect = document.getElementById('time-select');
  const roomRoleEl = document.getElementById('room-role-text');
  const timerEl = document.getElementById('timer-text');
  const bannerEl = document.getElementById('banner-text');
  const statusEl = document.getElementById('status-text');
  const metaEl = document.getElementById('meta-text');

  const COLS = 9;
  const ROWS = 10;
  const CELL = 60;
  const OFFSET_X = 30;
  const OFFSET_Y = 30;
  const PIECE_RADIUS = 24;

  const initialBoard = [
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

  const pieceText = {
    rK: '帅',
    rA: '仕',
    rE: '相',
    rH: '马',
    rR: '车',
    rC: '炮',
    rP: '兵',
    bK: '将',
    bA: '士',
    bE: '象',
    bH: '马',
    bR: '车',
    bC: '炮',
    bP: '卒'
  };

  function cloneBoard(board) {
    return board.map((row) => row.slice());
  }

  function toTimeOptionValue(timeLimitSeconds) {
    return timeLimitSeconds === null ? 'none' : String(timeLimitSeconds);
  }

  function fromTimeOptionValue(value) {
    if (value === 'none') {
      return null;
    }
    const parsed = Number(value);
    return Number.isNaN(parsed) ? null : parsed;
  }

  function formatSeconds(seconds) {
    if (typeof seconds !== 'number') {
      return '--:--';
    }
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }

  let boardState = cloneBoard(initialBoard);
  let selected = null;
  let currentTurn = 'r';
  let mySide = null;
  let roomId = null;
  let isMatched = false;
  let isHost = false;
  let gameOver = false;
  let bannerText = '正在连接服务器...';
  let statusText = '';
  let lastMove = null;
  let roomSettings = {
    preferredSide: 'random',
    timeLimitSeconds: null
  };
  let timerState = {
    enabled: false,
    activeSide: 'r',
    secondsLeft: null,
    timeLimitSeconds: null
  };

  const socket = typeof io === 'function' ? io() : null;

  function applyServerBoard(board) {
    if (!Array.isArray(board) || board.length !== ROWS) {
      return;
    }
    boardState = cloneBoard(board);
  }

  function resetLocalBoard() {
    boardState = cloneBoard(initialBoard);
    selected = null;
    currentTurn = 'r';
    gameOver = false;
    lastMove = null;
    timerState = {
      enabled: false,
      activeSide: 'r',
      secondsLeft: null,
      timeLimitSeconds: roomSettings.timeLimitSeconds
    };
  }

  function syncRestartButton() {
    if (!restartBtn) {
      return;
    }
    if (!socket) {
      restartBtn.disabled = false;
      return;
    }
    restartBtn.disabled = !gameOver;
  }

  function syncUndoButton() {
    if (!undoBtn) {
      return;
    }
    if (!socket) {
      undoBtn.disabled = true;
      return;
    }
    undoBtn.disabled = !isMatched || gameOver || !mySide;
  }

  function syncRoomControls() {
    if (!applySettingsBtn || !sideSelect || !timeSelect) {
      return;
    }

    sideSelect.value = roomSettings.preferredSide;
    timeSelect.value = toTimeOptionValue(roomSettings.timeLimitSeconds);

    const canEdit = !!socket && isHost && !isMatched;
    sideSelect.disabled = !canEdit;
    timeSelect.disabled = !canEdit;
    applySettingsBtn.disabled = !canEdit;
  }

  function updateTurnStatus() {
    if (gameOver) {
      statusText = '对局已结束';
      return;
    }

    if (!socket) {
      statusText = currentTurn === 'r' ? '红方走位' : '黑方走位';
      return;
    }

    if (!isMatched) {
      statusText = '等待对手加入...';
      return;
    }

    statusText = currentTurn === mySide ? '轮到你了' : '对手思考中...';
  }

  function updateStatusPanel() {
    if (bannerEl) {
      bannerEl.textContent = bannerText;
    }
    if (statusEl) {
      statusEl.textContent = statusText;
    }
    if (metaEl) {
      const turnLabel = currentTurn === 'r' ? '当前回合: 红方' : '当前回合: 黑方';
      const sideLabel = mySide ? `你是: ${mySide === 'r' ? '红方' : '黑方'}` : '你是: 未分配';
      metaEl.textContent = `${turnLabel} | ${sideLabel}`;
    }

    if (roomRoleEl) {
      if (!socket) {
        roomRoleEl.textContent = '离线模式';
      } else {
        roomRoleEl.textContent = isHost ? '你的身份: 房主' : '你的身份: 访客';
      }
    }

    if (timerEl) {
      if (!timerState.enabled) {
        timerEl.textContent = '计时: 不限时';
      } else {
        const sideText = timerState.activeSide === 'r' ? '红方' : '黑方';
        timerEl.textContent = `计时: ${sideText} ${formatSeconds(timerState.secondsLeft)}`;
      }
    }
  }

  if (socket) {
    socket.on('connect', () => {
      bannerText = '等待对手加入...';
      updateTurnStatus();
      syncRestartButton();
      syncUndoButton();
      syncRoomControls();
      render();
    });

    socket.on('matchWaiting', (payload) => {
      roomId = payload.roomId;
      mySide = payload.side || null;
      isHost = !!payload.isHost;
      roomSettings = payload.settings || roomSettings;
      currentTurn = payload.currentTurn || 'r';
      isMatched = false;
      selected = null;
      gameOver = false;
      lastMove = null;
      bannerText = '等待对手加入...';
      updateTurnStatus();
      syncRestartButton();
      syncUndoButton();
      syncRoomControls();
      render();
    });

    socket.on('roomSettingsUpdated', (payload) => {
      if (payload && payload.settings) {
        roomSettings = payload.settings;
      }
      bannerText = `房间设置更新：${roomSettings.timeLimitSeconds === null ? '不限时' : `${roomSettings.timeLimitSeconds}秒`} / ${roomSettings.preferredSide === 'random' ? '随机阵营' : (roomSettings.preferredSide === 'r' ? '房主红方' : '房主黑方')}`;
      syncRoomControls();
      render();
    });

    socket.on('matchFound', (payload) => {
      roomId = payload.roomId;
      mySide = payload.side;
      isHost = !!payload.isHost;
      roomSettings = payload.settings || roomSettings;
      isMatched = true;
      resetLocalBoard();
      applyServerBoard(payload.board || initialBoard);
      lastMove = payload.lastMove || null;
      bannerText = '游戏开始，红方走位';
      if (payload.currentTurn) {
        currentTurn = payload.currentTurn;
      }
      updateTurnStatus();
      syncRestartButton();
      syncUndoButton();
      syncRoomControls();
      render();
    });

    socket.on('opponentMove', (payload) => {
      if (gameOver) {
        return;
      }

      const from = payload.from;
      const to = payload.to;
      const piece = payload.piece || boardState[from.row][from.col];
      if (!piece) {
        return;
      }

      boardState[to.row][to.col] = piece;
      boardState[from.row][from.col] = null;
      lastMove = {
        side: piece[0],
        piece,
        from,
        to
      };
      selected = null;
      updateTurnStatus();
      render();
    });

    socket.on('lastMoveUpdate', (payload) => {
      if (!payload || !payload.lastMove) {
        return;
      }
      lastMove = payload.lastMove;
      render();
    });

    socket.on('turnUpdate', (payload) => {
      currentTurn = payload.currentTurn;
      updateTurnStatus();
      render();
    });

    socket.on('timerUpdate', (payload) => {
      timerState = {
        enabled: !!payload.enabled,
        activeSide: payload.activeSide || 'r',
        secondsLeft: payload.secondsLeft,
        timeLimitSeconds: payload.timeLimitSeconds
      };
      render();
    });

    socket.on('check', (payload) => {
      if (gameOver) {
        return;
      }
      if (payload.sideUnderCheck === mySide) {
        bannerText = '将军！你被将军';
      } else {
        bannerText = '将军！';
      }
      render();
    });

    socket.on('gameOver', (payload) => {
      gameOver = true;
      selected = null;
      let message = '';

      if (payload.reason === 'timeout') {
        const isWin = payload.winner === mySide;
        bannerText = isWin ? '你赢了！对方超时判负' : '你输了！你方超时';
        message = isWin ? '胜利！对方超时。' : '失败！你已超时。';
      } else {
        const isWinByCapture = payload.winner === mySide;
        bannerText = isWinByCapture ? '你赢了！已吃掉对方将/帅' : '你输了！对方吃掉了你的将/帅';
        message = isWinByCapture ? '胜利！' : '失败！';
      }

      updateTurnStatus();
      syncRestartButton();
      syncUndoButton();
      render();
      alert(message);
    });

    socket.on('gameReset', (payload) => {
      resetLocalBoard();
      applyServerBoard(payload && payload.board ? payload.board : initialBoard);
      lastMove = payload && payload.lastMove ? payload.lastMove : null;
      if (payload && payload.settings) {
        roomSettings = payload.settings;
      }
      if (payload && payload.currentTurn) {
        currentTurn = payload.currentTurn;
      }
      bannerText = '棋局已重置，红方先行';
      updateTurnStatus();
      syncRestartButton();
      syncUndoButton();
      syncRoomControls();
      render();
    });

    socket.on('undoRequestSent', () => {
      bannerText = '悔棋请求已发送，等待对方确认...';
      render();
    });

    socket.on('undoRequested', (payload) => {
      const requesterText = payload.requesterSide === 'r' ? '红方' : '黑方';
      const message = `${requesterText}请求悔棋，预计回退${payload.rollbackSteps}步，是否同意？`;
      const accept = window.confirm(message);
      socket.emit('respondUndo', { accept });
    });

    socket.on('undoApplied', (payload) => {
      if (payload && payload.board) {
        applyServerBoard(payload.board);
      }
      if (payload && payload.currentTurn) {
        currentTurn = payload.currentTurn;
      }
      lastMove = payload ? payload.lastMove || null : null;
      selected = null;
      gameOver = false;
      bannerText = payload && payload.message ? payload.message : '悔棋成功';
      updateTurnStatus();
      syncRestartButton();
      syncUndoButton();
      render();
    });

    socket.on('undoResult', (payload) => {
      bannerText = payload && payload.message ? payload.message : '悔棋请求已处理';
      render();
    });

    socket.on('undoRequestFailed', (payload) => {
      bannerText = `悔棋请求失败: ${payload.reason}`;
      render();
    });

    socket.on('settingsRejected', (payload) => {
      bannerText = `房间设置修改失败: ${payload.reason}`;
      render();
    });

    socket.on('invalidMove', (payload) => {
      bannerText = `非法走子: ${payload.reason}`;
      render();
    });

    socket.on('opponentEscaped', () => {
      isMatched = false;
      mySide = null;
      roomId = null;
      isHost = false;
      resetLocalBoard();
      bannerText = '对手已退出，正在重新匹配...';
      updateTurnStatus();
      syncRestartButton();
      syncUndoButton();
      syncRoomControls();
      render();
    });
  } else {
    isMatched = true;
    bannerText = '离线模式：双方同屏轮流走子';
    updateTurnStatus();
  }

  function boardX(col) {
    return OFFSET_X + col * CELL;
  }

  function boardY(row) {
    return OFFSET_Y + row * CELL;
  }

  function inBounds(row, col) {
    return row >= 0 && row < ROWS && col >= 0 && col < COLS;
  }

  function isInsidePalace(side, row, col) {
    const inCols = col >= 3 && col <= 5;
    if (!inCols) {
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
    const target = `${side}K`;
    for (let row = 0; row < ROWS; row += 1) {
      for (let col = 0; col < COLS; col += 1) {
        if (board[row][col] === target) {
          return { row, col };
        }
      }
    }
    return null;
  }

  function areGeneralsFacing(board) {
    const redGeneral = findGeneral('r', board);
    const blackGeneral = findGeneral('b', board);

    if (!redGeneral || !blackGeneral) {
      return false;
    }

    if (redGeneral.col !== blackGeneral.col) {
      return false;
    }

    return countPiecesBetween(redGeneral.row, redGeneral.col, blackGeneral.row, blackGeneral.col, board) === 0;
  }

  function isForwardMove(side, deltaRow) {
    return side === 'r' ? deltaRow === -1 : deltaRow === 1;
  }

  function hasCrossedRiver(side, row) {
    return side === 'r' ? row <= 4 : row >= 5;
  }

  function checkValidMove(piece, startRow, startCol, endRow, endCol, board) {
    if (!piece) {
      return false;
    }
    if (!inBounds(startRow, startCol) || !inBounds(endRow, endCol)) {
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

    const trial = board.map((row) => row.slice());
    trial[endRow][endCol] = piece;
    trial[startRow][startCol] = null;

    return !areGeneralsFacing(trial);
  }

  function canOperateSide(side) {
    if (gameOver) {
      return false;
    }
    if (!socket) {
      return side === currentTurn;
    }
    return isMatched && mySide === side && currentTurn === mySide;
  }

  function getBoardPositionFromMouse(event) {
    const rect = canvas.getBoundingClientRect();
    const clickX = event.clientX - rect.left;
    const clickY = event.clientY - rect.top;

    const col = Math.round((clickX - OFFSET_X) / CELL);
    const row = Math.round((clickY - OFFSET_Y) / CELL);

    if (!inBounds(row, col)) {
      return null;
    }

    const centerX = boardX(col);
    const centerY = boardY(row);
    const dx = clickX - centerX;
    const dy = clickY - centerY;
    const distance = Math.sqrt(dx * dx + dy * dy);

    if (distance > CELL * 0.45) {
      return null;
    }

    return { row, col };
  }

  function handleCanvasClick(event) {
    if (gameOver) {
      return;
    }

    const pos = getBoardPositionFromMouse(event);
    if (!pos) {
      return;
    }

    const { row, col } = pos;
    const clickedPiece = boardState[row][col];

    if (!selected) {
      if (clickedPiece && canOperateSide(clickedPiece[0])) {
        selected = { row, col };
        render();
      }
      return;
    }

    if (clickedPiece && canOperateSide(clickedPiece[0])) {
      selected = { row, col };
      render();
      return;
    }

    const startRow = selected.row;
    const startCol = selected.col;
    const movingPiece = boardState[startRow][startCol];

    if (!movingPiece || !canOperateSide(movingPiece[0])) {
      selected = null;
      render();
      return;
    }

    if (!checkValidMove(movingPiece, startRow, startCol, row, col, boardState)) {
      bannerText = '非法走子';
      render();
      return;
    }

    const captured = boardState[row][col];
    boardState[row][col] = movingPiece;
    boardState[startRow][startCol] = null;
    lastMove = {
      side: movingPiece[0],
      piece: movingPiece,
      from: { row: startRow, col: startCol },
      to: { row, col }
    };
    selected = null;

    if (captured && captured[1] === 'K') {
      gameOver = true;
      bannerText = '你赢了！已吃掉对方将/帅';
      updateTurnStatus();
      syncRestartButton();
      syncUndoButton();
    } else {
      currentTurn = currentTurn === 'r' ? 'b' : 'r';
      updateTurnStatus();
    }

    if (socket && roomId) {
      socket.emit('move', {
        from: { row: startRow, col: startCol },
        to: { row, col }
      });
    }

    render();
  }

  function drawBoardBackground() {
    ctx.fillStyle = '#f3d9a4';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }

  function drawOuterBorder() {
    const x = boardX(0);
    const y = boardY(0);
    const w = CELL * (COLS - 1);
    const h = CELL * (ROWS - 1);

    ctx.strokeStyle = '#7a4c1f';
    ctx.lineWidth = 3;
    ctx.strokeRect(x, y, w, h);
  }

  function drawGridLines() {
    ctx.strokeStyle = '#7a4c1f';
    ctx.lineWidth = 1.5;

    for (let row = 0; row < ROWS; row += 1) {
      ctx.beginPath();
      ctx.moveTo(boardX(0), boardY(row));
      ctx.lineTo(boardX(COLS - 1), boardY(row));
      ctx.stroke();
    }

    for (let col = 0; col < COLS; col += 1) {
      const x = boardX(col);
      if (col === 0 || col === COLS - 1) {
        ctx.beginPath();
        ctx.moveTo(x, boardY(0));
        ctx.lineTo(x, boardY(ROWS - 1));
        ctx.stroke();
      } else {
        ctx.beginPath();
        ctx.moveTo(x, boardY(0));
        ctx.lineTo(x, boardY(4));
        ctx.stroke();

        ctx.beginPath();
        ctx.moveTo(x, boardY(5));
        ctx.lineTo(x, boardY(ROWS - 1));
        ctx.stroke();
      }
    }
  }

  function drawRiver() {
    const riverYTop = boardY(4);
    const riverYBottom = boardY(5);

    ctx.fillStyle = '#f3d9a4';
    ctx.fillRect(boardX(1), riverYTop + 1, CELL * 7, riverYBottom - riverYTop - 2);

    ctx.fillStyle = '#7a4c1f';
    ctx.font = 'bold 30px "KaiTi", "STKaiti", serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('楚河', boardX(2), (riverYTop + riverYBottom) / 2);
    ctx.fillText('汉界', boardX(6), (riverYTop + riverYBottom) / 2);
  }

  function drawPalaceDiagonals() {
    const palaceLines = [
      [3, 0, 5, 2],
      [5, 0, 3, 2],
      [3, 7, 5, 9],
      [5, 7, 3, 9]
    ];

    ctx.strokeStyle = '#7a4c1f';
    ctx.lineWidth = 1.5;

    palaceLines.forEach(([c1, r1, c2, r2]) => {
      ctx.beginPath();
      ctx.moveTo(boardX(c1), boardY(r1));
      ctx.lineTo(boardX(c2), boardY(r2));
      ctx.stroke();
    });
  }

  function drawLastMoveHighlightCell(row, col, fillColor, strokeColor) {
    const x = boardX(col) - CELL / 2 + 2;
    const y = boardY(row) - CELL / 2 + 2;
    const size = CELL - 4;

    ctx.fillStyle = fillColor;
    ctx.fillRect(x, y, size, size);

    ctx.strokeStyle = strokeColor;
    ctx.lineWidth = 2;
    ctx.strokeRect(x, y, size, size);
  }

  function drawLastMoveMarker(row, col, color) {
    const x = boardX(col);
    const y = boardY(row);
    ctx.beginPath();
    ctx.arc(x, y, 8, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
  }

  function drawLastMove() {
    if (!lastMove || !lastMove.from || !lastMove.to) {
      return;
    }

    drawLastMoveHighlightCell(lastMove.from.row, lastMove.from.col, 'rgba(255, 173, 84, 0.26)', 'rgba(212, 124, 29, 0.65)');
    drawLastMoveHighlightCell(lastMove.to.row, lastMove.to.col, 'rgba(255, 206, 120, 0.32)', 'rgba(212, 124, 29, 0.8)');
    drawLastMoveMarker(lastMove.from.row, lastMove.from.col, '#d76d1b');
    drawLastMoveMarker(lastMove.to.row, lastMove.to.col, '#8e3b12');
  }

  function drawPiece(code, row, col) {
    const x = boardX(col);
    const y = boardY(row);
    const isRed = code[0] === 'r';

    ctx.beginPath();
    ctx.arc(x, y, PIECE_RADIUS, 0, Math.PI * 2);
    ctx.fillStyle = '#fff6e5';
    ctx.fill();

    ctx.lineWidth = 2;
    ctx.strokeStyle = isRed ? '#c0392b' : '#2f2f2f';
    ctx.stroke();

    ctx.fillStyle = isRed ? '#c0392b' : '#222222';
    ctx.font = 'bold 28px "KaiTi", "STKaiti", serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(pieceText[code], x, y + 1);
  }

  function drawPieces() {
    for (let row = 0; row < ROWS; row += 1) {
      for (let col = 0; col < COLS; col += 1) {
        const piece = boardState[row][col];
        if (piece) {
          drawPiece(piece, row, col);
        }
      }
    }
  }

  function drawSelection() {
    if (!selected) {
      return;
    }

    const x = boardX(selected.col);
    const y = boardY(selected.row);

    ctx.beginPath();
    ctx.arc(x, y, PIECE_RADIUS + 6, 0, Math.PI * 2);
    ctx.strokeStyle = '#f1c40f';
    ctx.lineWidth = 3;
    ctx.stroke();
  }

  function render() {
    drawBoardBackground();
    drawOuterBorder();
    drawGridLines();
    drawRiver();
    drawPalaceDiagonals();
    drawLastMove();
    drawPieces();
    drawSelection();
    updateStatusPanel();
  }

  canvas.addEventListener('click', handleCanvasClick);

  if (restartBtn) {
    restartBtn.addEventListener('click', () => {
      if (socket && roomId) {
        socket.emit('resetGame');
      } else {
        resetLocalBoard();
        bannerText = '棋局已重置，红方先行';
        updateTurnStatus();
        syncRestartButton();
        syncUndoButton();
        render();
      }
    });
  }

  if (undoBtn) {
    undoBtn.addEventListener('click', () => {
      if (!socket || !roomId || !isMatched || gameOver) {
        return;
      }
      socket.emit('requestUndo');
    });
  }

  if (applySettingsBtn) {
    applySettingsBtn.addEventListener('click', () => {
      if (!socket || !isHost || isMatched) {
        return;
      }

      const preferredSide = sideSelect ? sideSelect.value : 'random';
      const timeLimitSeconds = timeSelect ? fromTimeOptionValue(timeSelect.value) : null;

      socket.emit('updateRoomSettings', {
        preferredSide,
        timeLimitSeconds
      });
    });
  }

  window.checkValidMove = checkValidMove;
  updateTurnStatus();
  syncRestartButton();
  syncUndoButton();
  syncRoomControls();
  render();
})();
