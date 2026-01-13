// snakegameJs.js — full rewrite
// Python = game logic (Pyodide), JS = rendering/input/UI

const elScore = document.getElementById("score");
const elBest  = document.getElementById("best");
const elSpeed = document.getElementById("speed");
const elStatus = document.getElementById("status");

const btnStart = document.getElementById("btnStart");
const btnPause = document.getElementById("btnPause");
const btnRestart = document.getElementById("btnRestart");
const wrapWalls = document.getElementById("wrapWalls");

const overlay = document.getElementById("overlay");
const overlayTitle = document.getElementById("overlayTitle");
const overlayText = document.getElementById("overlayText");
const overlayBtn = document.getElementById("overlayBtn");

const canvas = document.getElementById("board");
const ctx = canvas.getContext("2d");

const BEST_KEY = "crispy_snake_best_v2";

let best = Number(localStorage.getItem(BEST_KEY) || "0");
elBest.textContent = String(best);

let pyodide = null;
let inst = null;      // Python SnakeGame instance
let running = false;
let paused = false;

let pendingDir = null; // "U" "D" "L" "R"
let lastTick = 0;

// ---------- Helpers ----------
function setOverlay(show, title, text, buttonText, enabled) {
  if (show) overlay.classList.remove("hidden");
  else overlay.classList.add("hidden");

  overlayTitle.textContent = title ?? "Crispy Snake";
  overlayText.textContent = text ?? "";
  overlayBtn.textContent = buttonText ?? "Start";
  overlayBtn.disabled = !enabled;
}

function setControlsEnabled(enabled) {
  btnStart.disabled = !enabled;
  btnPause.disabled = !enabled;
  btnRestart.disabled = !enabled;
}

function fitCanvasToCSS() {
  const rect = canvas.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.round(rect.width * dpr);
  canvas.height = Math.round(rect.width * dpr);
}
window.addEventListener("resize", fitCanvasToCSS);
fitCanvasToCSS();

function roundRect(c, x, y, w, h, r) {
  const rr = Math.max(0, Math.min(r, Math.min(w, h) / 2));
  c.beginPath();
  c.moveTo(x + rr, y);
  c.arcTo(x + w, y, x + w, y + h, rr);
  c.arcTo(x + w, y + h, x, y + h, rr);
  c.arcTo(x, y + h, x, y, rr);
  c.arcTo(x, y, x + w, y, rr);
  c.closePath();
}

