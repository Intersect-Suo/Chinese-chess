# Chinese Chess Online | 中国象棋在线对战

A real-time Chinese Chess (Xiangqi) web project built with Node.js + Express + Socket.IO.

这是一个基于 Node.js + Express + Socket.IO 的中国象棋实时联机项目。

---

## 1. Features | 功能特性

### English
- Real-time 1v1 matchmaking and synchronized board state.
- Server-side Xiangqi move validation (including palace rules, river rules, cannon jump, horse leg block, facing generals check).
- Last move highlighting (from/to markers).
- Host room settings before start:
  - Side preference: Red / Black / Random
  - Turn time limit: Unlimited / 30s / 60s / 120s
- Ready-up lobby flow:
  - Before start: only Ready button.
  - In game: only Surrender + Undo buttons.
  - After game over: only Restart button.
- Undo flow (request -> opponent confirm -> apply).
- Restart flow (request -> opponent confirm -> reset to pre-game ready state).
- Surrender flow (no approval needed, immediate game over).
- Timeout auto-loss when turn timer reaches zero.
- Board orientation by assigned side (your own side at bottom).
- Unified in-game notice and end-of-game copy style.

### 中文
- 实时 1v1 自动匹配与棋盘状态同步。
- 服务端象棋规则校验（九宫、过河、炮架、蹩马腿、将帅照面等）。
- 上一步走法高亮（起点/终点标注）。
- 开局前房主可配置房间参数：
  - 阵营偏好：红方 / 黑方 / 随机
  - 回合限时：不限时 / 30 秒 / 60 秒 / 120 秒
- 准备开局流程：
  - 未开始：仅显示“准备”按钮
  - 对局中：仅显示“认输”“悔棋”
  - 对局结束：仅显示“重新开始”
- 悔棋流程（申请 -> 对方确认 -> 生效）。
- 重开流程（申请 -> 对方确认 -> 回到待准备状态）。
- 认输流程（无需对方确认，立即判负）。
- 超时自动判负（当前行棋方超时即失败）。
- 棋盘按分配阵营翻转（己方棋子位于下方）。
- 提示文案和结算文案统一。

---

## 2. Tech Stack | 技术栈

- Node.js
- Express `^4.18.2`
- Socket.IO `^2.5.0`
- Vanilla HTML/CSS/JavaScript (Canvas rendering)

---

## 3. Project Structure | 项目结构

```text
Chinese-chess/
├─ server.js                 # Backend server + room/state/event logic
├─ package.json              # Dependencies and npm scripts
├─ package-lock.json
└─ public/
   ├─ index.html             # UI layout
   ├─ style.css              # UI styles
   └─ game.js                # Client game logic + rendering + socket events
```

---

## 4. Quick Start | 快速开始

### 4.1 Requirements | 环境要求

- Node.js 14+ (recommended 16+)
- npm

### 4.2 Install | 安装依赖

```bash
npm install
```

### 4.3 Run | 启动项目

```bash
npm start
```

The server starts at:

```text
http://localhost:3000
```

服务器默认启动地址：

```text
http://localhost:3000
```

---

## 5. Gameplay Flow | 对局流程

### English
1. Player A opens page, becomes host, waits in lobby.
2. Player B opens page, joins the same waiting room.
3. Host can adjust side/time settings before game starts.
4. Both players click Ready.
5. Game starts, turn timer (if enabled) begins.
6. During game, players can move, request undo, request restart, or surrender.
7. Game ends by capture-general, timeout, or surrender.

### 中文
1. 玩家 A 打开页面后成为房主，进入等待状态。
2. 玩家 B 打开页面后加入同一等待房间。
3. 开局前房主可调整阵营与限时设置。
4. 双方点击“准备”。
5. 对局开始（若启用限时则开始倒计时）。
6. 对局中可走子、申请悔棋、申请重开、主动认输。
7. 对局可由吃将/帅、超时、认输结束。

---

## 6. Controls by Phase | 分阶段按钮规则

### English
- Pre-game: `Ready`
- In-game: `Undo`, `Surrender`
- Post-game: `Restart`

### 中文
- 未开局：`准备`
- 对局中：`悔棋`、`认输`
- 对局结束：`重新开始`

---

## 7. Core Socket Events | 核心事件

### Server receives | 服务端接收
- `updateRoomSettings`
- `setReady`
- `move`
- `requestUndo`
- `respondUndo`
- `requestRestart`
- `respondRestart`
- `surrender`
- `resetGame`

### Client receives | 客户端接收
- Match/lobby: `matchWaiting`, `matchFound`, `roomSettingsUpdated`, `readyStateUpdate`, `gameStarted`
- Game sync: `opponentMove`, `lastMoveUpdate`, `turnUpdate`, `timerUpdate`, `check`
- End/result: `gameOver`, `surrendered`, `gameReset`, `restartApplied`
- Request/response: `undoRequestSent`, `undoRequested`, `undoApplied`, `undoResult`, `undoRequestFailed`, `restartRequestSent`, `restartRequested`, `restartResult`
- Error/escape: `invalidMove`, `settingsRejected`, `opponentEscaped`

---

## 8. Notes | 说明

### English
- This project currently uses in-memory room state (`Map`) in `server.js`; restarting the server clears all rooms/games.
- For production, consider adding persistent storage, authentication, reconnection handling, and anti-cheat logging.

### 中文
- 当前房间与对局状态使用 `server.js` 内存 `Map` 存储；重启服务会清空对局。
- 若用于生产环境，建议补充持久化存储、鉴权、断线重连、反作弊日志等能力。

---

## 9. Script | 脚本

```bash
npm start
```

---

## 10. License | 许可证

No license file is currently provided.

当前仓库未提供独立许可证文件。
