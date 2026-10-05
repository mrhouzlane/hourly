// A quiet neural-network constellation behind the app: drifting nodes, links that glow near the cursor.
(function () {
  const c = document.getElementById("net");
  if (!c || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const x = c.getContext("2d"); let W, H, N = [], mx = -999, my = -999, dpr = Math.min(2, devicePixelRatio || 1);
  const size = () => { W = c.width = innerWidth * dpr; H = c.height = innerHeight * dpr; c.style.width = innerWidth + "px"; c.style.height = innerHeight + "px"; };
  size(); addEventListener("resize", size);
  const n = Math.round(Math.min(70, innerWidth / 18));
  for (let i = 0; i < n; i++) N.push({ x: Math.random() * W, y: Math.random() * H, vx: (Math.random() - .5) * .25 * dpr, vy: (Math.random() - .5) * .25 * dpr, r: (1 + Math.random() * 1.6) * dpr });
  addEventListener("pointermove", (e) => { mx = e.clientX * dpr; my = e.clientY * dpr; });
  function frame() {
    if (document.hidden) return requestAnimationFrame(frame);
    x.clearRect(0, 0, W, H);
    for (const p of N) { p.x += p.vx; p.y += p.vy; if (p.x < 0 || p.x > W) p.vx *= -1; if (p.y < 0 || p.y > H) p.vy *= -1; }
    const L = 150 * dpr;
    for (let i = 0; i < N.length; i++) {
      for (let j = i + 1; j < N.length; j++) {
        const dx = N[i].x - N[j].x, dy = N[i].y - N[j].y, d = Math.hypot(dx, dy);
        if (d < L) {
          const near = Math.hypot((N[i].x + N[j].x) / 2 - mx, (N[i].y + N[j].y) / 2 - my) < 220 * dpr;
          x.strokeStyle = `rgba(${near ? "190,215,255" : "130,170,255"},${(1 - d / L) * (near ? .7 : .26)})`; x.lineWidth = dpr * (near ? 1.3 : .8);
          x.beginPath(); x.moveTo(N[i].x, N[i].y); x.lineTo(N[j].x, N[j].y); x.stroke();
        }
      }
      x.fillStyle = "rgba(200,220,255,.8)"; x.beginPath(); x.arc(N[i].x, N[i].y, N[i].r, 0, 6.283); x.fill();
    }
    requestAnimationFrame(frame);
  }
  frame();
})();
