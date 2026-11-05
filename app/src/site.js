// Home sections from the site-v3 draft: Founding GPU Owner seats, same H100 two prices, guess game, board, Debt teaser.
// Backend: /api/guesses, /api/board, /api/seats, /api/seats/count. No index numbers are shown here while the hold is on.
export function siteHtml() {
  return `<div class="site">

  <section class="panel" id="seats">
    <div class="sh"><span><span class="dots"><b></b><b></b><b></b></span>Devnet beta</span><span class="r">GPU owners</span></div>
    <div class="sb">
      <h2>If you own GPUs, do this.</h2>
      <p class="note">Request one of 50 Founding GPU Owner seats. The site stays open to everyone with test money; the seats are a perk, not a gate.</p>
      <div class="seats-grid">
        <div>
          <div class="seat-stat">
            <div class="kick" style="margin-bottom:10px">Seats claimed</div>
            <div class="sbig"><span id="seats-claimed"></span><small> / 50</small></div>
            <p class="fine" style="margin:12px 0 0">Counter starts at zero. Fills from real requests only.</p>
          </div>
          <ul class="perk" style="margin-top:14px">
            <li><b>Priority on mainnet</b> when it opens</li>
            <li><b>Direct line</b> to the Hourly team</li>
            <li><b>Name on the board</b> as a Founding GPU Owner</li>
          </ul>
        </div>
        <div>
          <form id="seat-form" novalidate>
            <div class="field">
              <label for="s-name">Name</label>
              <input id="s-name" name="name" type="text" maxlength="80" required placeholder="Your name">
            </div>
            <div class="field">
              <label for="s-co">Company</label>
              <input id="s-co" name="company" type="text" maxlength="80" required placeholder="Company or project">
            </div>
            <div class="field">
              <label for="s-gpus">GPUs owned</label>
              <select id="s-gpus" name="gpus" required style="width:100%;background:var(--panel-2);border:1px solid var(--line);padding:12px 14px;font:600 14px/1.2 var(--mono);color:#fff">
                <option value="">Select a range</option>
                <option>Under 64</option>
                <option>64 to 511</option>
                <option>512 to 4k</option>
                <option>4k plus</option>
              </select>
            </div>
            <div class="field">
              <label for="s-email">Email <span style="color:var(--mute);text-transform:none;letter-spacing:0">(optional)</span></label>
              <input id="s-email" name="email" type="email" maxlength="120" placeholder="you@company.com">
            </div>
            <div class="guess-acts">
              <button type="submit" class="pri">Request a seat</button>
              <a href="#access">Full access form</a>
            </div>
            <p class="err" id="s-err" role="alert"></p>
            <div class="okmsg" id="s-ok">Request received. We will be in touch.</div>
          </form>
        </div>
      </div>
    </div>
  </section>
  <section class="panel" id="hero">
    <div class="sh"><span><span class="dots"><b></b><b></b><b></b></span>Same H100, same hour</span><span class="r">Illustration</span></div>
    <div class="sb">
      <div class="price-row" aria-label="Same H100, same hour, two public list prices">
        <div class="price">$1.99<small>Same H100</small></div>
        <div class="vs">or</div>
        <div class="price alt">$12.29<small>Same hour</small></div>
      </div>
      <p class="fine" style="margin:0">Illustration · public listings. GPU rent has no price anyone agrees on.</p>
      <div class="cta-row">
        <a class="pill" href="#trade" id="cta-try">Try with test money</a>
        <a class="pill ghost" href="#guess">Guess today's range</a>
      </div>
    </div>
  </section>
  <section class="panel" id="guess">
    <div class="sh"><span><span class="dots"><b></b><b></b><b></b></span>Guess today's H100 range</span><span class="r">No email needed</span></div>
    <div class="sb">
      <h2>Guess today's H100 range.</h2>
      <p class="note">Enter a Low and a High. Closest to the next published Index range joins the Founding Tester board.</p>
      <div class="guess-grid">
        <div>
          <form id="guess-form" novalidate>
            <div class="field">
              <label for="g-low">Low ($ / hour)</label>
              <input id="g-low" name="low" type="number" inputmode="decimal" step="0.01" min="0.01" max="99" placeholder="e.g. 2.50" required>
            </div>
            <div class="field">
              <label for="g-high">High ($ / hour)</label>
              <input id="g-high" name="high" type="number" inputmode="decimal" step="0.01" min="0.01" max="99" placeholder="e.g. 4.00" required>
            </div>
            <div class="field">
              <label for="g-x">X handle <span style="color:var(--mute);text-transform:none;letter-spacing:0">(optional)</span></label>
              <input id="g-x" name="x" type="text" maxlength="32" placeholder="@you" autocomplete="off">
              <div class="hint">Used only for the board if you place. No email required.</div>
            </div>
            <div class="guess-acts">
              <button type="submit" class="pri" id="g-submit">Submit guess</button>
              <button type="button" id="g-share" disabled>Download card</button>
              <a id="g-xpost" href="#" target="_blank" rel="noopener" style="pointer-events:none;opacity:.4">Post on X</a>
            </div>
            <p class="err" id="g-err" role="alert"></p>
          </form>
          <div class="result" id="g-result">
            <h3>My guess for today's H100 range</h3>
            <div class="nums">
              <div><span>Low</span>$<b id="r-low"></b></div>
              <div><span>High</span>$<b id="r-high"></b></div>
            </div>
            <p class="fine" id="r-meta">Revealed at next print.</p>
          </div>
        </div>
        <div class="score-box">
          <h3>How scoring works</h3>
          <ol>
            <li>You submit a Low and a High for today's H100 print.</li>
            <li>At the next Index print we score how close your band sits to the published Low and High.</li>
            <li>Closest guessers join the Founding Tester board.</li>
            <li>Reveal shows here as <b style="color:#fff">Revealed at next print</b> until that print is public.</li>
          </ol>
          <p class="fine" style="margin-top:14px">Stored with the time you sent it. No email, no wallet.</p>
        </div>
      </div>
    </div>
  </section>
  <section class="panel" id="board">
    <div class="sh"><span><span class="dots"><b></b><b></b><b></b></span>Founding Tester board</span><span class="r">Public · real entries only</span></div>
    <div class="sb">
      <div class="board">
        <div class="board-empty" id="board-empty">
          <h3>Be the first</h3>
          <p>No scored guesses yet. Submit a range above and come back after the next print.</p>
        </div>
        <div class="board-rows" aria-hidden="true">
          <div class="brow"><span class="rank">1</span><div class="skel"></div><div class="skel short"></div></div>
          <div class="brow"><span class="rank">2</span><div class="skel"></div><div class="skel short"></div></div>
          <div class="brow"><span class="rank">3</span><div class="skel"></div><div class="skel short"></div></div>
          <div class="brow"><span class="rank">4</span><div class="skel"></div><div class="skel short"></div></div>
          <div class="brow"><span class="rank">5</span><div class="skel"></div><div class="skel short"></div></div>
          <div class="brow"><span class="rank">6</span><div class="skel"></div><div class="skel short"></div></div>
        </div>
      </div>
    </div>
  </section>
  <section class="panel" id="debt">
    <div class="sh"><span><span class="dots"><b></b><b></b><b></b></span>Hourly Debt</span><span class="r">Public tracker</span></div>
    <div class="sb">
      <div class="teaser">
        <div class="left">
          <h2>GPU debt, in the open.</h2>
          <p class="note" style="margin-bottom:0">Public GPU loans, the rent they need, and a floor that pays out when that rent drops. Floors are bought and pay out in USDC on Solana.</p>
          <div class="minis">
            <span>Deal cards</span>
            <span>Breakeven rent</span>
            <span>Floor simulator</span>
            <span>Maturity wall</span>
          </div>
        </div>
        <a class="pill" href="debt" data-debt>Open Debt page</a>
      </div>
    </div>
  </section>

  <div class="foot-extra">
    <div class="built">
      <span>Built on</span>
      <svg width="18" height="14" viewBox="0 0 100 80" aria-hidden="true"><defs><linearGradient id="sg" x1="0" y1="1" x2="1" y2="0"><stop offset="0" stop-color="#9945FF"/><stop offset="1" stop-color="#14F195"/></linearGradient></defs><g fill="url(#sg)"><path d="M18 0h82L82 18H0z"/><path d="M0 31h82l18 18H18z"/><path d="M18 62h82L82 80H0z"/></g></svg>
      <span style="color:#fff;font-weight:600">Solana</span>
      <span style="opacity:.5">·</span>
      <span>Test money</span>
    </div>
    <div class="socials">
      <a href="https://x.com/hourly_markets" target="_blank" rel="noopener">@hourly_markets</a>
      <a href="#docs">Docs</a>
    </div>
  </div>
  <canvas id="share-canvas" class="share-preview" width="1200" height="675"></canvas>
</div>`;
}

