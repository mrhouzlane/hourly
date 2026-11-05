// Debt page from the site-v3 draft: public GPU loans, breakeven rent, coverage gauge (band only, index hold), maturity wall, floor simulator.
// Every deal links its public source. Illustrations are labelled. No index numbers are shown while the hold is on.
export function debtHtml() {
  return `<div class="debtpg">
  <div class="kick">Hourly Debt · USD per GPU hour</div>
  <h1>GPU debt, in the open.</h1>
  <p class="sub">Public GPU loans, the rent they need, and a floor that pays out when that rent drops.</p>
  <p class="rail">Floors are bought and pay out in USDC on Solana. Devnet beta, test money.</p>

  <section id="tracker">
    <div class="sh"><span><span class="dots"><b></b><b></b><b></b></span>Public GPU deal tracker</span><span class="r">Updated <span id="updated">Thu Nov 5, 2026</span></span></div>
    <div class="sb">
      <div class="tiles">
        <div><em>Signed sizes disclosed</em><b id="s-sum">$0</b><small>Facility sizes as announced, not drawn</small></div>
        <div><em>Loans tracked</em><b id="s-n">0</b><small>Public sources, linked on every loan</small></div>
        <div><em>Typical terms</em><b>Loans 3 to 6 years</b><small>Rentals 12 to 36 months</small></div>
      </div>
      <h3 class="lh">Largest deals</h3>
      <div class="cards" id="cards"></div>
      <div id="more" class="cards more" hidden></div>
      <div class="seeall"><button type="button" class="toggle" id="btn-more" aria-expanded="false" aria-controls="more">See all <span id="n-all">14</span> loans</button></div>
      <div class="toolbar">
        <button type="button" class="toggle" id="btn-all" aria-expanded="false">Show all data</button>
        <p class="fine" style="margin:0">Sizes are facility sizes as announced, not amounts drawn. Credit: <a href="https://www.amcompute.com/gpu-financing-tracker" target="_blank" rel="noopener">American Compute</a>.</p>
      </div>
      <div id="alldata">
        <div class="tw"><table>
          <thead><tr><th>Borrower</th><th>Size</th><th>Signed</th><th>Repaying until</th><th>Rate</th><th>Structure</th><th>Source</th></tr></thead>
          <tbody id="allbody"></tbody>
        </table></div>
      </div>
    </div>
  </section>

  <section id="wall">
    <div class="sh"><span><span class="dots"><b></b><b></b><b></b></span>Maturity wall</span><span class="r">Years from signing</span></div>
    <div class="sb">
      <p class="note">Loans run longer than the rental contracts that repay them. The gap is rent price risk Hourly floors cover.</p>
      <div class="legend">
        <span><i style="border:1px solid #fff"></i>Loan term</span>
        <span><i style="background:#fff"></i>Rental contract, stated</span>
        <span><i style="background:repeating-linear-gradient(90deg,rgba(255,255,255,.75) 0 3px,rgba(255,255,255,.35) 3px 6px)"></i>Rental, typical 12 to 36 months</span>
        <span><i style="background:var(--gap);border:1px solid rgba(255,255,255,.4)"></i>Rent price risk Hourly floors cover</span>
      </div>
      <div class="wall" id="wallrows"></div>
      <div class="wall"><span></span><div class="axis" id="axis"></div></div>
      <p class="fine" style="margin-top:12px">CoreWeave states customer contracts average about 3 years (<a href="https://investors.coreweave.com/news/news-details/2026/CoreWeave-Closes-2-6-Billion-Loan-Facility-Expanding-Financing-Flexibility-for-AI-Infrastructure/default.aspx" target="_blank" rel="noopener">DDTL 5.5</a>). Other rows use the typical 12 to 36 month range. Only loans with a public maturity are drawn.</p>
    </div>
  </section>

  <div class="two">
    <section id="breakeven">
      <div class="sh"><span><span class="dots"><b></b><b></b><b></b></span>Breakeven rent</span><span class="ill">Illustration · estimate</span></div>
      <div class="sb">
        <span class="chip">H100</span>
        <p class="note" style="margin-top:12px">Rent an H100 needs to cover its loan:</p>
        <div class="sbig">about $<span id="be">2.05</span><small> per hour</small></div>
        <p class="fine" id="be-split">$1.64 loan payment plus $0.41 power, colocation and ops, per GPU hour.</p>
        <div class="sl"><label for="rate"><span>Loan rate</span><span id="rate-v">9.5%</span></label><input type="range" id="rate" min="3.97" max="15.97" step="0.5" value="9.47"></div>
        <div class="sl"><label for="util"><span>Utilization</span><span id="util-v">70%</span></label><input type="range" id="util" min="40" max="95" step="5" value="70"></div>
        <details class="assum">
          <summary>Assumptions</summary>
          <ul>
            <li>$35,000 all in per H100 in an HGX node (middle of a $31K to $40K range, <a href="https://www.mercatus-ai.com/blog/h100-gpu-cost" target="_blank" rel="noopener">Mercatus</a>)</li>
            <li>75% loan to value, so a $26,250 loan per GPU</li>
            <li>About 9.5% rate: SOFR 3.97% (<a href="https://fred.stlouisfed.org/series/SOFR" target="_blank" rel="noopener">FRED</a>, Nov 3, 2026) plus 5.5%</li>
            <li>36 months, fully amortizing, monthly payments</li>
            <li>70% utilization of 8,760 hours a year</li>
            <li>Ops about $0.41 per GPU hour</li>
          </ul>
          <p class="fine">An estimate under stated assumptions, not a quote and not an Hourly Index print.</p>
        </details>
      </div>
    </section>

    <section id="coverage">
      <div class="sh"><span><span class="dots"><b></b><b></b><b></b></span>Coverage</span><span class="r">H100</span></div>
      <div class="sb">
        <p class="note">Compared against the daily Hourly Index range. Coverage is the index mid divided by the breakeven rent. Below 1, rent no longer covers the loan.</p>
        
        <div class="track" id="track" aria-label="Coverage gauge. Index range not shown yet.">
          <div class="z z1"></div><div class="z z2"></div><div class="z z3"></div>
          <div class="be" id="be-mark"><span>Breakeven $<span id="be2">2.05</span></span></div>
          <div class="band" id="band"><span>Hourly Index range</span></div>
        </div>
        <div class="axis zl"><span>Under</span><span>Tight</span><span>Covered</span></div>
        <p class="fine" style="margin-top:14px">Coverage <span id="cov-v">shows here once the index range is public</span>. A floor struck near the breakeven rent pays out when the range drops below it.</p>
      </div>
    </section>
  </div>

  <div class="dcta">
    <h2>GPU owner or lender?</h2>
    <a class="pill" href="#access">Request access</a>
  </div>

<div class="overlay" id="sim" role="dialog" aria-modal="true" aria-labelledby="sim-title">
  <div class="panel">
    <div class="ph">
      <h2 id="sim-title">Simulate a floor</h2>
      <button type="button" class="x" id="sim-close" aria-label="Close">×</button>
    </div>
    <div class="pb">
      <p class="note" id="sim-sub">Per GPU illustration on the H100 loan model. Scaled to one GPU.</p>
      <span class="ill">Illustration · not a quote</span>
      <p class="hypo">Hypothetical scenario. Not a view on the borrower.</p>
      <div class="sim-grid">
        <div>
          <div class="sl"><label for="drop"><span>Rent drop</span><span id="drop-v">−20%</span></label><input type="range" id="drop" min="0" max="50" step="1" value="20"></div>
          <div class="sl"><label for="strike"><span>Floor strike vs reference</span><span id="strike-v">−10%</span></label><input type="range" id="strike" min="0" max="40" step="1" value="10"></div>
          <div class="sl"><label for="months"><span>Coverage period</span><span id="months-v">12 months</span></label><input type="range" id="months" min="3" max="36" step="1" value="12"></div>
        </div>
        <div>
          <p class="fine" style="margin:0 0 8px">Reference rent <b id="ref-rent">$2.50</b> / hr · debt service <b id="debt-line">$841</b> / mo · breakeven <b id="be-line">$2.05</b> / hr</p>
          <p class="fine" id="rate-note" style="margin:0">Using this deal's disclosed rate, scaled to the H100 illustration loan.</p>
        </div>
      </div>
      <div class="chart-wrap">
        <canvas id="sim-chart" width="680" height="180" aria-label="Monthly debt payment versus rent with and without a floor"></canvas>
        <div class="chart-leg">
          <span><i style="background:#fff"></i>Monthly debt payment</span>
          <span><i style="background:#7aa0ff"></i>Rent without floor</span>
          <span><i style="background:#b8f0c8"></i>Rent with floor (at strike)</span>
          <span class="gap"><i></i>Floor pays out</span>
        </div>
      </div>
      <div class="out">
        <div class="box"><em>Floor pays out</em><b id="o-payout">$0</b><small>over the coverage period, per GPU</small></div>
        <div class="box"><em>Premium</em><b id="o-prem">$0</b><small id="o-prem-note">Illustration model</small></div>
        <div class="box"><em>Payment covered?</em><b id="o-cov" class="ok">Yes</b><small id="o-cov-note">rent with floor vs debt service</small></div>
      </div>
      <div class="sim-acts">
        <button type="button" class="pri" id="sim-share">Share this simulation</button>
        <a id="sim-x" class="pri" href="#" target="_blank" rel="noopener">Post on X</a>
        <button type="button" id="sim-dl">Download card</button>
      </div>
      <details class="assum">
        <summary>How the illustration works</summary>
        <ul>
          <li>One H100: $35,000 all in, 75% LTV, $26,250 loan, 36 months, 70% utilization, ops $0.41 / hr</li>
          <li>Monthly debt payment from the standard amortizing formula at the rate shown</li>
          <li>Reference rent is an illustration print of $2.50 / hr, not an Hourly Index number</li>
          <li>Realized rent = reference × (1 + rent drop). Floor strike = reference × (1 + strike%). Floor pays out the gap when realized sits below strike</li>
          <li>Premium (illustration) = strike × hours/mo × months × 0.05 × √(months/12) × (0.7 + 0.6 × strike/reference). Transparent, not a market quote</li>
        </ul>
      </details>
    </div>
  </div>
</div>

<canvas id="share-canvas" class="share-preview" width="1200" height="675"></canvas>

<canvas id="share-canvas" class="share-preview" width="1200" height="675"></canvas>
</div>`;
}

