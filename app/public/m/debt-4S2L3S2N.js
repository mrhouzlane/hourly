import"./chunk-QKNWSBBH.js";function ut(){return`<div class="debtpg">
  <div class="kick">Hourly Debt \xB7 USD per GPU hour</div>
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
      <div class="sh"><span><span class="dots"><b></b><b></b><b></b></span>Breakeven rent</span><span class="ill">Illustration \xB7 estimate</span></div>
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
      <button type="button" class="x" id="sim-close" aria-label="Close">\xD7</button>
    </div>
    <div class="pb">
      <p class="note" id="sim-sub">Per GPU illustration on the H100 loan model. Scaled to one GPU.</p>
      <span class="ill">Illustration \xB7 not a quote</span>
      <p class="hypo">Hypothetical scenario. Not a view on the borrower.</p>
      <div class="sim-grid">
        <div>
          <div class="sl"><label for="drop"><span>Rent drop</span><span id="drop-v">\u221220%</span></label><input type="range" id="drop" min="0" max="50" step="1" value="20"></div>
          <div class="sl"><label for="strike"><span>Floor strike vs reference</span><span id="strike-v">\u221210%</span></label><input type="range" id="strike" min="0" max="40" step="1" value="10"></div>
          <div class="sl"><label for="months"><span>Coverage period</span><span id="months-v">12 months</span></label><input type="range" id="months" min="3" max="36" step="1" value="12"></div>
        </div>
        <div>
          <p class="fine" style="margin:0 0 8px">Reference rent <b id="ref-rent">$2.50</b> / hr \xB7 debt service <b id="debt-line">$841</b> / mo \xB7 breakeven <b id="be-line">$2.05</b> / hr</p>
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
          <li>Realized rent = reference \xD7 (1 + rent drop). Floor strike = reference \xD7 (1 + strike%). Floor pays out the gap when realized sits below strike</li>
          <li>Premium (illustration) = strike \xD7 hours/mo \xD7 months \xD7 0.05 \xD7 \u221A(months/12) \xD7 (0.7 + 0.6 \xD7 strike/reference). Transparent, not a market quote</li>
        </ul>
      </details>
    </div>
  </div>
</div>

<canvas id="share-canvas" class="share-preview" width="1200" height="675"></canvas>

<canvas id="share-canvas" class="share-preview" width="1200" height="675"></canvas>
</div>`}function pt(){let V=new Date,j=35e3,X=.75,K=36,_=.41,Z=.7,I=2.5,T=9.5,Q=j*X,P=8760*Z/12,x=[{id:"cw40",b:"CoreWeave",facility:"DDTL 4.0",size:8.5,signed:"2026-03-31",until:"2032-03-01",untilLbl:"Mar 2032",ratePct:6.22,rateLbl:"SOFR + 2.25% (~6.2%)",s:"DDTL 4.0, investment grade (A3 Moody's)",src:"CoreWeave",url:"https://investors.coreweave.com/news/news-details/2026/CoreWeave-Closes-Landmark-8-5-Billion-Financing-Facility-Achieving-First-Investment-Grade-Rated-GPU-backed-Financing/default.aspx",y:6},{id:"cw50",b:"CoreWeave",facility:"DDTL 5.0",size:3.1,signed:"2026-05-18",until:"2031-11-15",untilLbl:"Nov 2031",ratePct:8.47,rateLbl:"SOFR + 4.50% (~8.5%)",s:"DDTL 5.0 (Ba2 Moody's)",src:"CoreWeave",url:"https://investors.coreweave.com/news/news-details/2026/CoreWeave-Closes-3-1-Billion-Loan-Facility-Expanding-Access-to-Public-Markets-for-GPU-Backed-Financing/",y:5.5},{id:"cw55",b:"CoreWeave",facility:"DDTL 5.5",size:2.6,signed:"2026-08-10",until:"2031-09-01",untilLbl:"Sep 2031",ratePct:9.47,rateLbl:"SOFR + 5.50% (~9.5%)",s:"DDTL 5.5 (Ba2 Moody's)",src:"CoreWeave",url:"https://investors.coreweave.com/news/news-details/2026/CoreWeave-Closes-2-6-Billion-Loan-Facility-Expanding-Financing-Flexibility-for-AI-Infrastructure/default.aspx",y:5,cy:3,repay:"Monthly plus excess cash sweep"},{id:"cw30",b:"CoreWeave",facility:"DDTL 3.0",size:2.6,signed:"2025-07-31",until:"2030-08-21",untilLbl:"Aug 2030",ratePct:7.97,rateLbl:"SOFR + 4% (~8.0%)",s:"DDTL 3.0, secured GPU SPV",src:"CoreWeave",url:"https://investors.coreweave.com/news/news-details/2025/CoreWeave-Closes-2-6-Billion-Secured-Debt-Financing-Facility-Strengthening-Market-Position-as-AI-Cloud-Leader/default.aspx",y:5.06},{id:"lam",b:"Lambda",facility:"Term loan B",size:.926,signed:"2026-08-27",until:"2030-12-31",untilLbl:"Dec 2030",ratePct:6.97,rateLbl:"SOFR + 3.00% (~7.0%)",s:"TLB, SPV secured by GPUs and contracts (Baa2 Moody's)",src:"Lambda",url:"https://lambda.com/blog/lambda-closes-926-million-senior-secured-term-loan-b-facility",y:4.34,repay:"Fully amortizing inside offtake"},{id:"neb",b:"Nebius",facility:"Senior secured",size:.775,signed:"2026-07-17",until:"2030-10-31",untilLbl:"Oct 2030",ratePct:6.47,rateLbl:"SOFR + 2.50% (~6.5%)",s:"Senior secured, GPUs and customer cash flows",src:"Nebius",url:"https://nebius.com/newsroom/nebius-raises-775-million-in-first-secured-debt-financing-to-accelerate-global-buildout",y:4.29,repay:"Schedule not disclosed"},{id:"iren",b:"IREN",facility:"Microsoft package",size:3.65,signed:"2026-06-01",until:"2031-12-31",untilLbl:"Dec 2031",ratePct:6.22,rateLbl:"SOFR + 2.25% / 5.96% notes",s:"$1.55B DDTL plus $2.10B private placement (Fitch A)",src:"AmCompute",url:"https://www.amcompute.com/gpu-financing-tracker",y:5.5,repay:"Amortizes on a schedule"},{id:"firm",b:"Firmus",facility:"GPU backed",size:10,signed:"2026-02-01",until:null,untilLbl:null,ratePct:null,rateLbl:null,s:"GPU backed financing",src:"AmCompute",url:"https://www.amcompute.com/gpu-financing-tracker"},{id:"nsc",b:"Nscale",facility:"DDTL",size:1.4,signed:"2026-02-01",until:null,untilLbl:null,ratePct:null,rateLbl:null,s:"DDTL",src:"Axis",url:"https://www.axisgroupventures.com/post/gpu-infrastructure-a-2025-2026-sector-financing-roundup"},{id:"valor",b:"Valor \xB7 xAI",facility:"Triple net lease",size:3.5,signed:"2026-01-07",until:null,untilLbl:null,ratePct:null,rateLbl:null,s:"Triple net lease; $3.5B of a $5.4B purchase",src:"Apollo",url:"https://www.apollo.com/insights-news/pressreleases/2026/01/apollo-backs-5-4-billion-valor-and-xai-data-center-compute-infrastructure-transaction-with-3-5-billion-capital-solution-3214463",chip:"NVIDIA GB200"},{id:"cru-b",b:"Crusoe",facility:"Brookfield facility",size:.75,signed:"2025-06-01",until:null,untilLbl:null,ratePct:null,rateLbl:null,s:"AI infrastructure credit facility",src:"Axis",url:"https://www.axisgroupventures.com/post/gpu-infrastructure-a-2025-2026-sector-financing-roundup"},{id:"flu",b:"Fluidstack",facility:"Macquarie facility",size:null,signed:"2025-04-01",until:null,untilLbl:null,ratePct:null,rateLbl:null,s:"GPU financing facility",src:"Wing",url:"https://www.wing.vc/content/how-the-gpu-became-collateral"},{id:"cru-u",b:"Crusoe",facility:"Upper90 facility",size:.225,signed:"2025-03-01",until:null,untilLbl:null,ratePct:null,rateLbl:null,s:"Credit facility, GPUs and supporting infrastructure",src:"Crusoe",url:"https://www.crusoe.ai/resources/newsroom/upper90-closes-usd225m-credit-facility-to-crusoe-to-expand-ai-cloud"},{id:"onc",agg:!0,b:"Onchain GPU loans",facility:"Public aggregate",size:.441,signed:null,signedLbl:"Jul 2025 to Sep 2026",until:null,untilLbl:"~3 year terms",ratePct:12.5,rateLbl:"10% to 15% fixed",s:"18 loans \xB7 70% to 80% loan to value",src:"AmCompute onchain",url:"https://www.amcompute.com/onchain-gpu-financing",y:3}],h=e=>String(e).replace(/[&<>"]/g,n=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"})[n]),S=e=>e==null?null:e>=1?`$${+e.toFixed(2)}B`:`$${Math.round(e*1e3)}M`;function H(e){if(!e)return null;let[n,a,t]=e.split("-").map(Number);return new Date(n,a-1,t||1)}function tt(e){let n=H(e.signed),a=H(e.until);if(!n||!a)return null;let t=a-n,s=Math.max(0,Math.min(t,V-n));return Math.round(s/t*100)}function O(e){let n=(e||T)/100/12;return Q*n/(1-Math.pow(1+n,-K))}function B(e,n){let a=O(e),t=8760*(n||70)/100,s=Math.round(a*12/t*100)/100;return{pmt:a,debt:s,total:+(s+_).toFixed(2)}}function N(e){let n=S(e.size),a=e.rateLbl,t=e.untilLbl,s=tt(e),i="";a&&(i+=`<div><em>Rate</em>${h(a)}</div>`),t?i+=`<div><em>Repaying until</em>${h(t)}</div>`:e.chip&&(i+=`<div><em>Chip</em>${h(e.chip)}</div>`);let r="";t&&s!=null&&(r=`<div class="prog"><div class="lbl"><span>Loan life elapsed</span><span>${s}%</span></div><div class="bar"><i style="width:${s}%"></i></div></div>`);let d=n?`<div class="sz">${h(n)}</div>`:'<div class="sz" style="font-size:18px;color:var(--mute)">Size not public</div>',p=e.agg?'<span class="fit on">Onchain today</span>':'<span class="fit">Offchain loan, floor via USDC on Solana</span>';return`<article class="card${e.agg?" agg":""}" data-id="${e.id}">
    <div class="who">${h(e.b)}<small>${h(e.facility||"")}</small></div>
    ${d}
    <div class="meta">${i}</div>
    ${r}
    ${p}
    <div class="dsrc"><a href="${e.url}" target="_blank" rel="noopener">${h(e.src)}</a></div>
    <div class="acts">
      <button type="button" class="pri" data-sim="${e.id}">Simulate a floor</button>
      <button type="button" data-share="${e.id}">Share</button>
    </div>
  </article>`}let et=document.getElementById("cards"),W=x.filter(e=>!e.agg&&e.size).sort((e,n)=>n.size-e.size).slice(0,3);et.innerHTML=W.map(N).join(""),document.getElementById("more").innerHTML=x.filter(e=>!W.includes(e)).map(N).join(""),document.getElementById("n-all").textContent=x.length,document.getElementById("btn-more").onclick=function(){let e=document.getElementById("more"),n=e.hidden;e.hidden=!n,this.setAttribute("aria-expanded",String(n)),this.classList.toggle("on",n),this.innerHTML=n?"Show the 3 largest only":`See all <span id="n-all">${x.length}</span> loans`};let q=x.filter(e=>!e.agg);document.getElementById("s-n").textContent=q.length+" + onchain",document.getElementById("s-sum").textContent="$"+Math.round(q.reduce((e,n)=>e+(n.size||0),0))+"B",document.getElementById("allbody").innerHTML=x.map(e=>{let n=[h(e.b),S(e.size)||"\xB7",e.signedLbl?h(e.signedLbl):h((e.signed||"").replace(/(\d{4})-(\d{2})-(\d{2})/,(a,t,s,i)=>["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"][+s-1]+" "+ +i+" "+t).replace(/(\d{4})-(\d{2})-01/,(a,t,s)=>["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"][+s-1]+" "+t)),e.untilLbl?h(e.untilLbl):"\xB7",e.rateLbl?h(e.rateLbl):"\xB7",h(e.s),`<a href="${e.url}" target="_blank" rel="noopener">${h(e.src)}</a>`];return`<tr><td class="b">${n[0]}</td><td>${n[1]}</td><td>${n[2]}</td><td>${n[3]}</td><td>${n[4]}</td><td>${n[5]}</td><td>${n[6]}</td></tr>`}).join(""),document.getElementById("btn-all").onclick=function(){let n=document.getElementById("alldata").classList.toggle("open");this.classList.toggle("on",n),this.setAttribute("aria-expanded",n?"true":"false"),this.textContent=n?"Hide all data":"Show all data"};let F=document.getElementById("rate"),z=document.getElementById("util");function Y(){let e=B(+F.value,+z.value);document.getElementById("be").textContent=e.total.toFixed(2),document.getElementById("be2").textContent=e.total.toFixed(2),document.getElementById("rate-v").textContent=(+F.value).toFixed(1)+"%",document.getElementById("util-v").textContent=z.value+"%",document.getElementById("be-split").textContent=`$${e.debt.toFixed(2)} loan payment plus $${_.toFixed(2)} power, colocation and ops, per GPU hour.`,window.__breakeven=e.total}F.oninput=z.oninput=Y,Y();let dt=!1;function nt(e,n,a){let t=window.__breakeven,s=r=>Math.max(0,Math.min(100,(r/t-.5)/1.5*100)),i=document.getElementById("band");i.style.left=s(e)+"%",i.style.right=100-s(a)+"%",document.getElementById("cov-v").textContent=(n/t).toFixed(2)+"x"}window.setIndexRange=nt;let at=6,st=x.filter(e=>e.y);document.getElementById("wallrows").innerHTML=st.map((e,n)=>{let a=n===0?'<span class="gl">Rent price risk Hourly floors cover</span>':"",t=r=>(r/at*100).toFixed(2)+"%",s=`${h(e.b)}<small>${h(e.facility||"")} \xB7 ${S(e.size)||""}</small>`,i;return e.cy?i=`<div class="c" style="width:${t(e.cy)}"></div><div class="g" style="left:${t(e.cy)};width:${t(e.y-e.cy)}">${a}</div>`:i=`<div class="c" style="width:${t(1)}"></div><div class="cr" style="left:${t(1)};width:${t(Math.min(3,e.y)-1)}"></div>`+(e.y>3?`<div class="g" style="left:${t(3)};width:${t(e.y-3)}">${a}</div>`:""),`<div class="lb">${s}</div><div class="barw" title="Loan about ${e.y.toFixed(1)} years">${i}<div class="ln" style="width:${t(e.y)}"></div><span class="t">loan ${e.y.toFixed(1)}y</span></div>`}).join(""),document.getElementById("axis").innerHTML=[0,1,2,3,4,5,6].map(e=>`<span>${e}y</span>`).join("");let M=null,g=null,$=null,R=0,E=document.getElementById("sim");function J(e){M=e,document.getElementById("sim-title").textContent="Simulate a floor \xB7 "+e.b,document.getElementById("sim-sub").textContent=(e.facility?e.facility+" \xB7 ":"")+"Per GPU illustration on the H100 loan model. Scaled to one GPU.";let n=e.ratePct==null;document.getElementById("rate-note").textContent=n?`Rate not disclosed for this deal. Using the illustration rate of ${T}%.`:`Using this deal's disclosed rate (${e.rateLbl}), scaled to the H100 illustration loan.`,E.classList.add("open"),G({animate:!0})}function A(){E.classList.remove("open"),$&&(cancelAnimationFrame($),$=null)}document.getElementById("sim-close").onclick=A,E.addEventListener("click",e=>{e.target===E&&A()}),window.__debtEsc||(window.__debtEsc=!0,document.addEventListener("keydown",e=>{e.key==="Escape"&&window.__closeSim&&window.__closeSim()})),window.__closeSim=A,["drop","strike","months"].forEach(e=>{document.getElementById(e).oninput=()=>G({animate:!0})});function G(e){if(!M)return;let n=!!(e&&e.animate),a=+document.getElementById("drop").value,t=+document.getElementById("strike").value,s=+document.getElementById("months").value;document.getElementById("drop-v").textContent="\u2212"+a+"%",document.getElementById("strike-v").textContent="\u2212"+t+"%",document.getElementById("months-v").textContent=s+" months";let i=M.ratePct!=null?M.ratePct:T,r=B(i,70),d=r.pmt,p=I*(1-t/100),f=I*(1-a/100),m=Math.max(f,p),k=Math.max(0,p-f)*P*s,o=p*P*s*.05*Math.sqrt(s/12)*(.7+.6*(p/I)),u=m*P,y=f*P,w=I*P,b=u>=d;document.getElementById("ref-rent").textContent="$"+I.toFixed(2),document.getElementById("debt-line").textContent="$"+Math.round(d),document.getElementById("be-line").textContent="$"+r.total.toFixed(2),document.getElementById("o-payout").textContent="$"+Math.round(k).toLocaleString(),document.getElementById("o-prem").textContent="$"+Math.round(o).toLocaleString(),document.getElementById("o-prem-note").textContent="Illustration \xB7 "+(o/s|0)+" / mo avg";let l=document.getElementById("o-cov");l.textContent=b?"Yes":"Short",l.className=b?"ok":"warn",document.getElementById("o-cov-note").textContent=b?`rent with floor $${Math.round(u)}/mo covers debt $${Math.round(d)}/mo`:`rent with floor $${Math.round(u)}/mo vs debt $${Math.round(d)}/mo`,g={deal:M,drop:a,strikeOff:t,months:s,strike:p,realized:f,rentWith:m,payout:k,prem:o,pmt:d,rentMo:u,rentMoNo:y,rentStartMo:w,covered:b,ratePct:i,be:r},ot(),it(g,n)}function lt(e){return 1-Math.pow(1-e,2.4)}function it(e,n){$&&(cancelAnimationFrame($),$=null);let a=e.months,t=n?Math.min(2200,280+a*90):0,s=performance.now();function i(r){let d=t?Math.min(1,(r-s)/t):1,p=Math.max(1,Math.ceil(lt(d)*a));R=p,U(e,p),d<1?$=requestAnimationFrame(i):($=null,R=a,U(e,a))}$=requestAnimationFrame(i)}function U(e,n){let a=document.getElementById("sim-chart"),t=a.getContext("2d"),s=a.width,i=a.height;t.clearRect(0,0,s,i);let r=e.months,d=e.pmt,p=e.rentStartMo,f=e.rentMoNo,m=e.rentMo,c={t:16,r:16,b:28,l:48},k=Math.max(d,p,f,m,1)*1.18,o=l=>c.l+(s-c.l-c.r)*(l/(r-1||1)),u=l=>c.t+(i-c.t-c.b)*(1-l/k);function y(l){let v=r<=1?1:l/(r-1);return p+(f-p)*v}function w(l){return Math.max(y(l),m)}t.strokeStyle="rgba(255,255,255,.08)",t.lineWidth=1;for(let l=0;l<4;l++){let v=c.t+(i-c.t-c.b)*l/3;t.beginPath(),t.moveTo(c.l,v),t.lineTo(s-c.r,v),t.stroke()}let b=Math.max(1,Math.min(r,n|0));if(m>f+.5){t.beginPath();for(let l=0;l<b;l++){let v=o(l),L=u(w(l));l?t.lineTo(v,L):t.moveTo(v,L)}for(let l=b-1;l>=0;l--)t.lineTo(o(l),u(y(l)));t.closePath(),t.fillStyle="rgba(184,240,200,.22)",t.fill()}t.strokeStyle="#fff",t.lineWidth=2,t.setLineDash([]),t.beginPath(),t.moveTo(c.l,u(d)),t.lineTo(s-c.r,u(d)),t.stroke(),t.strokeStyle="#7aa0ff",t.lineWidth=2,t.beginPath();for(let l=0;l<b;l++){let v=o(l),L=u(y(l));l?t.lineTo(v,L):t.moveTo(v,L)}t.stroke(),t.strokeStyle="#b8f0c8",t.lineWidth=2.5,t.beginPath();for(let l=0;l<b;l++){let v=o(l),L=u(w(l));l?t.lineTo(v,L):t.moveTo(v,L)}t.stroke(),b>1&&(t.strokeStyle="rgba(184,240,200,.45)",t.lineWidth=1,t.setLineDash([4,4]),t.beginPath(),t.moveTo(c.l,u(m)),t.lineTo(o(b-1),u(m)),t.stroke(),t.setLineDash([])),t.fillStyle="rgba(255,255,255,.55)",t.font="11px 'Geist Mono', monospace",t.fillText("$"+Math.round(k),4,c.t+4),t.fillText("$0",4,i-c.b),t.fillText("mo 1",c.l,i-8),t.fillText("mo "+r,s-c.r-36,i-8),b<r&&(t.fillStyle="rgba(255,255,255,.7)",t.fillText("mo "+b,o(b-1)-10,i-8))}function ot(){if(!g)return;let e=rt(g,!0);document.getElementById("sim-x").href="https://x.com/intent/post?text="+encodeURIComponent(e)}function rt(e,n){let a=e.deal,t=S(a.size)||"a public GPU loan",s=a.untilLbl?`repaying until ${a.untilLbl}`:"outstanding",i=a.rateLbl||`~${T}% illustration`,r=e.covered?"the monthly payment stays covered":"the floor narrows the gap",d=`gpu debt: ${a.b} ${t}, ${i}, ${s}.

`;return d+=`what if rent drops ${e.drop}% and you take a floor at \u2212${e.strikeOff}%?
`,d+=`illustration: floor pays out $${Math.round(e.payout).toLocaleString()} / GPU over ${e.months} mo. premium $${Math.round(e.prem).toLocaleString()}. ${r}.

`,d+="hourly floors on gpu rent. pay a premium. if the range drops below it, it pays out onchain on solana.",n&&(d+=`

https://hourly.markets/debt?ref=share`),d}function C(e,n){let a=document.getElementById("share-canvas"),t=a.getContext("2d"),s=1200,i=675,r=t.createLinearGradient(0,0,s,i);r.addColorStop(0,"#2452ff"),r.addColorStop(1,"#12226a"),t.fillStyle=r,t.fillRect(0,0,s,i),t.strokeStyle="rgba(255,255,255,.06)",t.lineWidth=1;for(let o=0;o<s;o+=40)t.beginPath(),t.moveTo(o,0),t.lineTo(o,i),t.stroke();for(let o=0;o<i;o+=40)t.beginPath(),t.moveTo(0,o),t.lineTo(s,o),t.stroke();t.fillStyle="#fff";let d=48,p=40,f=1.1;function m(o,u,y,w){t.fillRect(d+o*f,p+u*f,y*f,w*f)}m(0,0,8,44),m(36,0,8,44),m(12,8,20,4),m(16,12,12,4),m(20,16,4,4),m(20,24,4,4),m(16,28,12,4),m(12,32,20,4),t.font="600 28px Geist, Inter, sans-serif",t.fillText("ourly",d+52*f,p+30),t.fillStyle="#fff",t.fillRect(s-170,42,122,28),t.fillStyle="#2452ff",t.font="600 12px 'Geist Mono', monospace",t.fillText("TEST MONEY",s-158,61);let c=e.deal;return t.fillStyle="#fff",t.font="700 54px Geist, Inter, sans-serif",t.fillText(c.b,56,160),t.font="500 18px 'Geist Mono', monospace",t.fillStyle="rgba(255,255,255,.7)",t.fillText((c.facility||"GPU loan").toUpperCase(),56,192),[["SIZE",S(c.size)||"not public"],["RATE",c.rateLbl||`~${T}% illust.`],["UNTIL",c.untilLbl?"Repaying until "+c.untilLbl:"Outstanding"]].forEach((o,u)=>{let y=56+u*360;t.fillStyle="rgba(255,255,255,.5)",t.font="500 12px 'Geist Mono', monospace",t.fillText(o[0],y,250),t.fillStyle="#fff",t.font="700 28px Geist, Inter, sans-serif";let w=o[1].length>28?o[1].slice(0,26)+"\u2026":o[1];t.fillText(w,y,286)}),t.fillStyle="rgba(18,34,106,.85)",t.fillRect(56,330,s-112,230),t.strokeStyle="rgba(255,255,255,.2)",t.strokeRect(56.5,330.5,s-113,229),n==="sim"&&e.payout!=null?(t.fillStyle="rgba(255,255,255,.55)",t.font="500 12px 'Geist Mono', monospace",t.fillText("ILLUSTRATION \xB7 FLOOR SIMULATION \xB7 PER GPU",80,368),t.fillStyle="#fff",t.font="600 22px Geist, Inter, sans-serif",t.fillText(`Rent drop \u2212${e.drop}%  \xB7  Floor \u2212${e.strikeOff}%  \xB7  ${e.months} months`,80,408),[["Pays out","$"+Math.round(e.payout).toLocaleString()],["Premium","$"+Math.round(e.prem).toLocaleString()],["Covered?",e.covered?"Yes":"Short"]].forEach((u,y)=>{let w=80+y*340;t.fillStyle="rgba(255,255,255,.5)",t.font="500 12px 'Geist Mono', monospace",t.fillText(u[0].toUpperCase(),w,470),t.fillStyle="#fff",t.font="700 36px Geist, Inter, sans-serif",t.fillText(u[1],w,514)}),t.fillStyle="rgba(255,255,255,.55)",t.font="500 13px 'Geist Mono', monospace",t.fillText("H100 illustration loan \xB7 not a market quote",80,530),t.fillText("Hypothetical scenario. Not a view on the borrower.",80,552)):(t.fillStyle="rgba(255,255,255,.55)",t.font="500 12px 'Geist Mono', monospace",t.fillText("GPU LOANS RUN LONGER THAN GPU RENTALS",80,370),t.fillStyle="#fff",t.font="600 26px Geist, Inter, sans-serif",t.fillText("A floor on GPU rent. Pay a premium.",80,418),t.fillText("If the range drops below it, it pays out onchain.",80,456),t.fillStyle="rgba(255,255,255,.55)",t.font="500 13px 'Geist Mono', monospace",t.fillText("Public sources \xB7 Test money on Solana",80,500),t.fillText("Hypothetical scenario. Not a view on the borrower.",80,524)),t.fillStyle="rgba(255,255,255,.7)",t.font="500 14px 'Geist Mono', monospace",t.fillText("hourly.markets/debt?ref=share",56,i-36),a}function D(e){let n=document.getElementById("share-canvas"),a=document.createElement("a");a.download=e,a.href=n.toDataURL("image/png"),a.click()}function ct(e){C({deal:e,drop:20,strikeOff:10,months:12,payout:null},"deal"),D(`hourly-debt-${e.id}.png`);let a=`gpu debt in the open: ${e.b}${S(e.size)?" "+S(e.size):""}${e.rateLbl?", "+e.rateLbl:""}${e.untilLbl?", repaying until "+e.untilLbl:""}.

loans run longer than the rentals that repay them. hourly: a floor on gpu rent that pays out onchain on solana.

https://hourly.markets/debt?ref=share`;window.open("https://x.com/intent/post?text="+encodeURIComponent(a),"_blank","noopener")}document.getElementById("sim-share").onclick=()=>{g&&(C(g,"sim"),D(`hourly-floor-${g.deal.id}.png`))},document.getElementById("sim-dl").onclick=()=>{g&&(C(g,"sim"),D(`hourly-floor-${g.deal.id}.png`))},document.getElementById("tracker").addEventListener("click",e=>{let n=e.target.closest("[data-sim]"),a=e.target.closest("[data-share]");if(n){let t=x.find(s=>s.id===n.dataset.sim);t&&J(t)}if(a){let t=x.find(s=>s.id===a.dataset.share);t&&ct(t)}}),window.__DEALS=x,window.__openSim=J,window.__runSim=G,window.__drawShareCard=C,window.__drawChart=U,window.__lastSim=()=>g,window.__chartFrame=()=>R,window.__breakevenFn=B,window.__monthlyPmt=O}export{pt as bindDebt,ut as debtHtml};