// ---------- ref tracking: ?ref= on landing, kept for this browser, sent with every guess and seat request ----------
const REF_KEY = "hourly_ref";
export function captureRef() {
  try {
    const r = new URLSearchParams(location.search).get("ref");
    if (r && /^[\w.-]{1,64}$/.test(r)) localStorage.setItem(REF_KEY, r);
  } catch (_) { /* storage blocked */ }
}
export function getRef() { try { return localStorage.getItem(REF_KEY) || ""; } catch (_) { return ""; } }

const money = (n) => (Math.round(n * 100) / 100).toFixed(2);
const $ = (s, r = document) => r.querySelector(s);

function drawGuessCard(low, high, handle) {
  const c = $("#share-canvas"), ctx = c.getContext("2d"), W = 1200, H = 675;
  const g = ctx.createLinearGradient(0, 0, 0, H); g.addColorStop(0, "#2452ff"); g.addColorStop(1, "#1a3698");
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = "rgba(255,255,255,0.08)"; ctx.lineWidth = 1;
  for (let x = 0; x < W; x += 40) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke(); }
  for (let y = 0; y < H; y += 40) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }
  ctx.fillStyle = "#12226a"; ctx.fillRect(60, 60, W - 120, H - 120);
  ctx.strokeStyle = "rgba(255,255,255,0.2)"; ctx.strokeRect(60.5, 60.5, W - 121, H - 121);
  ctx.fillStyle = "#fff";
  const mk = (x, y, s) => { const r = (a, b, w, h) => ctx.fillRect(x + s * a / 44, y + s * b / 44, s * w / 44, s * h / 44); r(0, 0, 8, 44); r(36, 0, 8, 44); r(12, 8, 20, 4); r(16, 12, 12, 4); r(20, 16, 4, 4); r(20, 24, 4, 4); r(16, 28, 12, 4); r(12, 32, 20, 4); };
  mk(90, 90, 36);
  ctx.font = "600 28px Geist, Inter, sans-serif"; ctx.fillText("ourly", 134, 116);
  ctx.font = '500 14px "Geist Mono", ui-monospace, monospace'; ctx.fillStyle = "rgba(255,255,255,0.7)"; ctx.fillText("TEST MONEY", 1040, 112);
  ctx.fillStyle = "#fff"; ctx.font = "700 42px Geist, Inter, sans-serif"; ctx.fillText("My guess for today's H100 range", 90, 200);
  ctx.font = '500 16px "Geist Mono", ui-monospace, monospace'; ctx.fillStyle = "rgba(255,255,255,0.55)"; ctx.fillText("LOW", 90, 280); ctx.fillText("HIGH", 420, 280);
  ctx.fillStyle = "#fff"; ctx.font = "700 96px Geist, Inter, sans-serif"; ctx.fillText("$" + money(low), 90, 380); ctx.fillText("$" + money(high), 420, 380);
  ctx.font = '500 18px "Geist Mono", ui-monospace, monospace'; ctx.fillStyle = "rgba(255,255,255,0.75)"; ctx.fillText("Revealed at next print", 90, 470);
  if (handle) ctx.fillText(handle, 90, 510);
  ctx.fillStyle = "#fff"; ctx.font = "600 18px Geist, Inter, sans-serif"; ctx.fillText("hourly.markets  ·  Floors and caps on GPU rent", 90, 580);
  return c;
}
function download(c, name) {
  c.toBlob((blob) => {
    if (!blob) return;
    const a = document.createElement("a"), url = URL.createObjectURL(blob);
    a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }, "image/png");
}
function xIntent(low, high) {
  const text = `my guess for today's h100 range: $${money(low)} to $${money(high)}.\nfloors and caps on gpu rent, onchain on @solana. @hourly_markets`;
  return `https://x.com/intent/post?text=${encodeURIComponent(text)}&url=${encodeURIComponent("https://hourly.markets/?ref=guess")}`;
}