// ---------- Render ----------
function draw(state) {
  const grid = state.gridSize;
  const w = canvas.width, h = canvas.height;

  ctx.clearRect(0, 0, w, h);

  // board size in pixels
  const cell = Math.floor(Math.min(w, h) / grid);
  const bw = cell * grid;
  const bh = cell * grid;
  const ox = Math.floor((w - bw) / 2);
  const oy = Math.floor((h - bh) / 2);

  // background
  ctx.save();
  ctx.fillStyle = "#05070f";
  ctx.fillRect(0, 0, w, h);
  ctx.restore();

  ctx.save();
  ctx.translate(ox, oy);

  // subtle grid
  ctx.save();
  ctx.globalAlpha = 0.10;
  ctx.strokeStyle = "#b8c4ff";
  ctx.lineWidth = 1;
  for (let i = 0; i <= grid; i++) {
    ctx.beginPath();
    ctx.moveTo(i * cell + 0.5, 0);
    ctx.lineTo(i * cell + 0.5, bh);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(0, i * cell + 0.5);
    ctx.lineTo(bw, i * cell + 0.5);
    ctx.stroke();
  }
  ctx.restore();

  // food glow
  const [fx, fy] = state.food;
  const foodX = fx * cell;
  const foodY = fy * cell;
  const cx = foodX + cell / 2;
  const cy = foodY + cell / 2;

  ctx.save();
  const grd = ctx.createRadialGradient(cx, cy, cell * 0.1, cx, cy, cell * 0.95);
  grd.addColorStop(0, "rgba(45,226,230,.95)");
  grd.addColorStop(0.35, "rgba(124,92,255,.45)");
  grd.addColorStop(1, "rgba(45,226,230,0)");
  ctx.fillStyle = grd;
  ctx.fillRect(foodX - cell, foodY - cell, cell * 3, cell * 3);
  ctx.restore();

  // food
  ctx.save();
  ctx.fillStyle = "rgba(45,226,230,.95)";
  roundRect(ctx, foodX + cell*0.18, foodY + cell*0.18, cell*0.64, cell*0.64, cell*0.22);
  ctx.fill();
  ctx.restore();

  // snake
  const snake = state.snake; // array of [x,y]
  for (let i = snake.length - 1; i >= 0; i--) {
    const [sx, sy] = snake[i];
    const x = sx * cell, y = sy * cell;

    const t = snake.length <= 1 ? 0 : i / (snake.length - 1);
    const alpha = 0.35 + (1 - t) * 0.65;

    ctx.save();
    ctx.globalAlpha = alpha;

    if (i === 0) {
      // head
      ctx.fillStyle = "rgba(78,252,122,.98)";
      roundRect(ctx, x + cell*0.12, y + cell*0.12, cell*0.76, cell*0.76, cell*0.26);
      ctx.fill();

      // eyes
      ctx.globalAlpha = 0.9;
      ctx.fillStyle = "rgba(5,7,15,.85)";
      const ex1 = x + cell*0.35, ex2 = x + cell*0.60;
      const ey = y + cell*0.40;
      ctx.beginPath(); ctx.arc(ex1, ey, cell*0.06, 0, Math.PI*2); ctx.fill();
      ctx.beginPath(); ctx.arc(ex2, ey, cell*0.06, 0, Math.PI*2); ctx.fill();
    } else {
      ctx.fillStyle = "rgba(78,252,122,.85)";
      roundRect(ctx, x + cell*0.16, y + cell*0.16, cell*0.68, cell*0.68, cell*0.22);
      ctx.fill();
    }
    ctx.restore();
  }

  // border
  ctx.save();
  ctx.strokeStyle = "rgba(255,255,255,.16)";
  ctx.lineWidth = 2;
  roundRect(ctx, 1, 1, bw - 2, bh - 2, 18);
  ctx.stroke();
  ctx.restore();

  ctx.restore();
}

function updateHUD(state) {
  elScore.textContent = String(state.score);
  elSpeed.textContent = `${Number(state.speedMult).toFixed(2)}×`;

  if (state.score > best) {
    best = state.score;
    localStorage.setItem(BEST_KEY, String(best));
    elBest.textContent = String(best);
  }
}

// ---------- Python Game Code ----------
const PY_CODE = `
import random, math

DIRS = {"U": (0,-1), "D": (0,1), "L": (-1,0), "R": (1,0)}
OPP  = {"U":"D","D":"U","L":"R","R":"L"}

class SnakeGame:
    def __init__(self, grid_size=24, wrap=True):
        self.grid_size = int(grid_size)
        self.wrap = bool(wrap)
        self.reset()

    def reset(self):
        g = self.grid_size
        cx, cy = g//2, g//2
        self.snake = [(cx,cy), (cx-1,cy), (cx-2,cy)]
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
        self.pending = d

    def tick(self):
        if self.dead:
            return

        if self.pending is not None:
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
        will_eat = (new_head == self.food)
        tail = self.snake[-1]

        # collision (moving into tail is allowed if tail moves away this tick)
        if new_head in self.snake and not (not will_eat and new_head == tail):
            self.dead = True
            return

        self.snake.insert(0, new_head)

        if will_eat:
            self.score += 1
            self.speed_mult = 1.0 + min(1.35, self.score * 0.05)
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

# JS will create an instance named `game` in Python space.
`;

// ---------- Game Loop ----------
function tickIntervalMs(speedMult) {
  // base tick 120ms, faster with multiplier
  return 120 / Math.max(1.0, speedMult || 1.0);
}

function getState() {
  // Python dict -> JS object
  return inst.state().toJs({ dict_converter: Object.fromEntries });
}

