// snakegameJs.js
// Python handles game state, JS renders + input, via Pyodide.

const elScore = document.getElementById("score");
const elBest = document.getElementById("best");
const elSpeed = document.getElementById("speed");
const elStatus = document.getElementById("status");

const btnStart = document.getElementById("btnStart");
const btnPause = document.getElementById("btnPause");
const btnRestart = document.getElementById("btnRestart");
const overlay = document.getElementById("overlay");
const overlayTitle = document.getElementById("overlayTitle");
const overlayText = document.getElementById("overlayText");
const overlayBtn = document.getElementById("overlayBtn");
const wrapWalls = document.getElementById("wrapWalls");

const canvas = document.getElementById("board");
const ctx = canvas.getContext("2d");

// HiDPI crisp canvas
function fitCanvasToCSS() {
  const rect = canvas.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.round(rect.width * dpr);
  canvas.height = Math.round(rect.width * dpr); // keep square
}
window.addEventListener("resize", fitCanvasToCSS);
fitCanvasToCSS();

const BEST_KEY = "snake_best_score_v1";
let best = Number(localStorage.getItem(BEST_KEY) || "0");
elBest.textContent = String(best);

let pyodide = null;
let game = null;

let running = false;
let paused = false;
let rafId = null;
let lastTick = 0;

// Input buffer: prevent 180° reversal in same tick (Python also guards)
let pendingDir = null; // "U","D","L","R"

function setOverlay(show, title, text, buttonText, buttonEnabled) {
  if (show) overlay.classList.remove("hidden");
  else overlay.classList.add("hidden");
  overlayTitle.textContent = title ?? "Snake";
  overlayText.textContent = text ?? "";
  overlayBtn.textContent = buttonText ?? "Start";
  overlayBtn.disabled = !buttonEnabled;
}

function setUIEnabled(enabled) {
  btnStart.disabled = !enabled;
  btnPause.disabled = !enabled;
  btnRestart.disabled = !enabled;
  overlayBtn.disabled = !enabled;
}

function clamp(n, a, b) { return Math.max(a, Math.min(b, n)); }

