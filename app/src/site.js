// Home sections: Founding GPU Owner seats (the main ask) and the Hourly Founding Board.
// Backend: /api/seats, /api/seats/count, /api/founders. No index numbers are shown here while the hold is on.
export function siteHtml() {
  return `<div class="site">

  <section class="seats2" id="seats">
    <h2>If you own GPUs, do this.</h2>
    <div class="count"><b id="seats-claimed"></b><span>/ 50</span></div>
    <div class="count-l">Founding GPU Owner seats claimed</div>
    <button type="button" class="go big" id="s-open" aria-expanded="false" aria-controls="seat-form">Request a seat</button>
    <form id="seat-form" class="inline" novalidate hidden>
      <label><span>Name</span><input id="s-name" name="name" type="text" maxlength="80" required placeholder="Your name" autocomplete="name"></label>
      <label><span>Company, optional</span><input id="s-co" name="company" type="text" maxlength="80" placeholder="Company or project" autocomplete="organization"></label>
      <label><span>GPUs owned</span><select id="s-gpus" name="gpus" required><option value="">Select a range</option><option>Under 64</option><option>64 to 511</option><option>512 to 4k</option><option>4k plus</option></select></label>
      <label><span>Email, optional</span><input id="s-email" name="email" type="email" maxlength="120" placeholder="you@company.com" autocomplete="email"></label>
      <button type="submit" class="go">Send request</button>
      <label class="opt"><input id="s-show" type="checkbox"> Show my name or company on the Hourly Founding Board</label>
      <p class="err" id="s-err" role="alert"></p>
      <div class="okmsg" id="s-ok">Request received. We will be in touch.</div>
    </form>
    <ul class="perks"><li>Priority on mainnet when it opens</li><li>Name on the Founding board</li></ul>
    <p class="fine">Devnet beta, test money. The site stays open to everyone; seats are a perk, not a gate. Counter fills from real requests only.</p>
  </section>
  <section class="panel" id="board">
    <div class="sh"><span><span class="dots"><b></b><b></b><b></b></span>Hourly Founding Board</span><span class="r">Founding GPU Owners</span></div>
    <div class="sb">
      <table class="lb">
        <thead><tr><th>Seat</th><th>Founding GPU Owner</th><th>GPUs</th><th class="r">Joined</th></tr></thead>
        <tbody id="board-rows"><tr class="none"><td colspan="4"><b>Be the first.</b> Request a seat above and tick "Show my name" to be listed here.</td></tr></tbody>
      </table>
      <p class="fine" style="margin:12px 0 0">Only owners who asked to be shown, listed once the Hourly team confirms them.</p>
    </div>
  </section>
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

const $ = (s, r = document) => r.querySelector(s);

function boardHtml(rows) {
  if (!rows || !rows.length) return null;
  const e = (t) => String(t).replace(/[<>&"]/g, "");
  return rows.map((r, i) => `<tr><td>${i + 1}</td><td>${e(r.who)}</td><td>${e(r.gpus)}</td><td class="r">${e(r.day)}</td></tr>`).join("");
}

// api: the v3 api() helper; go: the v3 router.
export function bindSite({ api, go }) {
  const root = $(".site"); if (!root) return;
  // in-app links: debt route and hash views
  root.querySelectorAll("a[data-debt]").forEach((a) => a.addEventListener("click", (e) => { e.preventDefault(); go("debt"); }));
  // try CTA carries the ref
  const ref = getRef();

  // board: approved Founding GPU Owners who asked to be shown
  api("founders").then((f) => { const html = boardHtml(f && f.rows); if (html) $("#board-rows").innerHTML = html; }).catch(() => {});

  // seats: live count, never hard coded
  const count = () => api("seats/count").then((c) => { $("#seats-claimed").textContent = String(c.claimed); }).catch(() => {});
  count();
  const sf = $("#seat-form"), serr = $("#s-err"), ok = $("#s-ok");
  const so = $("#s-open");
  if (so) so.addEventListener("click", () => { sf.hidden = false; so.hidden = true; so.setAttribute("aria-expanded", "true"); const n = $("#s-name"); if (n) n.focus(); });
  sf.addEventListener("submit", async (e) => {
    e.preventDefault();
    serr.classList.remove("open"); serr.textContent = ""; ok.classList.remove("open");
    const body = { name: $("#s-name").value.trim(), company: $("#s-co").value.trim(), gpus: $("#s-gpus").value, email: $("#s-email").value.trim(), show: $("#s-show").checked, ref };
    if (!body.name || !body.gpus) { serr.textContent = "Name and GPUs owned are required."; serr.classList.add("open"); return; }
    try { await api("seats", body); ok.classList.add("open"); sf.reset(); count(); }
    catch (e2) { serr.textContent = e2.message; serr.classList.add("open"); }
  });
}
