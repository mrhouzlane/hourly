// Home, hero v2 (reference: ~/hourly-site-v3/ref-hero2/h1d, h2d, h3d): one centred column, one action.
// Closed: kicker, headline, subline, Request a seat, See how it works, seat line, three chips.
// Open: the seat line stays and a compact form replaces the button, link and chips. Done: the form collapses,
// "recording seat" types, a Founding GPU Owner ticket slides in with the seat number from the server, the bar fills,
// then Share my seat (X intent) and Explore the Debt page.
// Below: the Hourly Founding Board, shown only once it has entries. See how it works opens Docs.
// Backend: /api/seats, /api/seats/count, /api/founders. No index numbers are shown here while the hold is on.
export const SEATS_TOTAL = 50;

export function siteHtml() {
  return `<div class="site">
  <section class="hero2" id="seats">
    <div class="kick">Devnet beta · USDC on Solana</div>
    <h1>A floor on your GPU rent.</h1>
    <p class="sub2">Paid out in USDC on Solana. Devnet beta, test money.</p>
    <div class="cta2" id="cta2">
      <button type="button" class="pill2" id="open-seat">Request a seat</button>
      <a class="how-link" href="#docs" id="how-link">See how it works</a>
    </div>
    <div class="seatline"><span id="seats-claimed">0</span> of ${SEATS_TOTAL} seats claimed</div>
    <ul class="chips2" id="chips2"><li>Early access</li><li>Floor quote on your fleet</li><li>Founding fees</li></ul>
    <div class="seatform" id="seat-panel" hidden>
      <form id="seat-form" novalidate>
        <div class="ttl">Request a seat</div>
        <label class="f"><span>Name</span><input id="s-name" name="name" type="text" maxlength="80" required placeholder="Your name" autocomplete="name"></label>
        <label class="f"><span>Email</span><input id="s-email" name="email" type="email" maxlength="120" required placeholder="you@company.com" autocomplete="email"></label>
        <label class="f"><span>GPUs you run</span><select id="s-gpus" name="gpus" required><option value="" selected>Choose</option><option>Under 64</option><option>64 to 511</option><option>512 to 4k</option><option>4k plus</option></select></label>
        <label class="f"><span>Company <i>optional</i></span><input id="s-co" name="company" type="text" maxlength="80" placeholder="Company or project" autocomplete="organization"></label>
        <label class="opt"><input id="s-show" type="checkbox"> Show my name on the Founding board</label>
        <button type="submit" class="pill2 full" id="s-go">Submit</button>
        <p class="err" id="s-err" role="alert"></p>
      </form>
    </div>
    <div class="done" id="s-ok" role="status" hidden>
      <div class="recline" id="rec-line">recording seat<span class="cur"></span></div>
      <div class="sok-ticket" id="sok-ticket">
        <div class="tk-top"><span class="tk-mark"><svg viewBox="0 0 44 44" shape-rendering="crispEdges" aria-hidden="true"><g fill="currentColor"><rect x="0" y="0" width="8" height="44"/><rect x="36" y="0" width="8" height="44"/><rect x="12" y="8" width="20" height="4"/><rect x="16" y="12" width="12" height="4"/><rect x="20" y="16" width="4" height="4"/><rect x="20" y="24" width="4" height="4"/><rect x="16" y="28" width="12" height="4"/><rect x="12" y="32" width="20" height="4"/></g></svg></span><span class="tk-tag">Founding</span></div>
        <div class="tk-role">Founding GPU Owner</div>
        <div class="tk-seat"><span>Seat</span><b id="s-num">#00</b><span>of ${SEATS_TOTAL}</span></div>
        <div class="tk-meta"><span id="sok-who"></span><span><span id="sok-date"></span> · Recorded</span></div>
        <div class="tk-foot"><span>Devnet beta</span><span>USDC on Solana</span></div>
        <i class="shine" aria-hidden="true"></i>
      </div>
      <div class="sok-progress"><div class="bar"><i id="sok-bar"></i></div><div class="cl"><b id="sok-claimed">0</b> of ${SEATS_TOTAL} seats claimed</div></div>
      <p class="sub3">We'll reach out within a week.</p>
      <div class="sok-actions"><a class="pill2" id="sok-share" href="#" target="_blank" rel="noopener">Share my seat</a><a class="ghost2" href="debt" id="sok-debt">Explore the Debt page</a></div>
    </div>
  </section>

  <section class="win board2" id="board" hidden>
    <div class="win-h"><span class="dots"><i></i><i></i><i></i></span>Hourly Founding Board<span class="r" id="board-n"></span></div>
    <ol id="board-rows"></ol>
    <div class="pager" id="board-pager" hidden><button type="button" class="pg-b" id="pg-prev" aria-label="Previous page">Prev</button><span id="pg-at"></span><button type="button" class="pg-b" id="pg-next" aria-label="Next page">Next</button></div>
  </section>
  </div>`;
}

// ---------- ref tracking: ?ref= on landing, kept for this browser, sent with every seat request ----------
const REF_KEY = "hourly_ref";
export function captureRef() {
  try {
    const r = new URLSearchParams(location.search).get("ref");
    if (r && /^[\w.-]{1,64}$/.test(r)) localStorage.setItem(REF_KEY, r);
  } catch (_) { /* storage blocked */ }
}
export function getRef() { try { return localStorage.getItem(REF_KEY) || ""; } catch (_) { return ""; } }