export function bindDebt() {

const TODAY = new Date();
const CAPEX=35000, LTV=0.75, MONTHS_LOAN=36, OPS=0.41, UTIL=0.70, REF_RENT=2.50, ILL_RATE=9.47;
const LOAN = CAPEX * LTV;
const HRS_MO = 8760 * UTIL / 12;

// Seed: /workspace/hourly/gpu-debt-section.md (5 Nov 2026). Hide null fields on cards.
const DEALS = [
  {id:"cw40", b:"CoreWeave", facility:"DDTL 4.0", size:8.5, signed:"2026-03-31", until:"2032-03-01", untilLbl:"Mar 2032", ratePct:6.22, rateLbl:"SOFR + 2.25% (~6.2%)", s:"DDTL 4.0, investment grade (A3 Moody's)", src:"CoreWeave", url:"https://investors.coreweave.com/news/news-details/2026/CoreWeave-Closes-Landmark-8-5-Billion-Financing-Facility-Achieving-First-Investment-Grade-Rated-GPU-backed-Financing/default.aspx", y:6},
  {id:"cw50", b:"CoreWeave", facility:"DDTL 5.0", size:3.1, signed:"2026-05-18", until:"2031-11-15", untilLbl:"Nov 2031", ratePct:8.47, rateLbl:"SOFR + 4.50% (~8.5%)", s:"DDTL 5.0 (Ba2 Moody's)", src:"CoreWeave", url:"https://investors.coreweave.com/news/news-details/2026/CoreWeave-Closes-3-1-Billion-Loan-Facility-Expanding-Access-to-Public-Markets-for-GPU-Backed-Financing/", y:5.5},
  {id:"cw55", b:"CoreWeave", facility:"DDTL 5.5", size:2.6, signed:"2026-08-10", until:"2031-09-01", untilLbl:"Sep 2031", ratePct:9.47, rateLbl:"SOFR + 5.50% (~9.5%)", s:"DDTL 5.5 (Ba2 Moody's)", src:"CoreWeave", url:"https://investors.coreweave.com/news/news-details/2026/CoreWeave-Closes-2-6-Billion-Loan-Facility-Expanding-Financing-Flexibility-for-AI-Infrastructure/default.aspx", y:5, cy:3, repay:"Monthly plus excess cash sweep"},
  {id:"cw30", b:"CoreWeave", facility:"DDTL 3.0", size:2.6, signed:"2025-07-31", until:"2030-08-21", untilLbl:"Aug 2030", ratePct:7.97, rateLbl:"SOFR + 4% (~8.0%)", s:"DDTL 3.0, secured GPU SPV", src:"CoreWeave", url:"https://investors.coreweave.com/news/news-details/2025/CoreWeave-Closes-2-6-Billion-Secured-Debt-Financing-Facility-Strengthening-Market-Position-as-AI-Cloud-Leader/default.aspx", y:5.06},
  {id:"lam", b:"Lambda", facility:"Term loan B", size:0.926, signed:"2026-08-27", until:"2030-12-31", untilLbl:"Dec 2030", ratePct:6.97, rateLbl:"SOFR + 3.00% (~7.0%)", s:"TLB, SPV secured by GPUs and contracts (Baa2 Moody's)", src:"Lambda", url:"https://lambda.com/blog/lambda-closes-926-million-senior-secured-term-loan-b-facility", y:4.34, repay:"Fully amortizing inside offtake"},
  {id:"neb", b:"Nebius", facility:"Senior secured", size:0.775, signed:"2026-07-17", until:"2030-10-31", untilLbl:"Oct 2030", ratePct:6.47, rateLbl:"SOFR + 2.50% (~6.5%)", s:"Senior secured, GPUs and customer cash flows", src:"Nebius", url:"https://nebius.com/newsroom/nebius-raises-775-million-in-first-secured-debt-financing-to-accelerate-global-buildout", y:4.29, repay:"Schedule not disclosed"},
  {id:"iren", b:"IREN", facility:"Microsoft package", size:3.65, signed:"2026-06-01", until:"2031-12-31", untilLbl:"Dec 2031", ratePct:6.22, rateLbl:"SOFR + 2.25% / 5.96% notes", s:"$1.55B DDTL plus $2.10B private placement (Fitch A)", src:"AmCompute", url:"https://www.amcompute.com/gpu-financing-tracker", y:5.5, repay:"Amortizes on a schedule"},
  {id:"firm", b:"Firmus", facility:"GPU backed", size:10, signed:"2026-02-01", until:null, untilLbl:null, ratePct:null, rateLbl:null, s:"GPU backed financing", src:"AmCompute", url:"https://www.amcompute.com/gpu-financing-tracker"},
  {id:"nsc", b:"Nscale", facility:"DDTL", size:1.4, signed:"2026-02-01", until:null, untilLbl:null, ratePct:null, rateLbl:null, s:"DDTL", src:"Axis", url:"https://www.axisgroupventures.com/post/gpu-infrastructure-a-2025-2026-sector-financing-roundup"},
  {id:"valor", b:"Valor · xAI", facility:"Triple net lease", size:3.5, signed:"2026-01-07", until:null, untilLbl:null, ratePct:null, rateLbl:null, s:"Triple net lease; $3.5B of a $5.4B purchase", src:"Apollo", url:"https://www.apollo.com/insights-news/pressreleases/2026/01/apollo-backs-5-4-billion-valor-and-xai-data-center-compute-infrastructure-transaction-with-3-5-billion-capital-solution-3214463", chip:"NVIDIA GB200"},
  {id:"cru-b", b:"Crusoe", facility:"Brookfield facility", size:0.75, signed:"2025-06-01", until:null, untilLbl:null, ratePct:null, rateLbl:null, s:"AI infrastructure credit facility", src:"Axis", url:"https://www.axisgroupventures.com/post/gpu-infrastructure-a-2025-2026-sector-financing-roundup"},
  {id:"flu", b:"Fluidstack", facility:"Macquarie facility", size:null, signed:"2025-04-01", until:null, untilLbl:null, ratePct:null, rateLbl:null, s:"GPU financing facility", src:"Wing", url:"https://www.wing.vc/content/how-the-gpu-became-collateral"},
  {id:"cru-u", b:"Crusoe", facility:"Upper90 facility", size:0.225, signed:"2025-03-01", until:null, untilLbl:null, ratePct:null, rateLbl:null, s:"Credit facility, GPUs and supporting infrastructure", src:"Crusoe", url:"https://www.crusoe.ai/resources/newsroom/upper90-closes-usd225m-credit-facility-to-crusoe-to-expand-ai-cloud"},
  {id:"onc", agg:true, b:"Onchain GPU loans", facility:"Public aggregate", size:0.441, signed:null, signedLbl:"Jul 2025 to Sep 2026", until:null, untilLbl:"~3 year terms", ratePct:12.5, rateLbl:"10% to 15% fixed", s:"18 loans · 70% to 80% loan to value", src:"AmCompute onchain", url:"https://www.amcompute.com/onchain-gpu-financing", y:3}
];

const esc = s => String(s).replace(/[&<>"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
const usd = b => b == null ? null : (b >= 1 ? `$${+b.toFixed(2)}B` : `$${Math.round(b*1000)}M`);
function parseISO(s){ if(!s) return null; const [y,m,d]=s.split("-").map(Number); return new Date(y,m-1,d||1); }
function progress(d){
  const a=parseISO(d.signed), b=parseISO(d.until);
  if(!a||!b) return null;
  const tot=b-a, done=Math.max(0,Math.min(tot, TODAY-a));
  return Math.round(done/tot*100);
}
function monthlyPmt(ratePct){
  const r=(ratePct||ILL_RATE)/100/12;
  return LOAN*r/(1-Math.pow(1+r,-MONTHS_LOAN));
}
function breakeven(ratePct, utilPct){
  const pmt=monthlyPmt(ratePct);
  const hrs=8760*(utilPct||70)/100;
  const debt=Math.round(pmt*12/hrs*100)/100;
  return {pmt, debt, total: +(debt+OPS).toFixed(2)};
}

function cardHTML(d){
  const size=usd(d.size);
  const rate=d.rateLbl;
  const until=d.untilLbl;
  const pct=progress(d);
  let meta="";
  if(rate) meta += `<div><em>Rate</em>${esc(rate)}</div>`;
  if(until) meta += `<div><em>Repaying until</em>${esc(until)}</div>`;
  else if(d.chip) meta += `<div><em>Chip</em>${esc(d.chip)}</div>`;
  let prog="";
  if(until && pct!=null){
    prog=`<div class="prog"><div class="lbl"><span>Loan life elapsed</span><span>${pct}%</span></div><div class="bar"><i style="width:${pct}%"></i></div></div>`;
  }
  const sizeHTML = size ? `<div class="sz">${esc(size)}</div>` : `<div class="sz" style="font-size:18px;color:var(--mute)">Size not public</div>`;
  const fit = d.agg
    ? `<span class="fit on">Onchain today</span>`
    : `<span class="fit">Offchain loan, floor via USDC on Solana</span>`;
  return `<article class="card${d.agg?' agg':''}" data-id="${d.id}">
    <div class="who">${esc(d.b)}<small>${esc(d.facility||'')}</small></div>
    ${sizeHTML}
    <div class="meta">${meta}</div>
    ${prog}
    ${fit}
    <div class="dsrc"><a href="${d.url}" target="_blank" rel="noopener">${esc(d.src)}</a></div>
    <div class="acts">
      <button type="button" class="pri" data-sim="${d.id}">Simulate a floor</button>
      <button type="button" data-share="${d.id}">Share</button>
    </div>
  </article>`;
}

const cardsEl=document.getElementById("cards");
const TOP = DEALS.filter(d=>!d.agg && d.size).sort((a,b)=>b.size-a.size).slice(0,3);
cardsEl.innerHTML = TOP.map(cardHTML).join("");
document.getElementById("more").innerHTML = DEALS.filter(d=>!TOP.includes(d)).map(cardHTML).join("");
document.getElementById("n-all").textContent = DEALS.length;
document.getElementById("btn-more").onclick=function(){
  const box=document.getElementById("more"), open=box.hidden;
  box.hidden=!open; this.setAttribute("aria-expanded", String(open)); this.classList.toggle("on", open);
  this.innerHTML = open ? "Show the 3 largest only" : `See all <span id="n-all">${DEALS.length}</span> loans`;
};
const named=DEALS.filter(d=>!d.agg);
document.getElementById("s-n").textContent = named.length + " + onchain";
document.getElementById("s-sum").textContent = "$" + Math.round(named.reduce((a,d)=>a+(d.size||0),0)) + "B";

document.getElementById("allbody").innerHTML = DEALS.map(d=>{
  const cells=[
    esc(d.b),
    usd(d.size)||"·",
    d.signedLbl ? esc(d.signedLbl) : esc((d.signed||"").replace(/(\d{4})-(\d{2})-(\d{2})/,(_,y,m,dd)=>{
      const months=["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
      return months[+m-1]+" "+(+dd)+" "+y;
    }).replace(/(\d{4})-(\d{2})-01/,(_,y,m)=>{
      const months=["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
      return months[+m-1]+" "+y;
    })),
    d.untilLbl?esc(d.untilLbl):"·",
    d.rateLbl?esc(d.rateLbl):"·",
    esc(d.s),
    `<a href="${d.url}" target="_blank" rel="noopener">${esc(d.src)}</a>`
  ];
  return `<tr><td class="b">${cells[0]}</td><td>${cells[1]}</td><td>${cells[2]}</td><td>${cells[3]}</td><td>${cells[4]}</td><td>${cells[5]}</td><td>${cells[6]}</td></tr>`;
}).join("");

document.getElementById("btn-all").onclick=function(){
  const box=document.getElementById("alldata");
  const on=box.classList.toggle("open");
  this.classList.toggle("on",on);
  this.setAttribute("aria-expanded", on?"true":"false");
  this.textContent = on ? "Hide all data" : "Show all data";
};

// Breakeven
const rate=document.getElementById("rate"), util=document.getElementById("util");
function renderBE(){
  const b=breakeven(+rate.value,+util.value);
  document.getElementById("be").textContent=b.total.toFixed(2);
  document.getElementById("be2").textContent=b.total.toFixed(2);
  document.getElementById("rate-v").textContent=(+rate.value).toFixed(1)+"%";
  document.getElementById("util-v").textContent=util.value+"%";
  document.getElementById("be-split").textContent=`$${b.debt.toFixed(2)} loan payment plus $${OPS.toFixed(2)} power, colocation and ops, per GPU hour.`;
  window.__breakeven=b.total;
}
rate.oninput=util.oninput=renderBE; renderBE();

// Index hold: INDEX_PUBLIC stays false, so setIndexRange is never called and no index number renders here.
const INDEX_PUBLIC = false;
function setIndexRange(lo, mid, hi){
  const be=window.__breakeven, pos=v=>Math.max(0,Math.min(100,((v/be)-0.5)/1.5*100));
  const band=document.getElementById("band");
  band.style.left=pos(lo)+"%"; band.style.right=(100-pos(hi))+"%";
  document.getElementById("cov-v").textContent=(mid/be).toFixed(2)+"x";
}
window.setIndexRange=setIndexRange;

// Maturity wall
const MAXY=6, rows=DEALS.filter(d=>d.y);
document.getElementById("wallrows").innerHTML = rows.map((d,i)=>{
  const gl = i===0 ? `<span class="gl">Rent price risk Hourly floors cover</span>` : "";
  const pct=v=>(v/MAXY*100).toFixed(2)+"%";
  const lb=`${esc(d.b)}<small>${esc(d.facility||'')} · ${usd(d.size)||''}</small>`;
  let inner;
  if(d.cy){
    inner=`<div class="c" style="width:${pct(d.cy)}"></div><div class="g" style="left:${pct(d.cy)};width:${pct(d.y-d.cy)}">${gl}</div>`;
  } else {
    inner=`<div class="c" style="width:${pct(1)}"></div><div class="cr" style="left:${pct(1)};width:${pct(Math.min(3,d.y)-1)}"></div>`+(d.y>3?`<div class="g" style="left:${pct(3)};width:${pct(d.y-3)}">${gl}</div>`:'');
  }
  return `<div class="lb">${lb}</div><div class="barw" title="Loan about ${d.y.toFixed(1)} years">${inner}<div class="ln" style="width:${pct(d.y)}"></div><span class="t">loan ${d.y.toFixed(1)}y</span></div>`;
}).join("");
document.getElementById("axis").innerHTML=[0,1,2,3,4,5,6].map(y=>`<span>${y}y</span>`).join("");

// ---- Simulation ----
let activeDeal=null, lastSim=null, chartAnim=null, chartFrame=0;
const simEl=document.getElementById("sim");
function openSim(d){
  activeDeal=d;
  document.getElementById("sim-title").textContent = "Simulate a floor · " + d.b;
  document.getElementById("sim-sub").textContent = (d.facility? d.facility+" · ":"") + "Per GPU illustration on the H100 loan model. Scaled to one GPU.";
  const usingIll = d.ratePct==null;
  document.getElementById("rate-note").textContent = usingIll
    ? `Rate not disclosed for this deal. Using the illustration rate of ${ILL_RATE}%.`
    : `Using this deal's disclosed rate (${d.rateLbl}), scaled to the H100 illustration loan.`;
  simEl.classList.add("open");
  runSim({animate:true});
}
function closeSim(){
  simEl.classList.remove("open");
  if(chartAnim){ cancelAnimationFrame(chartAnim); chartAnim=null; }
}
document.getElementById("sim-close").onclick=closeSim;
simEl.addEventListener("click", e=>{ if(e.target===simEl) closeSim(); });
if(!window.__debtEsc){ window.__debtEsc=true; document.addEventListener("keydown", e=>{ if(e.key==="Escape" && window.__closeSim) window.__closeSim(); }); }
window.__closeSim=closeSim;

["drop","strike","months"].forEach(id=>{
  document.getElementById(id).oninput=()=>runSim({animate:true});
});

function runSim(opts){
  if(!activeDeal) return;
  const animate = !!(opts && opts.animate);
  const drop = +document.getElementById("drop").value; // percent down
  const strikeOff = +document.getElementById("strike").value; // percent under reference
  const months = +document.getElementById("months").value;
  document.getElementById("drop-v").textContent = "−" + drop + "%";
  document.getElementById("strike-v").textContent = "−" + strikeOff + "%";
  document.getElementById("months-v").textContent = months + " months";

  const ratePct = activeDeal.ratePct != null ? activeDeal.ratePct : ILL_RATE;
  const be = breakeven(ratePct, 70);
  const pmt = be.pmt;
  const strike = REF_RENT * (1 - strikeOff/100);
  const realized = REF_RENT * (1 - drop/100);
  const rentWith = Math.max(realized, strike);
  const payoutPerHr = Math.max(0, strike - realized);
  const payout = payoutPerHr * HRS_MO * months;
  // Illustration premium (transparent)
  const prem = strike * HRS_MO * months * 0.05 * Math.sqrt(months/12) * (0.7 + 0.6*(strike/REF_RENT));
  const rentMo = rentWith * HRS_MO;
  const rentMoNo = realized * HRS_MO;
  const rentStartMo = REF_RENT * HRS_MO;
  const covered = rentMo >= pmt;

  document.getElementById("ref-rent").textContent = "$" + REF_RENT.toFixed(2);
  document.getElementById("debt-line").textContent = "$" + Math.round(pmt);
  document.getElementById("be-line").textContent = "$" + be.total.toFixed(2);
  document.getElementById("o-payout").textContent = "$" + Math.round(payout).toLocaleString();
  document.getElementById("o-prem").textContent = "$" + Math.round(prem).toLocaleString();
  document.getElementById("o-prem-note").textContent = "Illustration · " + (prem/months|0) + " / mo avg";
  const covEl=document.getElementById("o-cov");
  covEl.textContent = covered ? "Yes" : "Short";
  covEl.className = covered ? "ok" : "warn";
  document.getElementById("o-cov-note").textContent = covered
    ? `rent with floor $${Math.round(rentMo)}/mo covers debt $${Math.round(pmt)}/mo`
    : `rent with floor $${Math.round(rentMo)}/mo vs debt $${Math.round(pmt)}/mo`;

  lastSim = {deal:activeDeal, drop, strikeOff, months, strike, realized, rentWith, payout, prem, pmt, rentMo, rentMoNo, rentStartMo, covered, ratePct, be};
  updateSimLinks();
  startChartAnim(lastSim, animate);
}

function easeOut(t){ return 1 - Math.pow(1-t, 2.4); }

function startChartAnim(sim, animate){
  if(chartAnim){ cancelAnimationFrame(chartAnim); chartAnim=null; }
  const months = sim.months;
  const duration = animate ? Math.min(2200, 280 + months*90) : 0;
  const t0 = performance.now();
  function tick(now){
    const u = duration ? Math.min(1, (now - t0) / duration) : 1;
    const revealed = Math.max(1, Math.ceil(easeOut(u) * months));
    chartFrame = revealed;
    drawChart(sim, revealed);
    if(u < 1){ chartAnim = requestAnimationFrame(tick); }
    else { chartAnim=null; chartFrame = months; drawChart(sim, months); }
  }
  chartAnim = requestAnimationFrame(tick);
}

// Draw up to `revealed` months. Rent without floor falls from reference to dropped level.
// Floor holds at strike. Debt payment is flat. Gap between floor and dropped rent is shaded.
function drawChart(sim, revealed){
  const c=document.getElementById("sim-chart");
  const ctx=c.getContext("2d");
  const W=c.width, H=c.height;
  ctx.clearRect(0,0,W,H);
  const months = sim.months;
  const pmt = sim.pmt;
  const rentStart = sim.rentStartMo;
  const rentEnd = sim.rentMoNo;
  const floorMo = sim.rentMo; // held at strike
  const pad={t:16,r:16,b:28,l:48};
  const maxY = Math.max(pmt, rentStart, rentEnd, floorMo, 1) * 1.18;
  const x=i=> pad.l + (W-pad.l-pad.r)*(i/(months-1||1));
  const y=v=> pad.t + (H-pad.t-pad.b)*(1-v/maxY);
  function rentAt(i){
    // linear fall from start to dropped level across the coverage period
    const t = months<=1 ? 1 : i/(months-1);
    return rentStart + (rentEnd - rentStart) * t;
  }
  function floorAt(i){ return Math.max(rentAt(i), floorMo); }

  // grid
  ctx.strokeStyle="rgba(255,255,255,.08)"; ctx.lineWidth=1;
  for(let i=0;i<4;i++){ const yy=pad.t+(H-pad.t-pad.b)*i/3; ctx.beginPath(); ctx.moveTo(pad.l,yy); ctx.lineTo(W-pad.r,yy); ctx.stroke(); }

  const n = Math.max(1, Math.min(months, revealed|0));

  // shaded gap: floor pays out (between floor line and rent without floor), only where floor > rent
  if(floorMo > rentEnd + 0.5){
    ctx.beginPath();
    for(let i=0;i<n;i++){
      const xx=x(i), yy=y(floorAt(i));
      i?ctx.lineTo(xx,yy):ctx.moveTo(xx,yy);
    }
    for(let i=n-1;i>=0;i--){
      ctx.lineTo(x(i), y(rentAt(i)));
    }
    ctx.closePath();
    ctx.fillStyle="rgba(184,240,200,.22)";
    ctx.fill();
  }

  // debt payment (flat, full width always so the target is visible)
  ctx.strokeStyle="#fff"; ctx.lineWidth=2; ctx.setLineDash([]);
  ctx.beginPath(); ctx.moveTo(pad.l,y(pmt)); ctx.lineTo(W-pad.r,y(pmt)); ctx.stroke();

  // rent without floor (falling)
  ctx.strokeStyle="#7aa0ff"; ctx.lineWidth=2;
  ctx.beginPath();
  for(let i=0;i<n;i++){ const xx=x(i), yy=y(rentAt(i)); i?ctx.lineTo(xx,yy):ctx.moveTo(xx,yy); }
  ctx.stroke();

  // rent with floor (held at strike)
  ctx.strokeStyle="#b8f0c8"; ctx.lineWidth=2.5;
  ctx.beginPath();
  for(let i=0;i<n;i++){ const xx=x(i), yy=y(floorAt(i)); i?ctx.lineTo(xx,yy):ctx.moveTo(xx,yy); }
  ctx.stroke();

  // strike dashed guide once animation has room
  if(n > 1){
    ctx.strokeStyle="rgba(184,240,200,.45)"; ctx.lineWidth=1; ctx.setLineDash([4,4]);
    ctx.beginPath(); ctx.moveTo(pad.l,y(floorMo)); ctx.lineTo(x(n-1),y(floorMo)); ctx.stroke();
    ctx.setLineDash([]);
  }

  // labels
  ctx.fillStyle="rgba(255,255,255,.55)"; ctx.font="11px 'Geist Mono', monospace";
  ctx.fillText("$"+Math.round(maxY), 4, pad.t+4);
  ctx.fillText("$0", 4, H-pad.b);
  ctx.fillText("mo 1", pad.l, H-8);
  ctx.fillText("mo "+months, W-pad.r-36, H-8);
  if(n < months){
    ctx.fillStyle="rgba(255,255,255,.7)";
    ctx.fillText("mo "+n, x(n-1)-10, H-8);
  }
}

function updateSimLinks(){
  if(!lastSim) return;
  const t = shareText(lastSim, true);
  document.getElementById("sim-x").href = "https://x.com/intent/post?text=" + encodeURIComponent(t);
}

function shareText(sim, withUrl){
  const d=sim.deal;
  const size = usd(d.size) || "a public GPU loan";
  const until = d.untilLbl ? `repaying until ${d.untilLbl}` : "outstanding";
  const rate = d.rateLbl || (`~${ILL_RATE}% illustration`);
  const cov = sim.covered ? "the monthly payment stays covered" : "the floor narrows the gap";
  let t = `gpu debt: ${d.b} ${size}, ${rate}, ${until}.\n\n`;
  t += `what if rent drops ${sim.drop}% and you take a floor at −${sim.strikeOff}%?\n`;
  t += `illustration: floor pays out $${Math.round(sim.payout).toLocaleString()} / GPU over ${sim.months} mo. premium $${Math.round(sim.prem).toLocaleString()}. ${cov}.\n\n`;
  t += `hourly floors on gpu rent. pay a premium. if the range drops below it, it pays out onchain on solana.`;
  if(withUrl) t += `\n\nhttps://hourly.markets/debt?ref=share`;
  return t;
}

function drawShareCard(sim, mode){
  // mode: 'deal' | 'sim'
  const c=document.getElementById("share-canvas");
  const ctx=c.getContext("2d");
  const W=1200, H=675;
  // bg
  const g=ctx.createLinearGradient(0,0,W,H);
  g.addColorStop(0,"#2452ff"); g.addColorStop(1,"#12226a");
  ctx.fillStyle=g; ctx.fillRect(0,0,W,H);
  // grid
  ctx.strokeStyle="rgba(255,255,255,.06)"; ctx.lineWidth=1;
  for(let x=0;x<W;x+=40){ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,H);ctx.stroke();}
  for(let y=0;y<H;y+=40){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(W,y);ctx.stroke();}
  // mark (bracket hourglass)
  ctx.fillStyle="#fff";
  const mx=48, my=40, s=1.1;
  function rect(x,y,w,h){ctx.fillRect(mx+x*s, my+y*s, w*s, h*s);}
  rect(0,0,8,44); rect(36,0,8,44);
  rect(12,8,20,4); rect(16,12,12,4); rect(20,16,4,4);
  rect(20,24,4,4); rect(16,28,12,4); rect(12,32,20,4);
  ctx.font="600 28px Geist, Inter, sans-serif";
  ctx.fillText("ourly", mx+52*s, my+30);
  // tag
  ctx.fillStyle="#fff"; ctx.fillRect(W-170, 42, 122, 28);
  ctx.fillStyle="#2452ff"; ctx.font="600 12px 'Geist Mono', monospace";
  ctx.fillText("TEST MONEY", W-158, 61);

  const d=sim.deal;
  ctx.fillStyle="#fff";
  ctx.font="700 54px Geist, Inter, sans-serif";
  ctx.fillText(d.b, 56, 160);
  ctx.font="500 18px 'Geist Mono', monospace";
  ctx.fillStyle="rgba(255,255,255,.7)";
  ctx.fillText((d.facility||"GPU loan").toUpperCase(), 56, 192);

  // metrics row
  const metrics=[
    ["SIZE", usd(d.size)||"not public"],
    ["RATE", d.rateLbl || (`~${ILL_RATE}% illust.`)],
    ["UNTIL", d.untilLbl ? ("Repaying until "+d.untilLbl) : "Outstanding"]
  ];
  metrics.forEach((m,i)=>{
    const x=56+i*360;
    ctx.fillStyle="rgba(255,255,255,.5)"; ctx.font="500 12px 'Geist Mono', monospace";
    ctx.fillText(m[0], x, 250);
    ctx.fillStyle="#fff"; ctx.font="700 28px Geist, Inter, sans-serif";
    const label=m[1].length>28?m[1].slice(0,26)+"…":m[1];
    ctx.fillText(label, x, 286);
  });

  // panel
  ctx.fillStyle="rgba(18,34,106,.85)";
  ctx.fillRect(56, 330, W-112, 230);
  ctx.strokeStyle="rgba(255,255,255,.2)"; ctx.strokeRect(56.5,330.5,W-113,229);

  if(mode==="sim" && sim.payout!=null){
    ctx.fillStyle="rgba(255,255,255,.55)"; ctx.font="500 12px 'Geist Mono', monospace";
    ctx.fillText("ILLUSTRATION · FLOOR SIMULATION · PER GPU", 80, 368);
    ctx.fillStyle="#fff"; ctx.font="600 22px Geist, Inter, sans-serif";
    ctx.fillText(`Rent drop −${sim.drop}%  ·  Floor −${sim.strikeOff}%  ·  ${sim.months} months`, 80, 408);
    const bits=[
      ["Pays out", "$"+Math.round(sim.payout).toLocaleString()],
      ["Premium", "$"+Math.round(sim.prem).toLocaleString()],
      ["Covered?", sim.covered?"Yes":"Short"]
    ];
    bits.forEach((b,i)=>{
      const x=80+i*340;
      ctx.fillStyle="rgba(255,255,255,.5)"; ctx.font="500 12px 'Geist Mono', monospace";
      ctx.fillText(b[0].toUpperCase(), x, 470);
      ctx.fillStyle="#fff"; ctx.font="700 36px Geist, Inter, sans-serif";
      ctx.fillText(b[1], x, 514);
    });
    ctx.fillStyle="rgba(255,255,255,.55)"; ctx.font="500 13px 'Geist Mono', monospace";
    ctx.fillText("H100 illustration loan · not a market quote", 80, 530);
    ctx.fillText("Hypothetical scenario. Not a view on the borrower.", 80, 552);
  } else {
    ctx.fillStyle="rgba(255,255,255,.55)"; ctx.font="500 12px 'Geist Mono', monospace";
    ctx.fillText("GPU LOANS RUN LONGER THAN GPU RENTALS", 80, 370);
    ctx.fillStyle="#fff"; ctx.font="600 26px Geist, Inter, sans-serif";
    ctx.fillText("A floor on GPU rent. Pay a premium.", 80, 418);
    ctx.fillText("If the range drops below it, it pays out onchain.", 80, 456);
    ctx.fillStyle="rgba(255,255,255,.55)"; ctx.font="500 13px 'Geist Mono', monospace";
    ctx.fillText("Public sources · Test money on Solana", 80, 500);
    ctx.fillText("Hypothetical scenario. Not a view on the borrower.", 80, 524);
  }

  ctx.fillStyle="rgba(255,255,255,.7)"; ctx.font="500 14px 'Geist Mono', monospace";
  ctx.fillText("hourly.markets/debt?ref=share", 56, H-36);
  return c;
}

function downloadCanvas(name){
  const c=document.getElementById("share-canvas");
  const a=document.createElement("a");
  a.download=name; a.href=c.toDataURL("image/png"); a.click();
}

function shareDeal(d){
  const sim={deal:d, drop:20, strikeOff:10, months:12, payout:null};
  drawShareCard(sim, "deal");
  downloadCanvas(`hourly-debt-${d.id}.png`);
  const t = `gpu debt in the open: ${d.b}${usd(d.size)?" "+usd(d.size):""}${d.rateLbl?", "+d.rateLbl:""}${d.untilLbl?", repaying until "+d.untilLbl:""}.\n\nloans run longer than the rentals that repay them. hourly: a floor on gpu rent that pays out onchain on solana.\n\nhttps://hourly.markets/debt?ref=share`;
  window.open("https://x.com/intent/post?text="+encodeURIComponent(t), "_blank", "noopener");
}

document.getElementById("sim-share").onclick=()=>{
  if(!lastSim) return;
  drawShareCard(lastSim, "sim");
  downloadCanvas(`hourly-floor-${lastSim.deal.id}.png`);
};
document.getElementById("sim-dl").onclick=()=>{
  if(!lastSim) return;
  drawShareCard(lastSim, "sim");
  downloadCanvas(`hourly-floor-${lastSim.deal.id}.png`);
};

document.getElementById("tracker").addEventListener("click", e=>{
  const simBtn=e.target.closest("[data-sim]");
  const shareBtn=e.target.closest("[data-share]");
  if(simBtn){ const d=DEALS.find(x=>x.id===simBtn.dataset.sim); if(d) openSim(d); }
  if(shareBtn){ const d=DEALS.find(x=>x.id===shareBtn.dataset.share); if(d) shareDeal(d); }
});

// expose for headless checks
window.__DEALS=DEALS;
window.__openSim=openSim;
window.__runSim=runSim;
window.__drawShareCard=drawShareCard;
window.__drawChart=drawChart;
window.__lastSim=()=>lastSim;
window.__chartFrame=()=>chartFrame;
window.__breakevenFn=breakeven;
window.__monthlyPmt=monthlyPmt;

}
