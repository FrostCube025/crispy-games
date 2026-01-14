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

  function fit(){
    const r = canvas.getBoundingClientRect();
    const d = window.devicePixelRatio || 1;
    canvas.width = Math.round(r.width * d);
    canvas.height = Math.round(r.height * d);
  }
  window.addEventListener("resize", fit);
  fit();

  // Controls
  const keys = { left:false, right:false };

  // Jump key mechanic: wrong key rerolls
  const KEY_POOL = ["Q","E","R","T","F","G","H","J","K","L","Z","X","C","V","B","N"];
  let requiredKey = "Q";

  function rerollKey(){
    requiredKey = KEY_POOL[Math.floor(Math.random()*KEY_POOL.length)];
    keyScreen.textContent = requiredKey;
  }

  // World constants
  const gravity = 2200;         // px/s^2
  const moveSpeed = 520;        // px/s
  const jumpVel = 920;          // px/s (upwards)
  const playerSize = 28;

  let running=false, gameOver=false;
  let score=0;

  // Lava rises from bottom
  let lavaY;                    // y coordinate of lava top in pixels
  let lavaRiseSpeed = 14;       // px/s (increases over time)

  // Player
  let p;

  // Platforms
  let platforms = [];

  function setOverlay(show,t,txt,btn,enabled,fn){
    if(show) overlay.classList.remove("hidden"); else overlay.classList.add("hidden");
    overlayTitle.textContent=t; overlayText.textContent=txt;
    overlayBtn.textContent=btn; overlayBtn.disabled=!enabled; overlayBtn.onclick=fn;
  }

  function reset(){
    running=false; gameOver=false;
    score=0;
    lavaRiseSpeed = 14;

    const w=canvas.width, h=canvas.height;
    lavaY = h - 20; // start near bottom

    p = {
      x: w/2,
      y: h/2,
      vx: 0,
      vy: 0,
      onGround: false
    };

    platforms = [];
    // create initial platforms
    const startY = h - 120;
    for(let i=0;i<9;i++){
      platforms.push(makePlatform(w, startY - i*70));
    }
    // add a "floor" platform early (above lava)
    platforms.push({ x: 0, y: h-60, w: w, h: 14 });

    rerollKey();
    hud();
    render();

    status.textContent="Ready";
    setOverlay(true,"Lava Jump","Press Start.\nJump only by pressing the key shown.", "Start", true, start);
  }

  function makePlatform(w, y){
    const pw = 140 + Math.random()*120;
    const x = 30 + Math.random()*(w - pw - 60);
    return { x, y, w: pw, h: 14 };
  }

  function hud(){
    elScore.textContent = String(score);
    const pct = Math.max(0, Math.min(100, Math.round((1 - lavaY / canvas.height) * 100)));
    elLava.textContent = `${pct}%`;
  }

  function start(){
    canvas.focus();
    running = true;
    status.textContent="Running";
    setOverlay(false,"","","",true,()=>{});
    last = performance.now();
  }

  function end(why){
    running=false; gameOver=true;
    status.textContent="Game Over";
    setOverlay(true,"Game Over", `${why}\nScore: ${score}\n\nPress Restart.`, "Restart", true, reset);
  }

  // Collision helpers
  function rectsOverlap(ax,ay,aw,ah, bx,by,bw,bh){
    return ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by;
  }

  function step(dt){
    const w=canvas.width, h=canvas.height;

    // Lava rises faster over time
    lavaRiseSpeed += dt * 1.8;
    lavaY -= lavaRiseSpeed * dt;

    // Score rises with time survived + altitude
    score += dt * 10;
    score = Math.floor(score);

    // Move player
    p.vx = 0;
    if(keys.left) p.vx -= moveSpeed;
    if(keys.right) p.vx += moveSpeed;

    p.x += p.vx * dt;
    p.vy += gravity * dt;
    p.y += p.vy * dt;

    // World wrap (optional): keep within bounds
    p.x = Math.max(playerSize/2, Math.min(w - playerSize/2, p.x));

    // Platforms drift down slowly relative to player “progress”
    // If player gets high, spawn more above
    // Remove platforms below lava/viewport
    for(const plat of platforms){
      // No movement needed; we keep a static world and just spawn above when needed
    }

    // Collision with platforms (only when falling)
    p.onGround = false;
    const px = p.x - playerSize/2;
    const py = p.y - playerSize/2;

    if(p.vy > 0){
      for(const plat of platforms){
        if(rectsOverlap(px, py, playerSize, playerSize, plat.x, plat.y, plat.w, plat.h)){
          // Snap to top of platform
          p.y = plat.y - playerSize/2;
          p.vy = 0;
          p.onGround = true;
        }
      }
    }

    // If player falls off bottom or hits lava
    if(py + playerSize >= lavaY){
      return end("You touched the lava!");
    }
    if(p.y > h + 200){
      return end("You fell too far.");
    }

    // Spawn new platforms above if topmost is too low
    const topMost = platforms.reduce((m,pl)=>Math.min(m,pl.y), Infinity);
    while(topMost > 80){
      // (rare early); skip
      break;
    }
    let currentTop = platforms.reduce((m,pl)=>Math.min(m,pl.y), Infinity);
    while(currentTop > 60){
      // ensure we have platforms up near the top
      platforms.push(makePlatform(w, currentTop - 70));
      currentTop -= 70;
    }

    // Remove platforms far below lava or far below view
    platforms = platforms.filter(pl => pl.y < h + 200 && pl.y + pl.h < lavaY + 300);

    hud();
  }

  function render(){
    const w=canvas.width, h=canvas.height;
    ctx.clearRect(0,0,w,h);

    // background
    ctx.fillStyle="#05070f";
    ctx.fillRect(0,0,w,h);

    // subtle stars
    ctx.save();
    ctx.globalAlpha=0.15;
    ctx.fillStyle="#b8c4ff";
    for(let i=0;i<40;i++){
      const x=(i*97)%w, y=(i*211)%h;
      ctx.fillRect(x,y,2,2);
    }
    ctx.restore();

    // platforms
    ctx.fillStyle="rgba(78,252,122,.85)";
    for(const pl of platforms){
      ctx.fillRect(pl.x, pl.y, pl.w, pl.h);
    }

    // player
    ctx.fillStyle="rgba(45,226,230,.95)";
    ctx.fillRect(p.x - playerSize/2, p.y - playerSize/2, playerSize, playerSize);

    // lava
    const lavaTop = Math.max(-200, lavaY);
    const grd = ctx.createLinearGradient(0, lavaTop, 0, h);
    grd.addColorStop(0, "rgba(255,77,109,.75)");
    grd.addColorStop(1, "rgba(255,140,77,.95)");
    ctx.fillStyle = grd;
    ctx.fillRect(0, lavaTop, w, h - lavaTop);

    // lava surface glow
    ctx.save();
    ctx.globalAlpha=0.35;
    ctx.fillStyle="rgba(255,77,109,1)";
    ctx.fillRect(0, lavaTop-6, w, 6);
    ctx.restore();

    // frame
    ctx.strokeStyle="rgba(255,255,255,.14)";
    ctx.lineWidth=2;
    ctx.strokeRect(10,10,w-20,h-20);
  }

  // Input:
  // - Left/Right arrows move
  // - Jump only by requiredKey
  document.addEventListener("keydown",(e)=>{
    const k = e.key;

    const lower = k.length===1 ? k.toUpperCase() : k.toLowerCase();

    // movement
    if(k === "ArrowLeft"){ e.preventDefault(); keys.left=true; return; }
    if(k === "ArrowRight"){ e.preventDefault(); keys.right=true; return; }

    // jump key logic
    // Only check single-character keys
    if(k.length === 1){
      const pressed = k.toUpperCase();
      if(pressed === requiredKey){
        // jump
        if(p.onGround){
          p.vy = -jumpVel;
        } else {
          // allow a small “air” jump only if close to a platform? keep it strict:
          // do nothing
        }
        rerollKey();
      } else {
        // wrong key -> reroll instantly
        rerollKey();
      }
    }
  }, {capture:true});

  document.addEventListener("keyup",(e)=>{
    if(e.key==="ArrowLeft") keys.left=false;
    if(e.key==="ArrowRight") keys.right=false;
  }, {capture:true});

  // loop
  let last = performance.now();
  function loop(t){
    requestAnimationFrame(loop);
    render();
    if(!running || gameOver) return;

    const dt = Math.min(0.02, (t-last)/1000);
    last = t;
    step(dt);
  }
  requestAnimationFrame(loop);

  btnStart.onclick = start;
  overlayBtn.onclick = start;
  btnRestart.onclick = reset;

  reset();
})();
