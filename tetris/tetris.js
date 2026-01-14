(() => {
  const elScore = document.getElementById("score");
  const elLines = document.getElementById("lines");
  const elLevel = document.getElementById("level");
  const status = document.getElementById("status");

  const btnStart = document.getElementById("btnStart");
  const btnPause = document.getElementById("btnPause");
  const btnRestart = document.getElementById("btnRestart");

  const overlay = document.getElementById("overlay");
  const overlayTitle = document.getElementById("overlayTitle");
  const overlayText = document.getElementById("overlayText");
  const overlayBtn = document.getElementById("overlayBtn");

  const canvas = document.getElementById("board");
  const ctx = canvas.getContext("2d");

  canvas.tabIndex = 0;
  canvas.style.outline = "none";
  canvas.addEventListener("pointerdown", () => canvas.focus());

  const COLS=10, ROWS=20, CELL=36;
  const COLORS = {
    I:"rgba(45,226,230,.95)",
    O:"rgba(255,210,77,.95)",
    T:"rgba(124,92,255,.95)",
    S:"rgba(78,252,122,.92)",
    Z:"rgba(255,77,109,.92)",
    J:"rgba(102,153,255,.92)",
    L:"rgba(255,140,77,.92)",
  };

  const SHAPES = {
    I:[[0,0,0,0],[1,1,1,1],[0,0,0,0],[0,0,0,0]],
    O:[[0,1,1,0],[0,1,1,0],[0,0,0,0],[0,0,0,0]],
    T:[[0,1,0,0],[1,1,1,0],[0,0,0,0],[0,0,0,0]],
    S:[[0,1,1,0],[1,1,0,0],[0,0,0,0],[0,0,0,0]],
    Z:[[1,1,0,0],[0,1,1,0],[0,0,0,0],[0,0,0,0]],
    J:[[1,0,0,0],[1,1,1,0],[0,0,0,0],[0,0,0,0]],
    L:[[0,0,1,0],[1,1,1,0],[0,0,0,0],[0,0,0,0]],
  };
  const TYPES = Object.keys(SHAPES);

  let grid, cur, next;
  let running=false, paused=false, gameOver=false;
  let score=0, lines=0, level=1;

  function setOverlay(show,t,txt,btn,enabled,fn){
    if(show) overlay.classList.remove("hidden"); else overlay.classList.add("hidden");
    overlayTitle.textContent=t; overlayText.textContent=txt;
    overlayBtn.textContent=btn; overlayBtn.disabled=!enabled; overlayBtn.onclick=fn;
  }

  function newGrid(){ return Array.from({length:ROWS},()=>Array(COLS).fill(null)); }
  function clone(m){ return m.map(r=>r.slice()); }

  function rotateCW(m){
    const n=m.length;
    const r=Array.from({length:n},()=>Array(n).fill(0));
    for(let y=0;y<n;y++) for(let x=0;x<n;x++) r[x][n-1-y]=m[y][x];
    return r;
  }

  function randType(){ return TYPES[Math.floor(Math.random()*TYPES.length)]; }

  function spawn(type){
    return { type, mat: clone(SHAPES[type]), x:3, y:-1 };
  }

  function collides(p,dx=0,dy=0,mat=p.mat){
    for(let y=0;y<4;y++){
      for(let x=0;x<4;x++){
        if(!mat[y][x]) continue;
        const gx=p.x+x+dx, gy=p.y+y+dy;
        if(gx<0||gx>=COLS||gy>=ROWS) return true;
        if(gy>=0 && grid[gy][gx]) return true;
      }
    }
    return false;
  }

  function lock(){
    for(let y=0;y<4;y++){
      for(let x=0;x<4;x++){
        if(!cur.mat[y][x]) continue;
        const gx=cur.x+x, gy=cur.y+y;
        if(gy<0){ gameOver=true; return; }
        grid[gy][gx]=cur.type;
      }
    }
    clearLines();
    cur=next;
    next=spawn(randType());
    if(collides(cur)) gameOver=true;
  }

  function clearLines(){
    let cleared=0;
    for(let y=ROWS-1;y>=0;y--){
      if(grid[y].every(c=>c)){
        grid.splice(y,1);
        grid.unshift(Array(COLS).fill(null));
        cleared++; y++;
      }
    }
    if(cleared){
      lines += cleared;
      const pts=[0,100,300,500,800][cleared]||0;
      score += pts*level;
      level = 1 + Math.floor(lines/10);
    }
  }

  function hud(){
    elScore.textContent=score;
    elLines.textContent=lines;
    elLevel.textContent=level;
  }

  function dropSpeedMs(){
    // classic-ish: faster each level; min 80ms
    return Math.max(80, 650 - (level-1)*55);
  }

  function hardDrop(){
    let d=0;
    while(!collides(cur,0,d+1)) d++;
    cur.y += d;
    score += d*2;
    lock();
  }

  function render(){
    ctx.clearRect(0,0,canvas.width,canvas.height);
    ctx.fillStyle="#05070f"; ctx.fillRect(0,0,canvas.width,canvas.height);

    // grid
    for(let y=0;y<ROWS;y++){
      for(let x=0;x<COLS;x++){
        const t=grid[y][x];
        if(!t) continue;
        drawCell(x,y,COLORS[t],1);
      }
    }

    // ghost
    if(cur && !gameOver){
      let d=0;
      while(!collides(cur,0,d+1)) d++;
      drawPiece(cur, 0, d, "rgba(255,255,255,.12)");
    }

    // current
    if(cur) drawPiece(cur,0,0,COLORS[cur.type]);

    // frame + grid lines (subtle)
    ctx.save();
    ctx.globalAlpha=0.12;
    ctx.strokeStyle="#b8c4ff";
    for(let x=0;x<=COLS;x++){
      ctx.beginPath(); ctx.moveTo(x*CELL+0.5,0); ctx.lineTo(x*CELL+0.5,ROWS*CELL); ctx.stroke();
    }
    for(let y=0;y<=ROWS;y++){
      ctx.beginPath(); ctx.moveTo(0,y*CELL+0.5); ctx.lineTo(COLS*CELL,y*CELL+0.5); ctx.stroke();
    }
    ctx.restore();

    ctx.strokeStyle="rgba(255,255,255,.16)";
    ctx.lineWidth=2;
    ctx.strokeRect(1,1,COLS*CELL-2,ROWS*CELL-2);
  }

  function drawCell(x,y,color,alpha){
    ctx.save();
    ctx.globalAlpha=alpha;
    ctx.fillStyle=color;
    const px=x*CELL, py=y*CELL;
    ctx.fillRect(px+3,py+3,CELL-6,CELL-6);
    ctx.restore();
  }

  function drawPiece(p,dx,dy,color){
    for(let y=0;y<4;y++){
      for(let x=0;x<4;x++){
        if(!p.mat[y][x]) continue;
        const gx=p.x+x+dx, gy=p.y+y+dy;
        if(gy<0) continue;
        drawCell(gx,gy,color,1);
      }
    }
  }

  function start(){
    canvas.focus();
    if(gameOver) restart();
    running=true; paused=false;
    btnStart.disabled=true;
    btnPause.disabled=false; btnPause.textContent="Pause";
    status.textContent="Running";
    setOverlay(false,"","","",true,()=>{});
    last=performance.now();
    acc=0;
  }

  function togglePause(){
    if(!running) return;
    paused=!paused;
    btnPause.textContent=paused?"Resume":"Pause";
    status.textContent=paused?"Paused":"Running";
    if(paused) setOverlay(true,"Paused","Press P or Resume.","Resume",true,togglePause);
    else { setOverlay(false,"","","",true,()=>{}); last=performance.now(); }
  }

  function restart(){
    grid=newGrid();
    cur=spawn(randType());
    next=spawn(randType());
    running=false; paused=false; gameOver=false;
    score=0; lines=0; level=1;
    hud();
    status.textContent="Ready";
    btnStart.disabled=false;
    btnPause.disabled=true; btnPause.textContent="Pause";
    setOverlay(true,"Crispy Tetris","Press Start.","Start",true,start);
    render();
  }

  function move(dx){
    if(collides(cur,dx,0)) return;
    cur.x += dx;
  }

  function softDrop(){
    if(!collides(cur,0,1)){ cur.y++; score += 1; return; }
    lock();
  }

  function rotate(){
    const r=rotateCW(cur.mat);
    // basic wall kicks
    const kicks=[0,-1,1,-2,2];
    for(const k of kicks){
      if(!collides(cur,k,0,r)){
        cur.mat=r; cur.x+=k; return;
      }
    }
  }

  // input
  document.addEventListener("keydown",(e)=>{
    const k=e.key.toLowerCase();
    const isGame=["arrowleft","arrowright","arrowup","arrowdown"," ","p"].includes(k) || e.code==="Space";
    if(isGame) e.preventDefault();

    if(k==="p"){ if(running) togglePause(); return; }
    if(!running || paused || gameOver) return;

    if(k==="arrowleft") move(-1);
    if(k==="arrowright") move(1);
    if(k==="arrowup") rotate();
    if(k==="arrowdown") softDrop();
    if(k===" "||e.code==="Space") hardDrop();
  },{capture:true});

  // loop
  let last=performance.now();
  let acc=0;
  function loop(t){
    requestAnimationFrame(loop);
    render();
    if(!running || paused || gameOver) return;

    const dt=Math.min(0.05,(t-last)/1000);
    last=t;
    acc += dt*1000;

    const stepMs = dropSpeedMs();
    if(acc >= stepMs){
      acc = 0;
      if(!collides(cur,0,1)) cur.y++;
      else lock();

      hud();

      if(gameOver){
        running=false;
        btnStart.disabled=false;
        btnPause.disabled=true;
        status.textContent="Game Over";
        setOverlay(true,"Game Over",`Score: ${score}\nLines: ${lines}\n\nPress Restart.`,
          "Restart",true,restart);
      }
    }
  }
  requestAnimationFrame(loop);

  btnStart.onclick=start;
  overlayBtn.onclick=start;
  btnPause.onclick=togglePause;
  btnRestart.onclick=restart;

  restart();
})();
