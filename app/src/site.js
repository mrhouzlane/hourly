// Home: request a Founding GPU Owner seat (left), the live seat count and the Hourly Founding Board (right).
// Backend: /api/seats, /api/seats/count, /api/founders. No index numbers are shown here while the hold is on.
export function siteHtml(orb = "") {
  return `<div class="site">
  <div class="home">
    <section class="ask" id="seats">
      <div class="orb orb-s">${orb}</div>
      <h2>If you own, rent or use GPUs.</h2>
      <p class="lede">Request one of 50 Founding GPU Owner seats. A floor on your GPU rent, paid out onchain in USDC on Solana.</p>
      <div class="win">
        <div class="win-h"><span class="dots"><i></i><i></i><i></i></span>Request a seat<span class="r">Devnet beta</span></div>
        <form id="seat-form" novalidate>
          <label class="f"><span>Name</span><input id="s-name" name="name" type="text" maxlength="80" required placeholder="Your name" autocomplete="name"></label>
          <label class="f"><span>GPUs you run</span><select id="s-gpus" name="gpus" required><option value="">Select a range</option><option>Under 64</option><option>64 to 511</option><option>512 to 4k</option><option>4k plus</option></select></label>
          <label class="f"><span>Company <i>optional</i></span><input id="s-co" name="company" type="text" maxlength="80" placeholder="Company or project" autocomplete="organization"></label>
          <label class="f"><span>Email <i>optional</i></span><input id="s-email" name="email" type="email" maxlength="120" placeholder="you@company.com" autocomplete="email"></label>
          <label class="opt"><input id="s-show" type="checkbox"> Show my name on the Hourly Founding Board</label>
          <button type="submit" class="go" id="s-go">Request a seat</button>
          <p class="err" id="s-err" role="alert"></p>
          <div class="okmsg" id="s-ok" role="status">Request received. We will be in touch.</div>
        </form>
      </div>
      <ul class="perks"><li>Priority on mainnet when it opens</li><li>Name on the Founding board</li></ul>
      <p class="fine">Test money. Seats are a perk, not a gate. The site stays open to everyone.</p>
    </section>
    <aside class="rail">
      <section class="win seatsbox board" id="board">
        <div class="win-h"><span class="dots"><i></i><i></i><i></i></span>Hourly Founding Board<span class="r" id="board-n">Live</span></div>
        <div class="stat">
          <div class="num"><b id="seats-claimed">0</b><span>/ 50</span><em>seats claimed</em></div>
          <div class="ticks" id="ticks" aria-hidden="true">${"<i></i>".repeat(50)}</div>
          <div class="lbl">Fills from real requests only</div>
        </div>
        <ol id="board-rows"><li class="none"><b>Be the first.</b> Request a seat and tick "Show my name" to be listed here.<span class="listen">listening for seats<span class="cur"></span></span></li></ol>
        <div class="pager" id="board-pager" hidden><button type="button" class="pg-b" id="pg-prev" aria-label="Previous page">Prev</button><span id="pg-at"></span><button type="button" class="pg-b" id="pg-next" aria-label="Next page">Next</button></div>
      </section>
      <p class="fine">Listed only if the owner asked, once the Hourly team confirms.</p>
    </aside>
  </div>
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
const PER_PAGE = 8;
const esc = (t) => String(t).replace(/[<>&"]/g, "");

// api: the v3 api() helper; go: the v3 router.
export function bindSite({ api }) {
  const root = $(".site"); if (!root) return;
  const ref = getRef();

  // seat count: live, never hard coded; the 50 ticks fill as seats are claimed
  const count = () => api("seats/count").then((c) => {
    $("#seats-claimed").textContent = String(c.claimed);
    root.querySelectorAll("#ticks i").forEach((t, i) => t.classList.toggle("on", i < c.claimed));
  }).catch(() => {});
  count();

  // board: approved Founding GPU Owners who asked to be shown, 8 a page
  api("founders").then((f) => {
    const rows = (f && f.rows) || [];
    if (!rows.length) return;
    let page = 0;
    const pages = Math.ceil(rows.length / PER_PAGE);
    $("#board-n").textContent = `${rows.length} listed`;
    const draw = () => {
      $("#board-rows").innerHTML = rows.slice(page * PER_PAGE, page * PER_PAGE + PER_PAGE)
        .map((r, i) => `<li style="animation-delay:${i * 30}ms"><span class="n">${page * PER_PAGE + i + 1}</span><span class="w">${esc(r.who)}</span><span class="g">${esc(r.gpus)}</span></li>`).join("");
      $("#pg-at").textContent = `${page * PER_PAGE + 1} to ${Math.min(rows.length, (page + 1) * PER_PAGE)} of ${rows.length}`;
      $("#pg-prev").disabled = page === 0; $("#pg-next").disabled = page >= pages - 1;
    };
    $("#board-pager").hidden = pages < 2;
    $("#pg-prev").addEventListener("click", () => { if (page > 0) { page--; draw(); } });
    $("#pg-next").addEventListener("click", () => { if (page < pages - 1) { page++; draw(); } });
    draw();
  }).catch(() => {});

  // request a seat: the form is open from the start
  const sf = $("#seat-form"), serr = $("#s-err"), ok = $("#s-ok"), go = $("#s-go");
  sf.addEventListener("submit", async (e) => {
    e.preventDefault();
    serr.classList.remove("open"); serr.textContent = ""; ok.classList.remove("open");
    const body = { name: $("#s-name").value.trim(), company: $("#s-co").value.trim(), gpus: $("#s-gpus").value, email: $("#s-email").value.trim(), show: $("#s-show").checked, ref };
    if (!body.name || !body.gpus) { serr.textContent = "Name and GPUs you run are required."; serr.classList.add("open"); return; }
    go.disabled = true; go.textContent = "Sending";
    try { await api("seats", body); ok.classList.add("open"); sf.reset(); count(); }
    catch (e2) { serr.textContent = e2.message; serr.classList.add("open"); }
    go.disabled = false; go.textContent = "Request a seat";
  });
}
