(() => {
  const canvas = document.getElementById('xiangqi-board');
  const ctx = canvas.getContext('2d');
  const restartBtn = document.getElementById('restart-btn');
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

  let boardState = cloneBoard(initialBoard);
  let selected = null;
  let currentTurn = 'r';
  let mySide = null;
  let roomId = null;
  let isMatched = false;
  let gameOver = false;
  let bannerText = '正在连接服务器...';
  let statusText = '';

  const socket = typeof io === 'function' ? io() : null;

  function resetLocalBoard() {
    boardState = cloneBoard(initialBoard);
    selected = null;
    currentTurn = 'r';
    gameOver = false;
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
  }

  if (socket) {
    socket.on('connect', () => {
      bannerText = '等待对手加入...';
      updateTurnStatus();
      syncRestartButton();
      render();
    });

    socket.on('matchWaiting', (payload) => {
      roomId = payload.roomId;
      mySide = payload.side;
      currentTurn = payload.currentTurn;
      isMatched = false;
      selected = null;
      gameOver = false;
      bannerText = '等待对手加入...';
      updateTurnStatus();
      syncRestartButton();
      render();
    });

    socket.on('matchFound', (payload) => {
      roomId = payload.roomId;
      mySide = payload.side;
      isMatched = true;
      resetLocalBoard();
      bannerText = '游戏开始，红方走位';
      if (payload.currentTurn) {
        currentTurn = payload.currentTurn;
      }
      updateTurnStatus();
      syncRestartButton();
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
      selected = null;
      updateTurnStatus();
      render();
    });

    socket.on('turnUpdate', (payload) => {
      currentTurn = payload.currentTurn;
      updateTurnStatus();
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
      const isWin = payload.winner === mySide;
      bannerText = isWin ? '你赢了！已吃掉对方将/帅' : '你输了！对方吃掉了你的将/帅';
      updateTurnStatus();
      syncRestartButton();
      render();
      alert(isWin ? '胜利！' : '失败！');
    });

    socket.on('gameReset', (payload) => {
      resetLocalBoard();
      if (payload && payload.currentTurn) {
        currentTurn = payload.currentTurn;
      }
      bannerText = '棋局已重置，红方先行';
      updateTurnStatus();
      syncRestartButton();
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
      resetLocalBoard();
      bannerText = '对手已逃跑，正在重新匹配...';
      updateTurnStatus();
      syncRestartButton();
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
    selected = null;

    if (captured && captured[1] === 'K') {
      gameOver = true;
      bannerText = '你赢了！已吃掉对方将/帅';
      updateTurnStatus();
      syncRestartButton();
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
        render();
      }
    });
  }

  window.checkValidMove = checkValidMove;
  updateTurnStatus();
  syncRestartButton();
  render();
})();