function renderOnce() {
  const s = getState();
  draw(s);
  updateHUD(s);
}

function stopRunningToOverlay(title, text, buttonText, buttonHandler) {
  running = false;
  paused = false;

  btnStart.disabled = false;
  btnStart.textContent = "Start";
  btnPause.textContent = "Pause";
  elStatus.textContent = "Ready";

  setOverlay(true, title, text, buttonText, true);
  overlayBtn.onclick = buttonHandler;
}

function gameLoop(t) {
  requestAnimationFrame(gameLoop);
  if (!running || paused) return;

  const stateBefore = getState();
  const interval = tickIntervalMs(stateBefore.speedMult);

  if (t - lastTick >= interval) {
    if (pendingDir) {
      inst.queue_dir(pendingDir);
      pendingDir = null;
    }

    inst.tick();
    lastTick = t;

    const s = getState();
    draw(s);
    updateHUD(s);

    if (s.dead) {
      elStatus.textContent = "Game Over";
      stopRunningToOverlay(
        "Game Over",
        `Score: ${s.score}\nBest: ${best}\n\nPress Restart to play again.`,
        "Restart",
        () => restartGame(true)
      );
    }
  }
}

function startGame() {
  if (!inst) return;
  if (running) return;

  running = true;
  paused = false;
  btnStart.textContent = "Running";
  btnStart.disabled = true;
  btnPause.textContent = "Pause";
  elStatus.textContent = "Running";

  setOverlay(false);
  lastTick = performance.now();
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

function restartGame(autostart = false) {
  if (!inst) return;
  inst.reset();
  pendingDir = null;

  renderOnce();

  if (autostart) {
    startGame();
    return;
  }

  if (!running) {
    setOverlay(true, "Crispy Snake", "Press Start to begin.\n\nSpace toggles pause.", "Start", true);
    overlayBtn.onclick = () => startGame();
  }
}

// ---------- Input ----------
function setupInput() {
  window.addEventListener("keydown", (e) => {
    const key = e.key.toLowerCase();

    if (key === " " || e.code === "Space") {
      e.preventDefault();
      if (running) togglePause();
      return;
    }

    const map = {
      arrowup: "U", w: "U",
      arrowdown: "D", s: "D",
      arrowleft: "L", a: "L",
      arrowright: "R", d: "R",
    };

    if (map[key]) {
      e.preventDefault();
      pendingDir = map[key];
    }
  });
}

// ---------- Init ----------
async function init() {
  try {
    elStatus.textContent = "Loading Python runtime…";
    setOverlay(true, "Crispy Snake", "Loading Python runtime…", "Start", false);
    setControlsEnabled(false);

    pyodide = await loadPyodide();
    await pyodide.runPythonAsync(PY_CODE);

    // IMPORTANT: Create instance inside Python to avoid kwargs constructor issues
    const wrap = wrapWalls.checked ? "True" : "False";
    await pyodide.runPythonAsync(`game = SnakeGame(grid_size=24, wrap=${wrap})`);
    inst = pyodide.globals.get("game");

    // UI wiring
    btnStart.onclick = () => startGame();
    overlayBtn.onclick = () => startGame();

    btnPause.onclick = () => togglePause();
    btnRestart.onclick = () => restartGame(false);

    wrapWalls.onchange = () => {
      if (!inst) return;
      inst.set_wrap(wrapWalls.checked);
    };

    setupInput();

    elStatus.textContent = "Ready";
    setControlsEnabled(true);

    setOverlay(true, "Crispy Snake", "Press Start to begin.\n\nSpace toggles pause.", "Start", true);

    // First render
    renderOnce();

    // Start RAF loop
    requestAnimationFrame(gameLoop);

  } catch (err) {
    console.error(err);
    elStatus.textContent = "Failed";
    setControlsEnabled(false);
    setOverlay(true, "Uh oh", "Something failed to load.\nOpen Console (F12) to see the error.", "Reload", true);
    overlayBtn.onclick = () => location.reload();
  }
}

init();