const $ = (s, r = document) => r.querySelector(s);
const PER_PAGE = 10;
const esc = (t) => String(t).replace(/[<>&"]/g, "");

// One seat request; the server also files it in the Request access inbox.
export async function submitSeatRequest(api, payload) { return api("seats", payload); }

export function bindSite({ api }) {
  const root = $(".site"); if (!root) return;
  const ref = getRef();

  // seat count: live from the server, never hard coded
  const count = () => api("seats/count").then((c) => { $("#seats-claimed").textContent = String(c.claimed); }).catch(() => {});
  const still = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const pad = (v) => String(v).padStart(2, "0");
  const wait = (ms) => new Promise((r) => setTimeout(r, still ? 0 : ms));
  // roll the seat number from 00 up to n (instant when motion is reduced)
  const rollTo = (el, n) => new Promise((done) => {
    if (still) { el.textContent = "#" + pad(n); return done(); }
    const t0 = performance.now(), dur = 520 + Math.min(n, 50) * 12;
    const step = (t) => { const k = Math.min(1, (t - t0) / dur), v = Math.round(n * (1 - Math.pow(1 - k, 3))); el.textContent = "#" + pad(v); if (k < 1) requestAnimationFrame(step); else done(); };
    requestAnimationFrame(step);
  });
  const shareIntent = (seat) => `https://x.com/intent/post?text=${encodeURIComponent(`I just claimed Founding GPU Owner seat #${seat} on @hourly_markets. A floor on GPU rent, paid out in USDC on Solana. hourly.markets/?ref=seat`)}`;
  // the success moment after a seat is recorded; seat and claimed come from the server reply
  const playSeatSuccess = async (seat, claimed, name) => {
    const hero = $("#seats"), box = $("#s-ok"), line = $("#rec-line");
    const t = new Date();
    $("#sok-who").textContent = name;
    $("#sok-date").textContent = t.toUTCString().slice(5, 16);
    $("#sok-share").href = shareIntent(seat);
    hero.classList.add("is-done");
    box.hidden = false; box.className = "done s1";
    await wait(700);
    line.textContent = "recorded";
    box.classList.add("s2");                       // ticket slides in with a shine
    await rollTo($("#s-num"), seat);
    $("#s-num").textContent = "#" + pad(seat);
    box.classList.add("s3");                       // bar fills, counter ticks up
    $("#sok-bar").style.width = `${Math.min(100, (claimed / SEATS_TOTAL) * 100)}%`;
    $("#sok-claimed").textContent = String(claimed);
    $("#seats-claimed").textContent = String(claimed);
    await wait(450);
    box.classList.add("s4");                       // note and actions
  };
  count();


  // one action: the button opens the form; the button, link and chips step aside
  $("#open-seat").addEventListener("click", () => {
    $("#cta2").hidden = true; $("#chips2").hidden = true; $("#seat-panel").hidden = false; $("#seats").classList.add("open");
    const n = $("#s-name"); if (n) n.focus();
  });

  const sf = $("#seat-form"), serr = $("#s-err"), go = $("#s-go");
  sf.addEventListener("submit", async (e) => {
    e.preventDefault();
    serr.classList.remove("open"); serr.textContent = "";
    const body = { name: $("#s-name").value.trim(), email: $("#s-email").value.trim(), gpus: $("#s-gpus").value, company: $("#s-co").value.trim(), show: $("#s-show").checked, ref };
    if (!body.name || !body.gpus || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(body.email)) { serr.textContent = "Name, email and GPUs you run are required."; serr.classList.add("open"); return; }
    go.disabled = true; go.textContent = "Sending";
    try {
      const r = await submitSeatRequest(api, body);
      const panel = $("#seat-panel");
      panel.classList.add("is-collapsing");
      await wait(280);
      panel.hidden = true; panel.classList.remove("is-collapsing");
      playSeatSuccess(r.seat || r.claimed || 1, r.claimed || 1, body.name);
    }
    catch (e2) { serr.textContent = e2.message; serr.classList.add("open"); }
    go.disabled = false; go.textContent = "Submit";
  });

  // board: lower on the page, only once it has approved entries
  api("founders").then((f) => {
    const rows = (f && f.rows) || [];
    if (!rows.length) return;
    $("#board").hidden = false;
    let page = 0;
    const pages = Math.ceil(rows.length / PER_PAGE);
    $("#board-n").textContent = `${rows.length} of ${SEATS_TOTAL}`;
    const draw = () => {
      $("#board-rows").innerHTML = rows.slice(page * PER_PAGE, page * PER_PAGE + PER_PAGE)
        .map((r, i) => `<li><span class="n">${page * PER_PAGE + i + 1}</span><span class="w">${esc(r.who)}</span><span class="g">${esc(r.gpus)}</span></li>`).join("");
      $("#pg-at").textContent = `${page * PER_PAGE + 1} to ${Math.min(rows.length, (page + 1) * PER_PAGE)} of ${rows.length}`;
      $("#pg-prev").disabled = page === 0; $("#pg-next").disabled = page >= pages - 1;
    };
    $("#board-pager").hidden = pages < 2;
    $("#pg-prev").addEventListener("click", () => { if (page > 0) { page--; draw(); } });
    $("#pg-next").addEventListener("click", () => { if (page < pages - 1) { page++; draw(); } });
    draw();
  }).catch(() => {});
}
