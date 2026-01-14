(() => {
  const elScore = document.getElementById("score");
  const elLava = document.getElementById("lava");
  const status = document.getElementById("status");
 
  const btnStart = document.getElementById("btnStart");
  const btnRestart = document.getElementById("btnRestart");
 
  const keyScreen = document.getElementById("keyScreen");
 
  const overlay = document.getElementById("overlay");
  const overlayTitle = document.getElementById("overlayTitle");
  const overlayText = document.getElementById("overlayText");
  const overlayBtn = document.getElementById("overlayBtn");
 
  const canvas = document.getElementById("board");
  const ctx = canvas.getContext("2d");
 
  canvas.tabIndex = 0;
  canvas.style.outline = "none";
  canvas.addEventListener("pointerdown", () => canvas.focus());
 
  function fit() {
    const r = canvas.getBoundingClientRect();
    const d = window.devicePixelRatio || 1;
    canvas.width = Math.round(r.width * d);
    canvas.height = Math.round(r.height * d);
  }
  window.addEventListener("resize", fit);
  fit();
 
  // ---------- Jump key mechanic ----------
  const KEY_POOL = ["Q","E","R","T","F","G","H","J","K","L","Z","X","C","V","B","N"];
  let requiredKey = "Q";
 
  function rerollKey() {
    requiredKey = KEY_POOL[Math.floor(Math.random() * KEY_POOL.length)];
    keyScreen.textContent = requiredKey;
  }
 
  // ---------- World / physics ----------
  const gravity = 2400;          // px/s^2
  const jumpVel = 980;           // px/s upward
  const playerSize = 28;
 
  // Camera behavior:
  // player can move up to this screen Y before we scroll
  function cameraThresholdY() {
    return canvas.height * 0.38;
  }
 
  // Platforms
  const platformH = 14;
  const basePlatformW = 220;
  const platformGapY = 80;       // vertical spacing
  const maxPlatforms = 22;
 
  // Lava rises (world space)
  let lavaRiseSpeed = 14;        // px/s, accelerates
  const lavaAccel = 1.9;         // px/s^2
  const lavaThickness = 9999;    // just draw huge
 
  // ---------- State ----------
  let running = false;
  let gameOver = false;
 
  // Camera/world offset:
  // worldY + camY = screenY
  // camY decreases as you go up (we scroll up)
  let camY = 0;
 
  // Track max height reached (world space)
  let bestHeight = 0;
 
  // Player in world coordinates
  let p;
 
  // Lava top in world coordinates (y where lava starts)
  let lavaTopWorldY;
 
  // Platforms in world coordinates
  let platforms = [];
 
  function setOverlay(show, t, txt, btn, enabled, fn) {
    if (show) overlay.classList.remove("hidden");
    else overlay.classList.add("hidden");
    overlayTitle.textContent = t;
    overlayText.textContent = txt;
    overlayBtn.textContent = btn;
    overlayBtn.disabled = !enabled;
    overlayBtn.onclick = fn;
  }
 
  function rectsOverlap(ax, ay, aw, ah, bx, by, bw, bh) {
    return ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by;
  }
 
  function worldToScreenY(y) { return y + camY; }
  function screenToWorldY(y) { return y - camY; }
 
  // ---------- Setup / reset ----------
  function reset() {
    running = false;
    gameOver = false;
    bestHeight = 0;
 
    const w = canvas.width;
    const h = canvas.height;
 
    camY = 0;
 
    // Player starts mid-screen (world coords)
    p = {
      x: w / 2,
      y: h * 0.62,   // worldY same as screenY initially
      vy: 0,
      onGround: false
    };
 
    lavaRiseSpeed = 14;
    lavaTopWorldY = h - 18; // just below initial floor area
 
    platforms = [];
 
    // Initial "floor" platform beneath player (world coords)
    platforms.push({
      x: 0,
      y: h - 60,
      w: w,
      h: platformH
    });
 
    // Spawn a ladder of centered platforms above
    let y = h - 140;
    for (let i = 0; i < 10; i++) {
      platforms.push(makePlatformCentered(w, y));
      y -= platformGapY;
    }
 
    rerollKey();
    hud();
 
    status.textContent = "Ready";
    setOverlay(true, "Lava Jump", "Press Start.\nJump by pressing the key shown.\nWrong key rerolls.", "Start", true, start);
  }
 
  function makePlatformCentered(w, y) {
    // Centered near player line with small random wiggle (still no movement needed)
    const pw = basePlatformW + (Math.random() * 80 - 40);
    const x = (w - pw) / 2 + (Math.random() * 40 - 20);
    return { x, y, w: pw, h: platformH };
  }
 
  // Ensure there are always platforms above the camera
  function ensurePlatforms() {
    const w = canvas.width;
 
    // find highest (smallest y) platform
    let topY = Infinity;
    for (const pl of platforms) topY = Math.min(topY, pl.y);
 
    // We want platforms to exist well above the visible top
    const targetTopWorldY = screenToWorldY(0) - 220;
 
    while (topY > targetTopWorldY) {
      topY -= platformGapY;
      platforms.push(makePlatformCentered(w, topY));
    }
 
    // Remove platforms far below the camera / lava
    const bottomCullWorldY = screenToWorldY(canvas.height) + 300;
    platforms = platforms.filter(pl => pl.y < bottomCullWorldY && pl.y + pl.h < lavaTopWorldY + 600);
 
    // Keep cap
    if (platforms.length > maxPlatforms) {
      // Remove the lowest ones
      platforms.sort((a, b) => a.y - b.y);
      platforms = platforms.slice(0, maxPlatforms);
    }
  }
 
  function hud() {
    // score = height climbed (positive number)
    const climbed = Math.max(0, Math.floor(bestHeight));
    elScore.textContent = String(climbed);
 
    // lava percent = how close lava is to player/camera bottom
    const screenLavaY = worldToScreenY(lavaTopWorldY);
    const pct = Math.max(0, Math.min(100, Math.round((1 - (screenLavaY / canvas.height)) * 100)));
    elLava.textContent = `${pct}%`;
  }
 
  // ---------- Game control ----------
  function start() {
    canvas.focus();
    running = true;
    gameOver = false;
    status.textContent = "Running";
    setOverlay(false, "", "", "", true, () => {});
    last = performance.now();
  }
 
  function end(msg) {
    running = false;
    gameOver = true;
    status.textContent = "Game Over";
    setOverlay(true, "Game Over", `${msg}\nScore: ${elScore.textContent}\n\nPress Restart.`, "Restart", true, reset);
  }
 
  // ---------- Jump key handling ----------
  function handleKeyPress(k) {
    if (!running || gameOver) return;
 
    if (k.length !== 1) return;
 
    const pressed = k.toUpperCase();
    if (pressed === requiredKey) {
      // jump allowed only if on ground
      if (p.onGround) {
        p.vy = -jumpVel;
      }
      rerollKey();
    } else {
      // wrong key -> reroll
      rerollKey();
    }
  }
 
  document.addEventListener("keydown", (e) => {
    // prevent page scroll/space etc not needed; keys are random letters mostly
    handleKeyPress(e.key);
  }, { capture: true });
 
  // ---------- Physics / camera ----------
  function step(dt) {
    const h = canvas.height;
 
    // Lava rises in WORLD space (upwards = decreasing y)
    lavaRiseSpeed += lavaAccel * dt;
    lavaTopWorldY -= lavaRiseSpeed * dt;
 
    // Gravity + vertical move
    p.vy += gravity * dt;
    p.y += p.vy * dt;
 
    // Collision with platforms (only when falling)
    p.onGround = false;
    const px = p.x - playerSize / 2;
    const py = p.y - playerSize / 2;
 
    if (p.vy > 0) {
      for (const pl of platforms) {
        if (rectsOverlap(px, py, playerSize, playerSize, pl.x, pl.y, pl.w, pl.h)) {
          // snap to platform top
          p.y = pl.y - playerSize / 2;
          p.vy = 0;
          p.onGround = true;
        }
      }
    }
 
    // Camera follow: if player goes above threshold, move camera up
    const playerScreenY = worldToScreenY(p.y);
    const thresh = cameraThresholdY();
    if (playerScreenY < thresh) {
      const delta = thresh - playerScreenY; // how much to scroll
      camY += delta; // camY increases means world moves down visually; here delta is positive, so player is pushed back to threshold
      // But we want camera to move UP (show higher world): camY should increase (worldToScreenY = y + camY)
      // This keeps player at threshold and reveals higher space.
    }
 
    // Track best height climbed:
    // baseline is starting y; smaller world y = higher
    // We'll convert to a positive climbed value using start reference:
    // Use p.y minimal as best height
    if (p.y < bestHeightRef) bestHeightRef = p.y;
    bestHeight = Math.max(bestHeight, (startYRef - bestHeightRef));
 
    // Ensure platforms keep spawning above
    ensurePlatforms();
 
    // Lose if touch lava (lava is at lavaTopWorldY and below)
    if (py + playerSize >= lavaTopWorldY) {
      return end("You touched the lava!");
    }
 
    // Lose if player falls far below screen (missed everything)
    const playerScreenBottom = worldToScreenY(p.y + playerSize / 2);
    if (playerScreenBottom > h + 200) {
      return end("You fell too far.");
    }
 
    hud();
  }
 
  // height reference
  let startYRef = 0;
  let bestHeightRef = 0;
 
  function initHeightRefs() {
    startYRef = p.y;
    bestHeightRef = p.y;
    bestHeight = 0;
  }
 
  // ---------- Render ----------
  function render() {
    const w = canvas.width, h = canvas.height;
    ctx.clearRect(0, 0, w, h);
 
    // background
    ctx.fillStyle = "#05070f";
    ctx.fillRect(0, 0, w, h);
 
    // subtle stars
    ctx.save();
    ctx.globalAlpha = 0.14;
    ctx.fillStyle = "#b8c4ff";
    for (let i = 0; i < 50; i++) {
      const x = (i * 97) % w;
      const y = (i * 211) % h;
      ctx.fillRect(x, y, 2, 2);
    }
    ctx.restore();
 
    // platforms
    ctx.fillStyle = "rgba(78,252,122,.85)";
    for (const pl of platforms) {
      const sy = worldToScreenY(pl.y);
      if (sy > h + 50 || sy + pl.h < -50) continue;
      ctx.fillRect(pl.x, sy, pl.w, pl.h);
    }
 
    // player (fixed x, camera affects y)
    ctx.fillStyle = "rgba(45,226,230,.95)";
    const psx = p.x - playerSize / 2;
    const psy = worldToScreenY(p.y) - playerSize / 2;
    ctx.fillRect(psx, psy, playerSize, playerSize);
 
    // lava
    const lavaScreenY = worldToScreenY(lavaTopWorldY);
    const lavaTop = Math.max(-200, lavaScreenY);
    const grd = ctx.createLinearGradient(0, lavaTop, 0, h);
    grd.addColorStop(0, "rgba(255,77,109,.75)");
    grd.addColorStop(1, "rgba(255,140,77,.95)");
    ctx.fillStyle = grd;
    ctx.fillRect(0, lavaTop, w, h - lavaTop);
 
    ctx.save();
    ctx.globalAlpha = 0.35;
    ctx.fillStyle = "rgba(255,77,109,1)";
    ctx.fillRect(0, lavaTop - 6, w, 6);
    ctx.restore();
 
    // frame
    ctx.strokeStyle = "rgba(255,255,255,.14)";
    ctx.lineWidth = 2;
    ctx.strokeRect(10, 10, w - 20, h - 20);
  }
 
  // ---------- Loop ----------
  let last = performance.now();
  function loop(t) {
    requestAnimationFrame(loop);
    render();
    if (!running || gameOver) return;
 
    const dt = Math.min(0.02, (t - last) / 1000);
    last = t;
    step(dt);
  }
  requestAnimationFrame(loop);
 
  // Buttons
  btnStart.onclick = () => {
    if (!running && !gameOver) {
      // set refs once at first start
      initHeightRefs();
    }
    start();
  };
  overlayBtn.onclick = btnStart.onclick;
  btnRestart.onclick = () => { reset(); initHeightRefs(); };
 
  // Start state
  reset();
  initHeightRefs();
})();
