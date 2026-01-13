
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

// Make canvas focusable (helps keyboard input, especially after clicking buttons)
canvas.tabIndex = 0;
canvas.style.outline = "none";
canvas.addEventListener("pointerdown", () => canvas.focus());

const BEST_KEY = "crispy_snake_best_js_v1";
let best = Number(localStorage.getItem(BEST_KEY) || "0");
elBest.textContent = String(best);

// Board settings
const GRID = 24;
const START_LEN = 3;
const BASE_TICK_MS = 120;

// Game state
let snake = [];
let dir = "R";
let queuedDir = null;
let food = { x: 0, y: 0 };
let score = 0;
let dead = false;

let running = false;
let paused = false;
let lastTick = 0;

// ------- Canvas sizing -------
function fitCanvasToCSS() {
  const rect = canvas.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.round(rect.width * dpr);
  canvas.height = Math.round(rect.width * dpr);
}
window.addEventListener("resize", () => { fitCanvasToCSS(); render(); });
fitCanvasToCSS();

// ------- UI helpers -------
function setOverlay(show, title, text, btnText, enabled, onClick) {
  if (show) overlay.classList.remove("hidden");
  else overlay.classList.add("hidden");

  overlayTitle.textContent = title ?? "Crispy Snake";
  overlayText.textContent = text ?? "";
  overlayBtn.textContent = btnText ?? "Start";
  overlayBtn.disabled = !enabled;
  if (onClick) overlayBtn.onclick = onClick;
}

function updateHUD() {
  elScore.textContent = String(score);
  const speedMult = getSpeedMult();
  elSpeed.textContent = `${speedMult.toFixed(2)}×`;

  if (score > best) {
    best = score;
    localStorage.setItem(BEST_KEY, String(best));
    elBest.textContent = String(best);
  }
}

function getSpeedMult() {
  // gentle ramp; cap at ~2.35x
  return 1 + Math.min(1.35, score * 0.05);
}

function tickInterval() {
  return BASE_TICK_MS / getSpeedMult();
}

// ------- Game logic -------
function resetGame() {
  score = 0;
  dead = false;
  dir = "R";
  queuedDir = null;

  const cx = Math.floor(GRID / 2);
  const cy = Math.floor(GRID / 2);

  snake = [];
  for (let i = 0; i < START_LEN; i++) {
    snake.push({ x: cx - i, y: cy });
  }

  placeFood();
  updateHUD();
  render();
}

function placeFood() {
  const occupied = new Set(snake.map(p => `${p.x},${p.y}`));
  while (true) {
    const x = Math.floor(Math.random() * GRID);
    const y = Math.floor(Math.random() * GRID);
    if (!occupied.has(`${x},${y}`)) {
      food = { x, y };
      return;
    }
  }
}

const OPP = { U:"D", D:"U", L:"R", R:"L" };
function queueDirection(d) {
  if (d === OPP[dir]) return;
  queuedDir = d;
}

function step() {
  if (dead) return;

  if (queuedDir && queuedDir !== OPP[dir]) {
    dir = queuedDir;
  }
  queuedDir = null;

  const head = snake[0];
  let nx = head.x;
  let ny = head.y;

  if (dir === "U") ny--;
  if (dir === "D") ny++;
  if (dir === "L") nx--;
  if (dir === "R") nx++;

  if (wrapWalls.checked) {
    nx = (nx + GRID) % GRID;
    ny = (ny + GRID) % GRID;
  } else {
    if (nx < 0 || nx >= GRID || ny < 0 || ny >= GRID) {
      dead = true;
      return;
    }
  }

  const newHead = { x: nx, y: ny };
  const willEat = (nx === food.x && ny === food.y);

  // Collision: moving into the tail is allowed if we are NOT eating (tail moves away)
  const tail = snake[snake.length - 1];
  const hitsBody = snake.some(
    (p, i) => p.x === nx && p.y === ny &&
      !( !willEat && p.x === tail.x && p.y === tail.y && i === snake.length - 1 )
  );
  if (hitsBody) {
    dead = true;
    return;
  }

  snake.unshift(newHead);

  if (willEat) {
    score += 1;
    placeFood();
  } else {
    snake.pop();
  }
}

// ------- Rendering -------
function roundRect(c, x, y, w, h, r) {
  const rr = Math.max(0, Math.min(r, Math.min(w, h)/2));
  c.beginPath();
  c.moveTo(x + rr, y);
  c.arcTo(x + w, y, x + w, y + h, rr);
  c.arcTo(x + w, y + h, x, y + h, rr);
  c.arcTo(x, y + h, x, y, rr);
  c.arcTo(x, y, x + w, y, rr);
  c.closePath();
}

