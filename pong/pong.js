(() => {
  const scoreL = document.getElementById("scoreL");
  const scoreR = document.getElementById("scoreR");
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

  function fit(){ const r=canvas.getBoundingClientRect(); const d=window.devicePixelRatio||1;
    canvas.width=Math.round(r.width*d); canvas.height=Math.round(r.height*d);
  }
  window.addEventListener("resize", fit); fit();

  const WIN = 7;
  let running=false, paused=false;
  let lScore=0, rScore=0;

  const paddleH=110, paddleW=14, ballR=8;
  let L,R,ball;
  const keys={up:false,down:false};

  function setOverlay(show,t,txt,btn,enabled,fn){
    if(show) overlay.classList.remove("hidden"); else overlay.classList.add("hidden");
    overlayTitle.textContent=t; overlayText.textContent=txt; overlayBtn.textContent=btn;
    overlayBtn.disabled=!enabled; overlayBtn.onclick=fn;
  }
  function updateScore(){ scoreL.textContent=lScore; scoreR.textContent=rScore; }

  function resetRound(dir=1){
    const w=canvas.width,h=canvas.height;
    L={x:30,y:(h-paddleH)/2}; R={x:w-30-paddleW,y:(h-paddleH)/2};
    const speed=520, angle=(Math.random()*0.6-0.3);
    ball={x:w/2,y:h/2,vx:dir*speed,vy:speed*angle};
  }

  function clamp(v,a,b){return Math.max(a,Math.min(b,v));}

  function playerMove(dt){
    const speed=620;
    if(keys.up) L.y-=speed*dt;
    if(keys.down) L.y+=speed*dt;
    L.y=clamp(L.y,10,canvas.height-paddleH-10);
  }

  function aiMove(dt){
    const target=ball.y-paddleH/2;
    const diff=target-R.y;
    const maxSpeed=560;
    const vy=clamp(diff*6,-maxSpeed,maxSpeed);
    R.y+=vy*dt;
    R.y=clamp(R.y,10,canvas.height-paddleH-10);
  }

  function collide(p){
    if(ball.x+ballR<p.x || ball.x-ballR>p.x+paddleW) return false;
    if(ball.y+ballR<p.y || ball.y-ballR>p.y+paddleH) return false;

    const hit=(ball.y-(p.y+paddleH/2))/(paddleH/2);
    const angle=hit*0.9;
    const speed=Math.hypot(ball.vx,ball.vy)*1.03;
    const dir=(p===L)?1:-1;
    ball.vx=dir*speed*Math.cos(angle);
    ball.vy=speed*Math.sin(angle);
    ball.x=(p===L)?(p.x+paddleW+ballR+0.5):(p.x-ballR-0.5);
    return true;
  }

  function gameOver(youWin){
    running=false; paused=false;
    btnStart.disabled=false; btnPause.disabled=true;
    status.textContent="Game Over";
    setOverlay(true, youWin?"You Win!":"You Lose!", `Final score: ${lScore} - ${rScore}\n\nPress Restart.`,
      "Restart", true, restart);
  }

  function step(dt){
    playerMove(dt); aiMove(dt);
    ball.x+=ball.vx*dt; ball.y+=ball.vy*dt;

    if(ball.y-ballR<10){ ball.y=10+ballR; ball.vy*=-1; }
    if(ball.y+ballR>canvas.height-10){ ball.y=canvas.height-10-ballR; ball.vy*=-1; }

    collide(L); collide(R);

    if(ball.x<-50){
      rScore++; updateScore();
      if(rScore>=WIN) return gameOver(false);
      resetRound(-1);
    }
    if(ball.x>canvas.width+50){
      lScore++; updateScore();
      if(lScore>=WIN) return gameOver(true);
      resetRound(1);
    }
  }

  function render(){
    ctx.clearRect(0,0,canvas.width,canvas.height);
    ctx.fillStyle="#05070f"; ctx.fillRect(0,0,canvas.width,canvas.height);

    ctx.strokeStyle="rgba(255,255,255,.14)"; ctx.lineWidth=2;
    ctx.strokeRect(10,10,canvas.width-20,canvas.height-20);

    ctx.save();
    ctx.globalAlpha=0.25; ctx.fillStyle="#b8c4ff";
    for(let y=20;y<canvas.height-20;y+=32){ ctx.fillRect(canvas.width/2-2,y,4,18); }
    ctx.restore();

    ctx.fillStyle="rgba(78,252,122,.95)";
    ctx.fillRect(L.x,L.y,paddleW,paddleH);
    ctx.fillRect(R.x,R.y,paddleW,paddleH);

    ctx.fillStyle="rgba(45,226,230,.95)";
    ctx.beginPath(); ctx.arc(ball.x,ball.y,ballR,0,Math.PI*2); ctx.fill();
  }

  let last=performance.now();
  function loop(t){
    requestAnimationFrame(loop);
    render();
    if(!running||paused) return;
    const dt=Math.min(0.02,(t-last)/1000); last=t;
    step(dt);
  }
  requestAnimationFrame(loop);

  function start(){
    canvas.focus();
    if(!ball) resetRound(1);
    running=true; paused=false;
    btnStart.disabled=true;
    btnPause.disabled=false; btnPause.textContent="Pause";
    status.textContent="Running";
    setOverlay(false,"","","",true,()=>{});
    last=performance.now();
  }

  function togglePause(){
    if(!running) return;
    paused=!paused;
    btnPause.textContent=paused?"Resume":"Pause";
    status.textContent=paused?"Paused":"Running";
    if(paused) setOverlay(true,"Paused","Press Space or Resume.","Resume",true,togglePause);
    else { setOverlay(false,"","","",true,()=>{}); last=performance.now(); }
  }

  function restart(){
    lScore=0; rScore=0; updateScore();
    resetRound(1);
    running=false; paused=false;
    btnStart.disabled=false;
    btnPause.disabled=true; btnPause.textContent="Pause";
    status.textContent="Ready";
    setOverlay(true,"Crispy Pong","Press Start.","Start",true,start);
  }

  document.addEventListener("keydown",(e)=>{
    const k=e.key.toLowerCase();
    const gameKey=["arrowup","arrowdown","w","s"," "].includes(k) || e.code==="Space";
    if(gameKey) e.preventDefault();

    if(k==="arrowup"||k==="w") keys.up=true;
    if(k==="arrowdown"||k==="s") keys.down=true;
    if(k===" "||e.code==="Space") if(running) togglePause();
  },{capture:true});

  document.addEventListener("keyup",(e)=>{
    const k=e.key.toLowerCase();
    if(k==="arrowup"||k==="w") keys.up=false;
    if(k==="arrowdown"||k==="s") keys.down=false;
  },{capture:true});

  btnStart.onclick=start;
  overlayBtn.onclick=start;
  btnPause.onclick=togglePause;
  btnRestart.onclick=restart;

  restart();
})();