// ---------- Rendering ----------
function drawBoard(state) {
  // state: { gridSize, snake, food, score, dead, speedMult, wrap }
  const grid = state.gridSize;
  const w = canvas.width;
  const h = canvas.height;

  // background
  ctx.clearRect(0, 0, w, h);

  // subtle grid
  const cell = Math.floor(Math.min(w, h) / grid);
  const boardW = cell * grid;
  const boardH = cell * grid;
  const ox = Math.floor((w - boardW) / 2);
  const oy = Math.floor((h - boardH) / 2);

  // soft vignette
  ctx.save();
  ctx.globalAlpha = 0.9;
  ctx.fillStyle = "#070a14";
  ctx.fillRect(0, 0, w, h);
  ctx.restore();

  ctx.save();
  ctx.translate(ox, oy);

  // grid lines (very subtle)
  ctx.globalAlpha = 0.12;
  ctx.strokeStyle = "#9fb0ff";
  ctx.lineWidth = 1;
  for (let i = 0; i <= grid; i++) {
    ctx.beginPath();
    ctx.moveTo(i * cell + 0.5, 0);
    ctx.lineTo(i * cell + 0.5, grid * cell);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(0, i * cell + 0.5);
    ctx.lineTo(grid * cell, i * cell + 0.5);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;

  // food glow
  const fx = state.food[0], fy = state.food[1];
  const foodX = fx * cell, foodY = fy * cell;
  ctx.save();
  ctx.globalAlpha = 0.9;
  const cx = foodX + cell / 2;
  const cy = foodY + cell / 2;
  const grd = ctx.createRadialGradient(cx, cy, cell * 0.1, cx, cy, cell * 0.85);
  grd.addColorStop(0, "rgba(45,226,230,.95)");
  grd.addColorStop(0.4, "rgba(124,92,255,.55)");
  grd.addColorStop(1, "rgba(45,226,230,0)");
  ctx.fillStyle = grd;
  ctx.fillRect(foodX - cell, foodY - cell, cell * 3, cell * 3);
  ctx.restore();

  // draw food
  ctx.save();
  ctx.fillStyle = "rgba(45,226,230,.95)";
  roundRect(ctx, foodX + cell * 0.18, foodY + cell * 0.18, cell * 0.64, cell * 0.64, cell * 0.22);
  ctx.fill();
  ctx.restore();

  // snake
  const snake = state.snake; // array of [x,y], head first
  for (let i = snake.length - 1; i >= 0; i--) {
    const [sx, sy] = snake[i];
    const x = sx * cell, y = sy * cell;

    const t = (snake.length <= 1) ? 0 : i / (snake.length - 1);
    // gradient along body using alpha
    const alpha = 0.35 + (1 - t) * 0.65;

    ctx.save();
    ctx.globalAlpha = alpha;

    if (i === 0) {
      // head
      ctx.fillStyle = "rgba(78,252,122,.98)";
      roundRect(ctx, x + cell * 0.12, y + cell * 0.12, cell * 0.76, cell * 0.76, cell * 0.26);
      ctx.fill();

      // eyes (tiny)
      ctx.globalAlpha = 0.9;
      ctx.fillStyle = "rgba(7,10,20,.85)";
      const ex1 = x + cell * 0.35, ex2 = x + cell * 0.60;
      const ey = y + cell * 0.40;
      ctx.beginPath(); ctx.arc(ex1, ey, cell * 0.06, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(ex2, ey, cell * 0.06, 0, Math.PI * 2); ctx.fill();
    } else {
      // body
      ctx.fillStyle = "rgba(78,252,122,.85)";
      roundRect(ctx, x + cell * 0.16, y + cell * 0.16, cell * 0.68, cell * 0.68, cell * 0.22);
      ctx.fill();
    }
    ctx.restore();
  }

  // border
  ctx.save();
  ctx.strokeStyle = "rgba(255,255,255,.16)";
  ctx.lineWidth = 2;
  roundRect(ctx, 1, 1, grid * cell - 2, grid * cell - 2, 18);
  ctx.stroke();
  ctx.restore();

  ctx.restore();

  // dead overlay hint handled by HTML overlay
}

function roundRect(ctx, x, y, w, h, r) {
  const rr = Math.max(0, Math.min(r, Math.min(w, h) / 2));
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

// ---------- Python code ----------
const PY_SNAKE = `
import random

DIRS = {"U": (0,-1), "D": (0,1), "L": (-1,0), "R": (1,0)}
OPP  = {"U":"D","D":"U","L":"R","R":"L"}

class SnakeGame:
    def __init__(self, grid_size=24, wrap=True):
        self.grid_size = grid_size
        self.wrap = bool(wrap)
        self.reset()

    def reset(self):
        g = self.grid_size
        cx = g // 2
        cy = g // 2
        self.snake = [(cx, cy), (cx-1, cy), (cx-2, cy)]
        self.dir = "R"
        self.pending = None
        self.score = 0
        self.dead = False
        self.speed_mult = 1.0
        self._place_food()

    def _place_food(self):
        g = self.grid_size
        occ = set(self.snake)
        while True:
            fx = random.randrange(0, g)
            fy = random.randrange(0, g)
            if (fx, fy) not in occ:
                self.food = (fx, fy)
                return

    def set_wrap(self, wrap):
        self.wrap = bool(wrap)

    def queue_dir(self, d):
        if d not in DIRS:
            return
        if d == OPP.get(self.dir):
            return
        # allow one buffered direction per tick; last wins
        self.pending = d

    def tick(self):
        if self.dead:
            return

        if self.pending is not None:
            # prevent 180 reversal even with buffer
            if self.pending != OPP.get(self.dir):
                self.dir = self.pending
            self.pending = None

        dx, dy = DIRS[self.dir]
        hx, hy = self.snake[0]
        nx, ny = hx + dx, hy + dy
        g = self.grid_size

        if self.wrap:
            nx %= g
            ny %= g
        else:
            if nx < 0 or nx >= g or ny < 0 or ny >= g:
                self.dead = True
                return

        new_head = (nx, ny)

        # moving into tail is ok if tail moves away this tick (not eating)
        will_eat = (new_head == self.food)
        tail = self.snake[-1]

        if new_head in self.snake and not (not will_eat and new_head == tail):
            self.dead = True
            return

        self.snake.insert(0, new_head)

        if will_eat:
            self.score += 1
            # speed ramps gently
            self.speed_mult = 1.0 + min(1.2, self.score * 0.045)
            self._place_food()
        else:
            self.snake.pop()

    def state(self):
        return {
            "gridSize": self.grid_size,
            "wrap": self.wrap,
            "snake": [list(p) for p in self.snake],
            "food": list(self.food),
            "score": self.score,
            "dead": self.dead,
            "speedMult": float(self.speed_mult),
        }
`;

// ---------- Game loop ----------
function baseTickMs() {
  // base 120ms, faster with speed multiplier
  // final tick = base / speedMult
  const mult = (game?.getSpeedMult?.() ?? 1.0);
  return 120 / mult;
}

async function init() {
  try {
    elStatus.textContent = "Loading Python runtime…";
    setOverlay(true, "Snake", "Loading Python runtime…", "Start", false);
    setUIEnabled(false);

    pyodide = await loadPyodide();
    await pyodide.runPythonAsync(PY_SNAKE);

    // Create a JS wrapper around the Python class instance
    const SnakeGame = pyodide.globals.get("SnakeGame");

    function makeGame() {
      const inst = SnakeGame.callKwargs([], { grid_size: 24, wrap: wrapWalls.checked });
      return {
        inst,
        reset() { inst.reset(); },
        tick() { inst.tick(); },
        state() { return inst.state().toJs({ dict_converter: Object.fromEntries }); },
        queueDir(d) { inst.queue_dir(d); },
        setWrap(w) { inst.set_wrap(w); },
        getSpeedMult() {
          const s = inst.state().toJs({ dict_converter: Object.fromEntries });
          return Number(s.speedMult || 1.0);
        }
      };
    }

    game = makeGame();

    elStatus.textContent = "Ready";
    setOverlay(true, "Snake", "Press Start to begin.\n\nTip: Space toggles pause.", "Start", true);

    btnStart.disabled = false;
    btnPause.disabled = false;
    btnRestart.disabled = false;
    overlayBtn.disabled = false;

    btnStart.onclick = () => startGame();
    overlayBtn.onclick = () => startGame();
    btnPause.onclick = () => togglePause();
    btnRestart.onclick = () => restartGame();

    wrapWalls.onchange = () => {
      if (game) game.setWrap(wrapWalls.checked);
    };

    // keyboard controls
    window.addEventListener("keydown", (e) => {
      const k = e.key.toLowerCase();

      if (k === " " || e.code === "Space") {
        e.preventDefault();
        togglePause();
        return;
      }

      const map = {
        "arrowup": "U", "w": "U",
        "arrowdown": "D", "s": "D",
        "arrowleft": "L", "a": "L",
        "arrowright": "R", "d": "R",
      };

      if (map[k]) {
        e.preventDefault();
        pendingDir = map[k];
      }
    });

    // initial render
    renderNow();

  } catch (err) {
    console.error(err);
    elStatus.textContent = "Failed to load";
    setOverlay(true, "Uh oh", "Couldn’t load Python runtime. Check your connection and refresh.", "Retry", true);
    overlayBtn.onclick = () => location.reload();
  }
}

function startGame() {
  if (!game) return;

  if (!running) {
    running = true;
    paused = false;
    btnStart.textContent = "Running";
    btnStart.disabled = true;
    btnPause.textContent = "Pause";
    setOverlay(false);
    elStatus.textContent = "Running";
    lastTick = performance.now();
    loop(performance.now());
  }
}

function togglePause() {
  if (!running) return;
  paused = !paused;

  btnPause.textContent = paused ? "Resume" : "Pause";
  elStatus.textContent = paused ? "Paused" : "Running";

  if (paused) {
    setOverlay(true, "Paused", "Press Space or Resume to continue.", "Resume", true);
    overlayBtn.onclick = () => togglePause();
  } else {
    setOverlay(false);
    lastTick = performance.now();
  }
}

function restartGame() {
  if (!game) return;
  game.reset();
  pendingDir = null;

  if (!running) {
    renderNow();
    setOverlay(true, "Snake", "Press Start to begin.\n\nTip: Space toggles pause.", "Start", true);
    overlayBtn.onclick = () => startGame();
    return;
  }

  paused = false;
  btnPause.textContent = "Pause";
  setOverlay(false);
  elStatus.textContent = "Running";
  lastTick = performance.now();
  renderNow();
}

function renderNow() {
  const state = game.state();
  drawBoard(state);
  updateHUD(state);
}

function updateHUD(state) {
  elScore.textContent = String(state.score);
  elSpeed.textContent = `${(state.speedMult || 1).toFixed(2)}×`;

  if (state.score > best) {
    best = state.score;
    localStorage.setItem(BEST_KEY, String(best));
    elBest.textContent = String(best);
  }
}

function loop(t) {
  rafId = requestAnimationFrame(loop);

  if (!running || paused) return;

  const stateBefore = game.state();
  const tickMs = 120 / (stateBefore.speedMult || 1);

  if (t - lastTick >= tickMs) {
    // apply buffered input once per tick
    if (pendingDir) {
      game.queueDir(pendingDir);
      pendingDir = null;
    }

    game.tick();
    lastTick = t;

    const state = game.state();
    drawBoard(state);
    updateHUD(state);

    if (state.dead) {
      paused = true;
      elStatus.textContent = "Game Over";
      btnPause.textContent = "Pause";
      btnStart.textContent = "Start";
      btnStart.disabled = false;
      running = false;

      setOverlay(
        true,
        "Game Over",
        `Score: ${state.score}  •  Best: ${best}\n\nPress Restart to try again.`,
        "Restart",
        true
      );
      overlayBtn.onclick = () => restartGame();
    }
  }
}

init();