function render() {
  const w = canvas.width, h = canvas.height;
  ctx.clearRect(0, 0, w, h);

  const cell = Math.floor(Math.min(w, h) / GRID);
  const bw = cell * GRID;
  const bh = cell * GRID;
  const ox = Math.floor((w - bw) / 2);
  const oy = Math.floor((h - bh) / 2);

  ctx.fillStyle = "#05070f";
  ctx.fillRect(0, 0, w, h);

  ctx.save();
  ctx.translate(ox, oy);

  // grid
  ctx.save();
  ctx.globalAlpha = 0.10;
  ctx.strokeStyle = "#b8c4ff";
  ctx.lineWidth = 1;
  for (let i = 0; i <= GRID; i++) {
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
  const fx = food.x * cell, fy = food.y * cell;
  const cx = fx + cell/2, cy = fy + cell/2;
  const grd = ctx.createRadialGradient(cx, cy, cell*0.1, cx, cy, cell*0.95);
  grd.addColorStop(0, "rgba(45,226,230,.95)");
  grd.addColorStop(0.35, "rgba(124,92,255,.45)");
  grd.addColorStop(1, "rgba(45,226,230,0)");
  ctx.fillStyle = grd;
  ctx.fillRect(fx - cell, fy - cell, cell*3, cell*3);

  // food
  ctx.fillStyle = "rgba(45,226,230,.95)";
  roundRect(ctx, fx + cell*0.18, fy + cell*0.18, cell*0.64, cell*0.64, cell*0.22);
  ctx.fill();

  // snake
  for (let i = snake.length - 1; i >= 0; i--) {
    const p = snake[i];
    const x = p.x * cell, y = p.y * cell;

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
      // body
      ctx.fillStyle = "rgba(78,252,122,.85)";
      roundRect(ctx, x + cell*0.16, y + cell*0.16, cell*0.68, cell*0.68, cell*0.22);
      ctx.fill();
    }
    ctx.restore();
  }

  // border
  ctx.strokeStyle = "rgba(255,255,255,.16)";
  ctx.lineWidth = 2;
  roundRect(ctx, 1, 1, bw - 2, bh - 2, 18);
  ctx.stroke();

  ctx.restore();
}

// ------- Loop -------
function loop(t) {
  requestAnimationFrame(loop);
  if (!running || paused) return;

  const interval = tickInterval();
  if (t - lastTick >= interval) {
    step();
    lastTick = t;

    render();
    updateHUD();

    if (dead) {
      running = false;
      paused = false;

      btnStart.disabled = false;
      btnStart.textContent = "Start";
      btnPause.textContent = "Pause";
      btnPause.disabled = true;
      elStatus.textContent = "Game Over";

      setOverlay(
        true,
        "Game Over",
        `Score: ${score}\nBest: ${best}\n\nPress Restart to play again.`,
        "Restart",
        true,
        () => restart(true)
      );
    }
  }
}
requestAnimationFrame(loop);

// ------- Controls -------
function start() {
  canvas.focus(); // ensure keyboard focus

  if (dead) resetGame();

  running = true;
  paused = false;
  btnStart.disabled = true;
  btnStart.textContent = "Running";
  btnPause.disabled = false;
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
    setOverlay(true, "Paused", "Press Space or Resume to continue.", "Resume", true, togglePause);
  } else {
    setOverlay(false);
    lastTick = performance.now();
  }
}

function restart(autostart) {
  resetGame();
  running = false;
  paused = false;

  btnStart.disabled = false;
  btnStart.textContent = "Start";
  btnPause.disabled = true;
  btnPause.textContent = "Pause";
  elStatus.textContent = "Ready";

  setOverlay(true, "Crispy Snake", "Press Start to begin.", "Start", true, start);

  if (autostart) start();
}

// ------- Input (FIXED) -------
function setupInput() {
  // Capture mode prevents focused buttons/checkbox from consuming arrow keys/space
  document.addEventListener("keydown", (e) => {
    const k = e.key;
    const key = (k.length === 1) ? k.toLowerCase() : k.toLowerCase();

    const isGameKey =
      key === "arrowup" || key === "arrowdown" || key === "arrowleft" || key === "arrowright" ||
      key === "w" || key === "a" || key === "s" || key === "d" ||
      key === " " || e.code === "Space";

    if (isGameKey) e.preventDefault();

    if (key === " " || e.code === "Space") {
      if (running) togglePause();
      return;
    }

    const map = {
      arrowup: "U", w: "U",
      arrowdown: "D", s: "D",
      arrowleft: "L", a: "L",
      arrowright: "R", d: "R",
    };

    const d = map[key];
    if (d) queueDirection(d);
  }, { capture: true });
}

// ------- Button wiring -------
btnStart.onclick = start;
overlayBtn.onclick = start;
btnRestart.onclick = () => restart(false);
btnPause.onclick = togglePause;

// ------- Initial state (FIXED: call setupInput) -------
setupInput();
resetGame();
setOverlay(true, "Crispy Snake", "Press Start to begin.", "Start", true, start);