function boardHtml(b) {
  if (!b || !b.revealed || !b.rows || !b.rows.length) return null;
  return b.rows.map((r) => `<div class="brow"><span class="rank">${r.rank}</span><span style="color:#fff">${r.x ? r.x.replace(/[<>&"]/g, "") : "Anonymous"}</span><span>$${money(r.low)} to $${money(r.high)}</span></div>`).join("");
}

// api: the v3 api() helper; go: the v3 router.
export function bindSite({ api, go }) {
  const root = $(".site"); if (!root) return;
  // in-app links: debt route and hash views
  root.querySelectorAll("a[data-debt]").forEach((a) => a.addEventListener("click", (e) => { e.preventDefault(); go("debt"); }));
  // try CTA carries the ref
  const ref = getRef();

  // guess
  const form = $("#guess-form"), err = $("#g-err"), shareBtn = $("#g-share"), xpost = $("#g-xpost");
  let last = null;
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    err.classList.remove("open"); err.textContent = "";
    const low = parseFloat($("#g-low").value), high = parseFloat($("#g-high").value);
    let x = ($("#g-x").value || "").trim(); if (x) x = "@" + x.replace(/^@+/, "");
    if (!(low > 0) || !(high > low) || high >= 100) { err.textContent = "Enter a Low and a High, with High above Low, under $100."; err.classList.add("open"); return; }
    if (x && !/^@[A-Za-z0-9_]{1,15}$/.test(x)) { err.textContent = "X handles are letters, numbers and _ only, up to 15."; err.classList.add("open"); return; }
    const btn = $("#g-submit"); btn.disabled = true;
    try {
      const r = await api("guesses", { low, high, x, ref, chip: "H100" });
      last = { low, high, x };
      $("#r-low").textContent = money(low); $("#r-high").textContent = money(high);
      $("#r-meta").textContent = `${x ? x + " · " : ""}Guess for ${r.day}. Revealed at next print.`;
      $("#g-result").classList.add("open");
      shareBtn.disabled = false;
      xpost.href = xIntent(low, high); xpost.style.pointerEvents = "auto"; xpost.style.opacity = "1";
      drawGuessCard(low, high, x);
    } catch (e2) { err.textContent = e2.message; err.classList.add("open"); }
    btn.disabled = false;
  });
  shareBtn.addEventListener("click", () => { if (last) download(drawGuessCard(last.low, last.high, last.x), "hourly-h100-guess.png"); });

  // board: real scored rows only, after the print is public
  api("board").then((b) => {
    const html = boardHtml(b);
    if (html) { $("#board-empty").style.display = "none"; const rows = root.querySelector(".board-rows"); rows.innerHTML = html; rows.removeAttribute("aria-hidden"); }
  }).catch(() => {});

  // seats: live count, never hard coded
  const count = () => api("seats/count").then((c) => { $("#seats-claimed").textContent = String(c.claimed); }).catch(() => {});
  count();
  const sf = $("#seat-form"), serr = $("#s-err"), ok = $("#s-ok");
  sf.addEventListener("submit", async (e) => {
    e.preventDefault();
    serr.classList.remove("open"); serr.textContent = ""; ok.classList.remove("open");
    const body = { name: $("#s-name").value.trim(), company: $("#s-co").value.trim(), gpus: $("#s-gpus").value, email: $("#s-email").value.trim(), ref };
    if (!body.name || !body.company || !body.gpus) { serr.textContent = "Name, company and GPUs owned are required."; serr.classList.add("open"); return; }
    try { await api("seats", body); ok.classList.add("open"); sf.reset(); count(); }
    catch (e2) { serr.textContent = e2.message; serr.classList.add("open"); }
  });
}
