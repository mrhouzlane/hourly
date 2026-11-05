import{a as ue,b as pe}from"./chunk-WWFOSSOR.js";import{a as Ct}from"./chunk-RIMNLXHW.js";import{f as Mt}from"./chunk-QKNWSBBH.js";var rt=Mt(ue()),Rt=Mt(pe());function qt(){return`<div class="site">

  <header class="shero" id="hero">
    <div class="kick">Hourly \xB7 USDC on Solana \xB7 Devnet beta</div>
    <h1>Every GPU on earth.<br>Priced by the hour.</h1>
    <p class="sub">Floors and caps on GPU rent, onchain on Solana.</p>
    <div class="price-row" aria-label="Same H100, same hour, two public list prices">
      <div class="price">$1.99<small>Same H100</small></div>
      <div class="vs">or</div>
      <div class="price alt">$12.29<small>Same hour</small></div>
    </div>
    <p class="fine" style="margin:0">Illustration \xB7 public listings. GPU rent has no price anyone agrees on.</p>
    <div class="cta-row">
      <a class="pill" href="#trade" id="cta-try">Try with test money</a>
      <a class="pill ghost" href="#guess">Guess today's range</a>
    </div>
    <div class="film-wrap" id="film">
      <video id="l01" data-src="site/l01-launch.mp4" muted loop playsinline preload="none" poster="og.png" aria-label="Hourly launch film"></video>
      <button type="button" class="unmute" id="unmute" aria-pressed="false">Unmute</button>
    </div>
  </header>
  <section class="panel" id="problem">
    <div class="sh"><span><span class="dots"><b></b><b></b><b></b></span>The gap</span><span class="r">Why floors matter</span></div>
    <div class="sb">
      <h2>GPU owners borrow for 3 years. They rent out for 12 to 18 months.</h2>
      <p class="note">The gap is pure rent price risk. A floor on GPU rent pays out when that rent drops.</p>
      <div class="bars" aria-hidden="false">
        <div class="bar-row">
          <div class="lbl"><span>Loan</span><span>3 years</span></div>
          <div class="bar-track"><div class="fill loan">Loan term</div></div>
        </div>
        <div class="bar-row">
          <div class="lbl"><span>Rental contract</span><span>12 to 18 months</span></div>
          <div class="bar-track">
            <div class="fill rent">Rental</div>
            <div class="gapz">Rent price risk</div>
          </div>
        </div>
        <div class="axis3"><span>Year 1</span><span>Year 2</span><span>Year 3</span></div>
      </div>
      <p style="margin:18px 0 0"><a class="linkish" href="debt" data-debt>See the public GPU debt tracker</a></p>
    </div>
  </section>
  <section class="panel" id="how">
    <div class="sh"><span><span class="dots"><b></b><b></b><b></b></span>How it works</span><span class="r">Floors and caps</span></div>
    <div class="sb">
      <h2>The Hourly Index range. Floors and caps on that range.</h2>
      <p class="note">Many providers. Each counted once. Every price fresh. Drop the outliers. Keep the range where 80% sit.</p>
      <div class="range-demo">
        <span class="chip">H100</span>
        <div class="range-track" aria-label="Hourly Index range, Low Mid High. Numbers held for now.">
          <div class="z"></div><div class="z"></div><div class="z"></div>
          <div class="range-band"><span>Low</span><span>Mid</span><span>High</span></div>
        </div>
        <div class="range-labels"><span>Outliers dropped</span><span>80% band</span><span>Outliers dropped</span></div>
        <p class="fine" style="margin:10px 0 0">Range shown without today's numbers. Live prints sit on the Index page once the hold lifts.</p>
      </div>
      <div class="steps" style="margin-top:18px">
        <div class="step"><div class="n">01</div><h3>Index range</h3><p>One daily print per chip. Low, Mid and High from public rental list prices.</p></div>
        <div class="step"><div class="n">02</div><h3>Floor or Cap</h3><p>Pick a line on that range. A floor for owners. A cap for renters.</p></div>
        <div class="step"><div class="n">03</div><h3>Premium</h3><p>You pay the Premium up front. That is all you can lose.</p></div>
        <div class="step"><div class="n">04</div><h3>Pays out onchain</h3><p>If rent moves past your line, it pays out onchain on Solana. Anyone can check.</p></div>
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
    <div class="sh"><span><span class="dots"><b></b><b></b><b></b></span>Founding Tester board</span><span class="r">Public \xB7 real entries only</span></div>
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
  <section class="panel" id="seats">
    <div class="sh"><span><span class="dots"><b></b><b></b><b></b></span>Devnet beta</span><span class="r">GPU owners</span></div>
    <div class="sb">
      <h2>50 Founding GPU Owner seats.</h2>
      <p class="note">The site is open to everyone with test money. These 50 seats are a perk for GPU owners, not a gate.</p>
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
      <span style="opacity:.5">\xB7</span>
      <span>Test money</span>
    </div>
    <div class="socials">
      <a href="https://x.com/hourly_markets" target="_blank" rel="noopener">@hourly_markets</a>
      <a href="#docs">Docs</a>
    </div>
  </div>
  <canvas id="share-canvas" class="share-preview" width="1200" height="675"></canvas>
</div>`}var Pt="hourly_ref";function Ht(){try{let t=new URLSearchParams(location.search).get("ref");t&&/^[\w.-]{1,64}$/.test(t)&&localStorage.setItem(Pt,t)}catch{}}function he(){try{return localStorage.getItem(Pt)||""}catch{return""}}var N=t=>(Math.round(t*100)/100).toFixed(2),w=(t,e=document)=>e.querySelector(t);function Tt(t,e,s){let i=w("#share-canvas"),n=i.getContext("2d"),o=1200,l=675,r=n.createLinearGradient(0,0,0,l);r.addColorStop(0,"#2452ff"),r.addColorStop(1,"#1a3698"),n.fillStyle=r,n.fillRect(0,0,o,l),n.strokeStyle="rgba(255,255,255,0.08)",n.lineWidth=1;for(let u=0;u<o;u+=40)n.beginPath(),n.moveTo(u,0),n.lineTo(u,l),n.stroke();for(let u=0;u<l;u+=40)n.beginPath(),n.moveTo(0,u),n.lineTo(o,u),n.stroke();return n.fillStyle="#12226a",n.fillRect(60,60,o-120,l-120),n.strokeStyle="rgba(255,255,255,0.2)",n.strokeRect(60.5,60.5,o-121,l-121),n.fillStyle="#fff",((u,d,v)=>{let $=(g,P,S,b)=>n.fillRect(u+v*g/44,d+v*P/44,v*S/44,v*b/44);$(0,0,8,44),$(36,0,8,44),$(12,8,20,4),$(16,12,12,4),$(20,16,4,4),$(20,24,4,4),$(16,28,12,4),$(12,32,20,4)})(90,90,36),n.font="600 28px Geist, Inter, sans-serif",n.fillText("ourly",134,116),n.font='500 14px "Geist Mono", ui-monospace, monospace',n.fillStyle="rgba(255,255,255,0.7)",n.fillText("TEST MONEY",1040,112),n.fillStyle="#fff",n.font="700 42px Geist, Inter, sans-serif",n.fillText("My guess for today's H100 range",90,200),n.font='500 16px "Geist Mono", ui-monospace, monospace',n.fillStyle="rgba(255,255,255,0.55)",n.fillText("LOW",90,280),n.fillText("HIGH",420,280),n.fillStyle="#fff",n.font="700 96px Geist, Inter, sans-serif",n.fillText("$"+N(t),90,380),n.fillText("$"+N(e),420,380),n.font='500 18px "Geist Mono", ui-monospace, monospace',n.fillStyle="rgba(255,255,255,0.75)",n.fillText("Revealed at next print",90,470),s&&n.fillText(s,90,510),n.fillStyle="#fff",n.font="600 18px Geist, Inter, sans-serif",n.fillText("hourly.markets  \xB7  Floors and caps on GPU rent",90,580),i}function me(t,e){t.toBlob(s=>{if(!s)return;let i=document.createElement("a"),n=URL.createObjectURL(s);i.href=n,i.download=e,document.body.appendChild(i),i.click(),i.remove(),setTimeout(()=>URL.revokeObjectURL(n),2e3)},"image/png")}function fe(t,e){let s=`my guess for today's h100 range: $${N(t)} to $${N(e)}.
floors and caps on gpu rent, onchain on @solana. @hourly_markets`;return`https://x.com/intent/post?text=${encodeURIComponent(s)}&url=${encodeURIComponent("https://hourly.markets/?ref=guess")}`}function ve(t){return!t||!t.revealed||!t.rows||!t.rows.length?null:t.rows.map(e=>`<div class="brow"><span class="rank">${e.rank}</span><span style="color:#fff">${e.x?e.x.replace(/[<>&"]/g,""):"Anonymous"}</span><span>$${N(e.low)} to $${N(e.high)}</span></div>`).join("")}function Ft({api:t,go:e}){let s=w(".site");if(!s)return;s.querySelectorAll("a[data-debt]").forEach(S=>S.addEventListener("click",b=>{b.preventDefault(),e("debt")}));let i=he(),n=w("#l01"),o=w("#unmute");if(n){let S=()=>{n.src||(n.src=n.dataset.src,n.play().catch(()=>{}))};if("IntersectionObserver"in window){let b=new IntersectionObserver(C=>{C.some(T=>T.isIntersecting)&&(S(),b.disconnect())},{rootMargin:"200px"});b.observe(n)}else S();o.addEventListener("click",()=>{S(),n.muted=!n.muted,o.textContent=n.muted?"Unmute":"Mute",o.classList.toggle("on",!n.muted),o.setAttribute("aria-pressed",String(!n.muted)),n.muted||n.play().catch(()=>{})})}let l=w("#guess-form"),r=w("#g-err"),c=w("#g-share"),u=w("#g-xpost"),d=null;l.addEventListener("submit",async S=>{S.preventDefault(),r.classList.remove("open"),r.textContent="";let b=parseFloat(w("#g-low").value),C=parseFloat(w("#g-high").value),T=(w("#g-x").value||"").trim();if(T&&(T="@"+T.replace(/^@+/,"")),!(b>0)||!(C>b)||C>=100){r.textContent="Enter a Low and a High, with High above Low, under $100.",r.classList.add("open");return}if(T&&!/^@[A-Za-z0-9_]{1,15}$/.test(T)){r.textContent="X handles are letters, numbers and _ only, up to 15.",r.classList.add("open");return}let Z=w("#g-submit");Z.disabled=!0;try{let G=await t("guesses",{low:b,high:C,x:T,ref:i,chip:"H100"});d={low:b,high:C,x:T},w("#r-low").textContent=N(b),w("#r-high").textContent=N(C),w("#r-meta").textContent=`${T?T+" \xB7 ":""}Guess for ${G.day}. Revealed at next print.`,w("#g-result").classList.add("open"),c.disabled=!1,u.href=fe(b,C),u.style.pointerEvents="auto",u.style.opacity="1",Tt(b,C,T)}catch(G){r.textContent=G.message,r.classList.add("open")}Z.disabled=!1}),c.addEventListener("click",()=>{d&&me(Tt(d.low,d.high,d.x),"hourly-h100-guess.png")}),t("board").then(S=>{let b=ve(S);if(b){w("#board-empty").style.display="none";let C=s.querySelector(".board-rows");C.innerHTML=b,C.removeAttribute("aria-hidden")}}).catch(()=>{});let v=()=>t("seats/count").then(S=>{w("#seats-claimed").textContent=String(S.claimed)}).catch(()=>{});v();let $=w("#seat-form"),g=w("#s-err"),P=w("#s-ok");$.addEventListener("submit",async S=>{S.preventDefault(),g.classList.remove("open"),g.textContent="",P.classList.remove("open");let b={name:w("#s-name").value.trim(),company:w("#s-co").value.trim(),gpus:w("#s-gpus").value,email:w("#s-email").value.trim(),ref:i};if(!b.name||!b.company||!b.gpus){g.textContent="Name, company and GPUs owned are required.",g.classList.add("open");return}try{await t("seats",b),P.classList.add("open"),$.reset(),v()}catch(C){g.textContent=C.message,g.classList.add("open")}})}var p=(t,e=document)=>e.querySelector(t),y=(t,e=document)=>[...e.querySelectorAll(t)],m=t=>String(t).replace(/[&<>"']/g,e=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"})[e]),ct=t=>{let e="";for(let s of t)e+=String.fromCharCode(s);return btoa(e)},dt=t=>Uint8Array.from(atob(t),e=>e.charCodeAt(0)),h=(t,e=2)=>`${t<0?"-":""}$${Math.abs(t).toLocaleString("en-US",{minimumFractionDigits:e,maximumFractionDigits:e})}`,Gt=t=>`${Math.round(t*100)}%`;var ge=["Sun","Mon","Tue","Wed","Thu","Fri","Sat"],be=["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"],$e=["January","February","March","April","May","June","July","August","September","October","November","December"],M=t=>{let e=new Date(`${t}T00:00:00Z`);return`${ge[e.getUTCDay()]} ${be[e.getUTCMonth()]} ${e.getUTCDate()}`},Ot=t=>M(new Date(t*1e3).toISOString().slice(0,10));var O=t=>$e[new Date(`${t}T00:00:00Z`).getUTCMonth()];function we(t){let e=t-Date.now()/1e3;if(e<=0)return"closed";let s=Math.floor(e/86400),i=Math.floor(e%86400/3600),n=Math.floor(e%3600/60);return s>0?`${s}d ${i}h`:i>0?`${i}h ${n}m`:`${Math.max(1,n)}m`}var ye=()=>{try{return new URLSearchParams(location.search).get("ref")}catch{return null}},jt=()=>{let t=U.get("hourly.ref");return t&&a.wallet&&t!==a.wallet.address?t:void 0},U={get(t){try{return localStorage.getItem(t)}catch{return null}},set(t,e){try{localStorage.setItem(t,e)}catch{}},del(t){try{localStorage.removeItem(t)}catch{}}};async function k(t,e){let s=await fetch(`api/${t}`,e?{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(e)}:{}),i={};try{i=await s.json()}catch{}if(!s.ok){let n=new Error(i.error||`Request failed (${s.status})`);throw n.fields=i.fields,n}return i}var ke=["home","desk","index","debt","house","docs","access"],Wt=/\/debt\/?$/.test(location.pathname),Dt=location.pathname.replace(/debt\/?$/,""),et={trade:"desk",index:"index",house:"house",docs:"docs",home:"home",access:"access",portfolio:"desk"},A=(()=>{try{return new URLSearchParams(location.search)}catch{return new URLSearchParams}})(),Ut=["ticket","tap","lock"].includes(A.get("mode"))?A.get("mode"):null,a={status:null,index:[],meta:null,markets:[],vaults:[],activity:null,portfolio:null,wallet:null,view:et[location.hash.slice(1)]||(Wt?"debt":null)||(Ut||A.get("t")||A.get("cap")?"desk":"home"),mode:Ut||(A.get("cap")?"lock":"ticket"),t:{gpu:"H100_SXM",side:"lower",strike:null,seriesId:null,amount:10,quote:null,tapAmt:5,tapDate:null},hedge:{gpu:"H100_SXM",role:"own",win:null,qty:1},tapSide:"lower",pane:"chart",deskTab:"positions",range:30,ixChip:"H100_SXM",ixRange:"all",hchip:null},R=["H100_SXM","H200","B200","A100_SXM4"],xe=()=>R.map(t=>a.index.find(e=>e.code===t)).filter(Boolean),ft=t=>(a.index.find(e=>e.code===t)||{}).label||t,Se=t=>(a.index.find(e=>e.code===t)||{}).last,Bt=()=>1+(a.status&&a.status.feeBps||0)/1e4,Yt=()=>!(a.status&&a.status.cluster==="mainnet");var zt=Ct(),Ee=()=>a.status&&a.status.walletChain||"solana:localnet",_t=()=>!!(a.status&&a.status.walletChain);function Xt(){return zt.get().filter(t=>t.features["standard:connect"]&&t.features["solana:signTransaction"]&&(t.chains||[]).some(e=>e.startsWith("solana:")))}async function Le(){let t=a.status&&a.status.cluster;if(["devnet","mainnet"].includes(t))try{let{createSolanaClient:e}=await import("./connect-solana-HJWDMUAP.js");await e({dapp:{name:"Hourly",url:location.origin},api:{supportedNetworks:{[t]:t==="mainnet"?"https://api.mainnet-beta.solana.com":"https://api.devnet.solana.com"}},analytics:{enabled:!1}})}catch{}}function Vt(){let t=U.get("hourly.burner");t||(t=ct(rt.default.sign.keyPair().secretKey),U.set("hourly.burner",t));let e=dt(t);return{kind:"burner",name:"Burner",address:Rt.default.encode(e.slice(32)),signMessage:s=>rt.default.sign.detached(s,e),disconnect:async()=>{}}}async function Jt(t,e=!1){let{accounts:s}=await t.features["standard:connect"].connect(e?{silent:!0}:void 0),i=s&&s[0];if(!i)throw new Error("No account was shared.");return{kind:"standard",name:t.name,icon:t.icon,address:i.address,signTx:async n=>(await t.features["solana:signTransaction"].signTransaction({account:i,transaction:n,chain:Ee()}))[0].signedTransaction,disconnect:async()=>{try{await t.features["standard:disconnect"]?.disconnect()}catch{}}}}async function B(t){a.wallet=t,t?U.set("hourly.wallet",t.kind==="burner"?"__burner__":t.name):U.del("hourly.wallet"),z(),await H(),x()}async function Me(){let t=U.get("hourly.wallet");if(!t)return;if(t==="__burner__")return B(Vt());let e=async()=>{let s=Xt().find(i=>i.name===t);if(!s)return!1;try{await B(await Jt(s,!0))}catch{}return!0};await e()||zt.on("register",()=>{a.wallet||e()})}async function Y(t){let e=a.wallet;if(!e)throw new Error("Connect a wallet first.");document.body.classList.add("busy");try{return e.kind==="burner"?await k("submit",{id:t.id,signature:ct(e.signMessage(dt(t.message)))}):await k("submit",{id:t.id,tx:ct(await e.signTx(dt(t.tx)))})}finally{document.body.classList.remove("busy")}}function W(t,e){let s=document.createElement("div");s.className="modal",s.innerHTML=`<div class="dialog win" role="dialog" aria-modal="true"><div class="win-h"><span class="dots"><i></i><i></i><i></i></span>Hourly<span class="r">Test money</span></div><div class="in">${t}</div></div>`,document.body.appendChild(s);let i=()=>s.remove();s.addEventListener("click",o=>{(o.target===s||o.target.closest("[data-close]"))&&i()});let n=o=>{o.key==="Escape"&&(i(),document.removeEventListener("keydown",n))};return document.addEventListener("keydown",n),e&&e(s,i),i}function D(t,e,s,i){W(`<div class="icon">${t}</div><b>${m(e)}</b><p>${s}</p>${i?`<p><a href="${m(i)}" target="_blank" rel="noopener">View the transaction</a></p>`:""}<div class="actions"><button class="btn default" data-close>OK</button></div>`)}function Ce(t){let e=_t()?Xt():[],s=a.status&&a.status.cluster==="mainnet";W(`<div class="icon">\u25C6</div><b>Connect a wallet</b>
    <p class="small">The venue pays every network fee. You only sign.</p>
    <div class="wallets">
      ${e.map((i,n)=>`<button class="wallet" data-w="${n}"><img src="${m(i.icon)}" alt="">${m(i.name)}</button>`).join("")}
      ${s?"":'<button class="wallet" data-burner>Burner wallet (test only)</button>'}
    </div>
    <p class="small">${_t()?e.length?"Phantom, Solflare, Backpack and MetaMask work here.":"No Solana wallet found. Install Phantom, Solflare, Backpack or MetaMask.":"This preview runs on a private test chain. Use the burner wallet."}</p>
    <p class="status small" id="w-st"></p>
    <div class="actions"><button class="btn" data-close>Cancel</button></div>`,(i,n)=>{y("[data-w]",i).forEach(l=>l.addEventListener("click",async()=>{p("#w-st",i).textContent="Waiting for your wallet.";try{await B(await Jt(e[Number(l.dataset.w)])),n(),t&&t()}catch(r){p("#w-st",i).textContent=r.message||"Declined."}}));let o=p("[data-burner]",i);o&&o.addEventListener("click",async()=>{await B(Vt()),n(),await Zt(),t&&t()})})}function tt(t){if(a.wallet)return t();Ce(t)}async function Zt(){if(!(!a.wallet||a.wallet.kind!=="burner"||a.status&&a.status.cluster==="mainnet"))try{if(a.portfolio&&a.portfolio.usdc>0)return;await k("faucet",{owner:a.wallet.address}),await H(),x()}catch{}}async function vt(){try{let t=await k("faucet",{owner:a.wallet.address});D("\u2713","Added test USDC.",`${h(t.amount,0)} is in your wallet.`,t.url)}catch(t){D("!","Faucet",m(t.message))}await H(),x()}var Te='<span class="coin">USDC on Solana devnet (test)</span>',st=t=>{a.view=t;try{history.replaceState(null,"",t==="debt"?`${Dt}debt`:`${Dt}#${Object.keys(et).find(e=>et[e]===t)||t}`)}catch{}z(),x(),window.scrollTo(0,0),t==="desk"&&a.wallet&&H().then(()=>{a.view==="desk"&&!a.t.quote&&x()})},Kt=()=>setTimeout(()=>H().then(()=>{a.view==="desk"&&!a.t.quote&&x()}),4e3);function z(){let t=[["desk","Trade"],["index","Index"],["debt","Debt"],["house","House"],["docs","Docs"]],e=a.view!=="home"&&a.view!=="access";p("#menubar").innerHTML=`
    <button data-view="home" class="brand" aria-label="Hourly"><img src="mark.svg" alt="H">ourly</button>
    <div class="mn-nav">${t.map(([o,l])=>`<button data-view="${o}" class="${a.view===o?"on":""}">${l}</button>`).join("")}</div>
    <span class="spacer"></span>
    <span class="tag">${Yt()?"Test money":"Mainnet"}</span>
    ${a.wallet?`<button id="wallet-btn" title="${m(a.wallet.address)}">${a.wallet.address.slice(0,4)}\u2026${a.wallet.address.slice(-4)}</button>`:""}
    ${e?'<button class="ra" data-ra>Request access</button>':""}`,y("#menubar [data-view]").forEach(o=>o.addEventListener("click",()=>st(o.dataset.view)));let s=p("#wallet-btn");s&&s.addEventListener("click",qe);let i=p("#menubar [data-ra]");i&&i.addEventListener("click",()=>st("access"));let n=p("#botbar");n&&(n.textContent=a.view==="index"?"List prices, unsigned, not yet used to pay out any contract.":"Test money. Not audited.")}function qe(){W(`<div class="icon">\u25C6</div><b>${m(a.wallet.name)}</b><p class="mono">${m(a.wallet.address)}</p>
    <div class="actions"><button class="btn default" id="dc">Disconnect</button></div>`,(t,e)=>{p("#dc",t).addEventListener("click",async()=>{await a.wallet.disconnect(),await B(null),e()})})}var it=(t,e,s="",i="")=>`<section class="win ${i}"><div class="win-h"><span class="dots"><i></i><i></i><i></i></span>${t}<span class="r">${s}</span></div>${e}</section>`;function Pe(){return qt()}function He(){Ft({api:k,go:st})}function Fe(){return'<div class="debtpg"><p class="fine">Loading.</p></div>'}function De(){import("./debt-U3AFZNSI.js").then(t=>{a.view==="debt"&&(p("#desk").innerHTML=t.debtHtml(),t.bindDebt())})}var Ue={role:["GPU owner","Data center","Reseller","Renter"],chips:["H100","H200","B200","A100"],gpuCount:["Under 64","64 to 511","512 to 4k","4k plus"]},F={role:"",chips:[],gpuCount:""};function _e(){let t=(e,s,i)=>`<div class="fg" data-g="${e}"><span>${s}</span><div class="ch c4">${Ue[e].map(n=>`<button type="button" data-o="${m(n)}" class="${(i?F[e].includes(n):F[e]===n)?"on":""}">${m(n)}</button>`).join("")}</div></div>`;return`<div class="acc-top"><span class="tag">Test money</span></div>
  <form class="acc" id="access" novalidate>${it("Request access",`<div class="body">
    <div class="f2"><label class="fl"><span>Company</span><input name="company" autocomplete="organization"></label><label class="fl"><span>Work email</span><input name="email" type="email" autocomplete="email"></label></div>
    ${t("role","You are")}${t("chips","Chips",!0)}${t("gpuCount","GPU count")}
    <div class="f2"><label class="fl"><span>Contract ends<i>optional</i></span><input name="contractEnds" type="date"></label><label class="fl"><span>GPUs it covers<i>optional</i></span><input name="gpusCovered" type="number" min="0" inputmode="numeric"></label></div>
    <button class="cta white" type="submit">Request access</button>
    <p class="msg" id="acc-msg"></p></div>`,"GPU owners first")}</form>`}function Ie(){let t=p("#access");t&&(y("[data-g]",t).forEach(e=>y("[data-o]",e).forEach(s=>s.addEventListener("click",()=>{let i=e.dataset.g,n=s.dataset.o;i==="chips"?F.chips=F.chips.includes(n)?F.chips.filter(o=>o!==n):[...F.chips,n]:F[i]=F[i]===n?"":n,y("[data-o]",e).forEach(o=>o.classList.toggle("on",i==="chips"?F.chips.includes(o.dataset.o):F[i]===o.dataset.o)),e.classList.remove("bad")}))),t.addEventListener("submit",async e=>{e.preventDefault();let s=new FormData(t),i=p("#acc-msg");y(".bad",t).forEach(n=>n.classList.remove("bad"));try{await k("access",{...F,company:s.get("company"),email:s.get("email"),contractEnds:s.get("contractEnds"),gpusCovered:s.get("gpusCovered")}),i.className="msg ok",i.textContent="Thank you. We will be in touch.",t.querySelector("button[type=submit]").disabled=!0}catch(n){i.className="msg err",i.textContent=n.message;let o={company:'[name="company"]',email:'[name="email"]',role:'[data-g="role"]',chips:'[data-g="chips"]',gpuCount:'[data-g="gpuCount"]'};(n.fields||[]).forEach(l=>{let r=o[l]&&t.querySelector(o[l]);r&&r.classList.add("bad")})}}))}var Qt={lower:"Floor",higher:"Cap"},V=()=>a.markets.filter(t=>t.door==="predict"&&t.status==="open"&&t.model),te=(t,e)=>e==="higher"?t.model.ask:Math.max(.01,1-t.model.bid);function j(t){return[...new Set(V().filter(e=>e.underlying===t).map(e=>e.strike))].sort((e,s)=>e-s)}function ut(t,e){return V().filter(s=>s.underlying===t&&s.strike===e).sort((s,i)=>s.expiry-i.expiry)}var ee=t=>t==="higher"?Bt():1,ot=(t,e,s)=>Math.max(0,Math.floor(s/(te(t,e)*ee(e)))),gt=(t,e,s)=>s*te(t,e)*ee(e);function se(t){let e=a.markets.filter(s=>s.door==="hedge"&&s.status==="open"&&s.underlying===t&&s.model);return[...new Set(e.map(s=>s.windowStart))].sort().filter(s=>e.some(i=>i.kind==="put"&&i.windowStart===s)&&e.some(i=>i.kind==="call"&&i.windowStart===s))}function Ne(t,e){let s=se(t);if(!s.length)return null;let i=s.includes(e)?e:s[0],n=a.markets.filter(r=>r.door==="hedge"&&r.status==="open"&&r.underlying===t&&r.model&&r.windowStart===i),o=n.find(r=>r.kind==="put"),l=n.find(r=>r.kind==="call");return o&&l?{put:o,call:l}:null}function Ae(){let t=A.get("t");if(!t||a.dl||!a.markets.length)return;let[e,s,i,n,o]=t.split("~");if(a.dl=!0,!e||!R.includes(e))return;let l=V().find(r=>r.underlying===e&&r.strike===Number(i)&&r.windowEnd===n);a.t.gpu=e,a.t.side=s==="higher"?"higher":"lower",a.t.amount=Math.min(1e3,Math.max(1,Number(o)||10)),l&&(a.t.strike=l.strike,a.t.seriesId=l.id)}function Re(){let t=A.get("cap");if(!t||a.dlc||!a.markets.length)return;a.dlc=!0;let[e,s,i]=t.split("~");R.includes(e)&&(a.hedge.gpu=e,a.hedge.role="rent",s&&(a.hedge.win=s),a.hedge.qty=Math.min(50,Math.max(1,Math.floor(Number(i))||1)))}function ae(){Ae(),Re();let t=a.t;j(t.gpu).length||(t.gpu=R.find(n=>j(n).length)||t.gpu);let e=j(t.gpu),s=n=>{let o=ut(t.gpu,n)[0];return o?Math.abs(o.model.fair-.5):1};e.includes(t.strike)||(t.strike=e.length?e.reduce((n,o)=>s(o)<s(n)?o:n):null,t.seriesId=null);let i=t.strike!==null?ut(t.gpu,t.strike):[];i.some(n=>n.id===t.seriesId)||(t.seriesId=i[0]?i[0].id:null,t.quote=null)}var J=()=>a.markets.find(t=>t.id===a.t.seriesId)||null;function Ge(){ae();let t=a.mode==="lock"?a.hedge.gpu:a.t.gpu;return`<div class="pg trade"><h1>Trade the ${m(ft(t))} hour.</h1><div class="tgrid">${je()}${ne()}</div>${Ke()}</div>`}var E={gpus:"64",ends:"2026-12-15",rate:"",pick:"mid"},Oe=[["low","Low"],["mid","Mid, the index"],["high","High"]];function pt(){if(E.pick==="custom")return Number(E.rate);let t=lt();return t&&t.range?Math.round(t.range[E.pick]*100)/100:0}var bt=730;function lt(){let t=I.H100;return t||re("H100"),[...t&&t.days||[]].reverse().find(s=>s.value!==null)||null}function je(){return`<section class="win exp" id="exp"><div class="win-h"><span class="dots"><i></i><i></i><i></i></span>My exposure<span class="r"><span class="tag">Test money</span></span></div><div class="body">
    <div class="f3"><label class="fl"><span>GPUs</span><input id="x-gpus" inputmode="numeric" value="${m(E.gpus)}"></label><div class="fl"><span>Chip</span><button class="chipb on" type="button">H100</button></div></div>
    <label class="fl"><span>Contract ends</span><input id="x-ends" type="date" value="${m(E.ends)}"></label>
    <div class="fl"><span>Your rate today</span><div id="x-pick">${$t()}</div></div>
    <div id="x-out">${wt()}</div></div></section>`}function $t(){let t=lt(),e=([n,o])=>`<button type="button" data-rp="${n}" class="${E.pick===n?"on":""}"><span>${o}</span><b>${t&&t.range?h(t.range[n]):"--"}</b></button>`,s=t&&t.computed_at?new Date(t.computed_at):null,i=s?`${s.getUTCDate()} ${s.toLocaleString("en-US",{month:"short",timeZone:"UTC"})} ${String(s.getUTCHours()).padStart(2,"0")}:${String(s.getUTCMinutes()).padStart(2,"0")} UTC`:"";return`<div class="rp">${Oe.map(e).join("")}<button type="button" data-rp="custom" class="cust ${E.pick==="custom"?"on":""}"><span>Custom</span><b>$</b></button></div>
    ${E.pick==="custom"?`<input id="x-rate" inputmode="decimal" placeholder="$ per GPU hour" value="${m(E.rate)}">`:""}
    <p class="xi">${t?`Hourly Index ${h(t.value)}, print at ${i}, ${t.post?`<a href="${m(t.post.url)}" target="_blank" rel="noopener">onchain print</a>`:"not yet posted"}.`:"Loading the Hourly Index."}</p>`}function wt(){let t=Math.floor(Number(E.gpus)),e=pt(),s=lt(),i=t>0&&e>0,n=i?t*e*bt:0;return`<div class="xr"><div class="xh"><i>Rent at risk this month</i><b>${i?h(n,0):"--"}</b></div>
    <div class="xl"><span>If rent falls 10%</span><b>${i?`${h(n*.1,0)} lost`:"--"}</b></div>
    <div class="xl"><span>If rent falls 20%</span><b>${i?`${h(n*.2,0)} lost`:"--"}</b></div></div>
    <div class="xbtn"><button class="cta" id="x-floor" ${i&&s?"":"disabled"}>Floor these hours</button><a href="#" id="x-hand">Request a quote by hand</a></div>
    <p class="st" id="x-st"></p>`}function ht(){let t=p("#x-out");t&&(t.innerHTML=wt(),kt()),a.hedge.linked&&a.mode==="lock"&&xt(!1)}function yt(){y("[data-rp]").forEach(e=>e.addEventListener("click",()=>{if(E.pick=e.dataset.rp,p("#x-pick").innerHTML=$t(),yt(),E.pick==="custom"){let s=p("#x-rate");s&&s.focus()}ht()}));let t=p("#x-rate");t&&t.addEventListener("input",()=>{E.rate=t.value,ht()})}function We(){let t=(e,s)=>{let i=p(e);i&&i.addEventListener("input",()=>{E[s]=i.value,ht()})};t("#x-gpus","gpus"),t("#x-ends","ends"),yt(),kt()}function kt(){let t=p("#x-floor");t&&t.addEventListener("click",()=>xt(!0));let e=p("#x-hand");e&&e.addEventListener("click",s=>{s.preventDefault(),ze()})}var K={};function Be(){let t=lt(),e=Math.floor(Number(E.gpus)),s=a.markets.filter(c=>c.door==="hedge"&&c.status==="open"&&c.underlying==="H100_SXM"&&c.kind==="put"&&c.model);if(!t||!s.length||!(e>0))return null;let i=E.ends?Date.parse(`${E.ends}T00:00:00Z`):Date.now(),n=c=>{let u=Date.parse(`${c.windowStart}T00:00:00Z`),d=Date.parse(`${c.windowEnd}T23:59:59Z`);return i>=u&&i<=d?0:Math.min(Math.abs(i-u),Math.abs(i-d))},o=s.slice().sort((c,u)=>n(c)-n(u))[0].windowStart;if(!t.range)return null;let l=Math.round(t.range.mid*.9*100)/100;return{m:s.filter(c=>c.windowStart===o).reduce((c,u)=>Math.abs(u.strike-l)<Math.abs(c.strike-l)?u:c),win:o,target:l,n:e}}function Ye(t){return t?Math.min(t.maxPerTrade,t.vault&&t.vault.contracts>0?t.vault.contracts:t.desk):50}async function xt(t){let e=p("#x-st"),s=Be();if(!s){t&&e&&(e.textContent="No month is open to floor right now.");return}let{m:i,win:n,target:o,n:l}=s,r=()=>{let u=Math.max(1,Math.min(l,Ye(K[i.id])));Object.assign(a.hedge,{gpu:"H100_SXM",role:"own",win:n,sid:i.id,qty:u,target:o,asked:l,linked:!0,edited:!1}),a.mode="lock",a.t.quote=null,q()};if(r(),!(i.id in K)){try{K[i.id]=await k(`capacity?series=${i.id}`)}catch{K[i.id]=null}a.hedge.linked&&a.hedge.sid===i.id&&r()}if(e&&(e.textContent=""),!t)return;let c=p("#ticket");c&&(c.classList.remove("flash"),c.offsetWidth,c.classList.add("flash"),innerWidth<760&&c.scrollIntoView({behavior:"smooth"}))}function Q(){a.hedge.linked&&(a.hedge.linked=!1,a.hedge.edited=!0),a.hedge.target=null,a.hedge.asked=null}var It="hourly.handquotes";function ze(){W(`<div class="icon">\u270E</div><b>Request a quote by hand</b><p class="small">Saved on this device only. Nothing is sent.</p>
    <div class="hq"><label>Owner<input id="hq-owner" autocomplete="organization"></label><label>Open hours<input id="hq-hours" inputmode="numeric" value="${Math.floor(Number(E.gpus))>0?Math.floor(Number(E.gpus))*bt:""}"></label><label>Window<input id="hq-window" placeholder="Dec 1 to Dec 31"></label><label>Rate, $ per GPU hour<input id="hq-rate" inputmode="decimal" value="${pt()>0?pt().toFixed(2):""}"></label></div>
    <div class="actions"><button class="btn" data-close>Cancel</button><button class="btn default" id="hq-save">Save</button></div>`,(t,e)=>p("#hq-save",t).addEventListener("click",()=>{let s=[];try{s=JSON.parse(U.get(It)||"[]")}catch{s=[]}s.push({at:new Date().toISOString(),owner:p("#hq-owner",t).value,hours:p("#hq-hours",t).value,window:p("#hq-window",t).value,rate:p("#hq-rate",t).value}),U.set(It,JSON.stringify(s.slice(-50))),e(),D("\u2713","Saved.",`Quote request saved on this device (${s.length} saved).`)}))}function X(t,e,s){return`<div class="lab">Chip</div><div>${t.map(i=>`<button class="chipb ${i===e?"on":""}" ${s}="${i}">${m(ft(i))}</button>`).join("")}</div>`}var at=(t,e="data-side")=>`<div class="side"><button ${e}="lower" class="${t==="lower"?"on":""}">Floor</button><button ${e}="higher" class="${t==="higher"?"on":""}">Cap</button></div>`;function ne(){let t=`<div class="modes">${[["ticket","Ticket"],["tap","One tap"],["lock","Lock a month"]].map(([s,i])=>`<button data-mode="${s}" class="${a.mode===s?"on":""}">${i}</button>`).join("")}</div>`,e=a.mode==="lock"?Ze():a.t.quote?Je():a.mode==="tap"?Ve():Xe();return`<section class="win tk" id="ticket"><div class="win-h"><span class="dots"><i></i><i></i><i></i></span>Ticket<span class="r"><span class="tag">Test money</span></span></div><div class="body">${t}${e}</div></section>`}function Xe(){let t=a.t,e=j(t.gpu),s=t.strike!==null?ut(t.gpu,t.strike):[],i=J(),n=R.filter(c=>j(c).length),o=`${X(n.length?n:[t.gpu],t.gpu,"data-gpu")}${at(t.side)}
    <div class="lab">Strike</div><div class="ch c3 strk">${e.map(c=>`<button data-k="${c}" class="${c===t.strike?"on":""}">$${c.toFixed(2)}</button>`).join("")}</div>
    <div class="lab">Date</div><div class="ch c2 dates">${s.map(c=>`<button data-d="${c.id}" class="${c.id===t.seriesId?"on":""}">${M(c.windowEnd)}</button>`).join("")}</div>`;if(!i)return`${o}<p class="st">No open market here. Pick another price.</p>`;let l=ot(i,t.side,t.amount),r=gt(i,t.side,l);return`${o}
    <div class="lab">Amount</div>
    <div class="amt"><label>$<input id="amt" inputmode="decimal" value="${t.amount}" aria-label="Amount in USDC"></label>${[5,20,50,100].map(c=>`<button data-amt="${c}" class="${t.amount===c?"on":""}">$${c}</button>`).join("")}</div>
    <div class="pp"><div><i>Premium</i><b id="prem">${h(r)}</b></div><div><i>Pays up to</i><b id="payu">${h(l)}</b></div></div>
    <button class="cta" id="t-go" ${l>0?"":"disabled"}>${t.quoting?"Getting a firm price":"Get a firm price"}</button>
    <p class="st" id="t-st">${t.qerr?m(t.qerr):""}</p>`}function Ve(){let t=a.t,e=V().filter(c=>c.underlying===t.gpu),s=R.filter(c=>j(c).length),i=[...new Set(e.map(c=>c.windowEnd))].sort(),n=X(s.length?s:[t.gpu],t.gpu,"data-gpu");if(!i.length)return`${n}<p class="st">No open market here yet.</p>`;i.includes(t.tapDate)||(t.tapDate=i[0]);let o=Se(t.gpu)||0,l=e.filter(c=>c.windowEnd===t.tapDate).sort((c,u)=>Math.abs(c.strike-o)-Math.abs(u.strike-o)).slice(0,3).sort((c,u)=>c.strike-u.strike),r=(c,u)=>{let d=ot(c,u,t.tapAmt);return`<button data-tap="${c.id}" data-tside="${u}" ${d>0?"":"disabled"}><span>${Qt[u]}</span><b>Premium ${h(gt(c,u,d))}</b><i>Pays up to ${h(d)}</i></button>`};return`${n}
    <div class="lab">Date</div><div class="ch c2 dates">${i.map(c=>`<button data-tdate="${c}" class="${c===t.tapDate?"on":""}">${M(c)}</button>`).join("")}</div>
    <div class="lab">Amount</div><div class="amt" style="grid-template-columns:repeat(3,auto);justify-content:start">${[5,10,25].map(c=>`<button data-tamt="${c}" class="${t.tapAmt===c?"on":""}">$${c}</button>`).join("")}</div>
    <div class="taps">${l.map(c=>`<div class="row"><div>Strike <b>$${c.strike.toFixed(2)}</b> \xB7 ${M(c.windowEnd)}</div><div class="bs">${r(c,"lower")}${r(c,"higher")}</div></div>`).join("")}</div>
    <p class="st" id="t-st">${t.qerr?m(t.qerr):""}</p>`}function Je(){let t=a.t,e=t.quote,s=J(),n=t.side==="higher"?e.pay+e.fee:e.lock-e.receive,o=Math.max(0,40-Math.round((Date.now()-t.quotedAt)/1e3));return`${X([t.gpu],t.gpu,"data-x")}${at(t.side,"data-x")}
    <div class="lab">Strike</div><span class="solo">$${s?s.strike.toFixed(2):""} /hr</span>
    <div class="lab">Date</div><span class="solo">${s?M(s.windowEnd):""}</span>
    <div class="pp"><div><i>Premium</i><b>${h(n)}</b></div><div><i>Pays up to</i><b>${h(e.legs[0].qty)}</b></div></div>
    <p class="firm">Firm price, held <b id="qtm">${o}s</b>. ${e.legs[0].qty} contracts${e.fee?`, fee ${h(e.fee)}`:""}, filled by ${e.legs[0].via==="vault"?"the weekly vault":"the venue desk"}.</p>
    <button class="cta white" id="t-sign">Sign with wallet</button><button class="cta line" id="t-back">Change</button>
    <p class="st" id="t-st"></p>`}function ie(){let t=a.hedge,e=R.filter(l=>Ne(l));if(!e.length)return null;e.includes(t.gpu)||(t.gpu=e[0]);let s=se(t.gpu);s.includes(t.win)||(t.win=s[0]);let i=t.role==="own"?"put":"call",n=a.markets.filter(l=>l.door==="hedge"&&l.status==="open"&&l.underlying===t.gpu&&l.model&&l.windowStart===t.win&&l.kind===i).sort((l,r)=>l.strike-r.strike),o=n.find(l=>l.id===t.sid);return o||(o=n[i==="put"?n.length-1:0],t.sid=o&&o.id),{codes:e,list:n,m:o}}function Ze(){let t=a.hedge,e=t.role==="own"?"lower":"higher",s=ie();if(!s||!s.m)return`${X([t.gpu],t.gpu,"data-hg")}${at(e,"data-hrole")}<p class="st">No month is open to lock right now.</p>`;let{codes:i,list:n,m:o}=s,l=t.role==="own",r=t.qty||1,c=o.model.ask*Bt(),u=c*r,d=l?o.strike-c/o.units:null,v=l&&t.target&&Math.abs(t.target-o.strike)>.001?`<p class="xi">Target $${t.target.toFixed(2)}, nearest listed strike $${o.strike.toFixed(2)}.</p>`:"",$=t.asked&&t.asked>r?`<p class="xi">${r} of ${t.asked} GPUs, capped by what the House can back per trade.</p>`:"";return`${X(i,t.gpu,"data-hg")}${at(e,"data-hrole")}
    <div class="lab">Strike</div><div class="ch c4 strk">${n.map(g=>`<button data-hs="${g.id}" class="${g.id===o.id?"on":""}">$${g.strike.toFixed(2)}</button>`).join("")}</div>${v}
    <div class="lab">Date</div><span class="solo">${M(o.windowStart)} to ${M(o.windowEnd)}</span>
    <div class="lab">Amount</div><span class="solo">${r} GPU${r>1?"s":""}, ${(r*o.units).toLocaleString("en-US")} hours</span>${$}
    ${t.linked?`<p class="lnk">Covering ${r} GPU${r>1?"s":""} \xD7 ${bt} h from My exposure</p>`:t.edited?'<p class="lnk">Edited by hand <button class="mini" id="relink">Relink</button></p>':""}
    <div class="pp"><div><i>Premium</i><b>${h(u)}</b></div><div><i>Pays up to</i><b>${h(o.maxPayoff*r,0)}</b></div></div>
    ${l?`<p class="xe">Earns at least <b>${h(d)} per GPU hour</b>: strike minus Premium per hour.</p>`:""}
    <button class="cta" id="hedge-go">Lock ${O(o.windowStart)}</button>
    <p class="st" id="h-st"></p>`}function Ke(){if(!a.wallet)return"";let t=a.portfolio,e=`<div class="bal"><span>Balance <b>${t?h(t.usdc,0):"--"}</b></span><span>${t?t.rows.filter(i=>i.status==="open"&&(i.long||i.short)).length:"--"} open</span><span class="spacer"></span>${Yt()?'<button class="mini" id="pf-faucet">Add test USDC</button>':""}</div>`,s;if(!t)s='<p class="empty">Loading.</p>';else{let i=t.rows.map(o=>{let l=o.door==="predict",r=l?`${o.gpu} ${o.long&&o.short?"floor and cap":o.short?"floor":"cap"} $${o.strike.toFixed(2)}`:`${o.gpu} ${O(o.windowStart)} ${o.kind==="put"?"floor":"cap"} $${o.strike.toFixed(2)}`,c=l?M(o.windowEnd):O(o.windowStart),u=o.status==="settled"?`paid out at $${o.settled.price.toFixed(4)}`:h((o.markPerContract??0)*(o.long-o.short)),d=l?`Pays out on the third party index print for ${M(o.windowEnd)}, read by Switchboard. Not the Hourly Index yet.`:`Pays out on the third party index average for ${O(o.windowStart)}, read by Switchboard. Not the Hourly Index yet.`;return`<tr><td>${m(r)}<div class="muted">${c} \xB7 ${o.status==="open"?`closes in ${we(o.tradingEnd)}`:o.status==="settled"?"paid out":m(o.status)}</div><div class="muted rule">${d}</div></td><td>${o.long?`long ${o.long}`:""} ${o.short?`short ${o.short}`:""}</td><td class="r">${u}</td><td class="r">${Qe(o)}</td></tr>`}).join(""),n=(t.vaults||[]).map(o=>`<tr><td>Weekly vault, epoch ${o.epoch}<div class="muted">${m(o.phase)}</div></td><td>${Gt(o.share)}</td><td class="r">${h(o.cashValue)}</td><td class="r">${o.phase==="withdrawable"?`<button class="mini" data-vw="${o.epoch}">Withdraw</button>`:""}</td></tr>`).join("");s=i||n?`<table class="tb"><tr><th>Position</th><th>Side</th><th class="r">Value</th><th></th></tr>${i}${n}</table>`:'<p class="empty">Nothing yet. Your first ticket shows up here.</p>'}return it("Positions",e+s,"","pos")}function Qe(t){let e="";if(t.status==="settled")t.long>0&&(e+=`<button class="mini" data-act="redeem" data-s="${t.id}">Redeem ${h(t.redeemable)}</button> `),t.short>0&&(e+=`<button class="mini" data-act="reclaim" data-s="${t.id}">Reclaim ${h(t.reclaimable)}</button>`);else{let s=Math.min(t.long,t.short);s>0&&(e=`<button class="mini" data-act="close" data-s="${t.id}" data-q="${s}">Close ${s}</button>`)}return e}function q(){let t=p("#ticket");t&&(t.outerHTML=ne(),oe())}function oe(){let t=()=>{a.t.quote=null,a.t.qerr=null};y("[data-mode]").forEach(r=>r.addEventListener("click",()=>{r.dataset.mode!==a.mode&&Q(),a.mode=r.dataset.mode,t(),x()})),y("#ticket [data-gpu]").forEach(r=>r.addEventListener("click",()=>{a.t.gpu=r.dataset.gpu,a.t.strike=null,a.t.seriesId=null,t(),x()})),y("[data-side]").forEach(r=>r.addEventListener("click",()=>{a.t.side=r.dataset.side,t(),q()})),y("[data-k]").forEach(r=>r.addEventListener("click",()=>{a.t.strike=Number(r.dataset.k),a.t.seriesId=null,t(),ae(),q()})),y("[data-d]").forEach(r=>r.addEventListener("click",()=>{a.t.seriesId=r.dataset.d,t(),q()}));let e=p("#amt");if(e){let r=()=>{a.t.amount=Math.max(0,Number(e.value)||0);let c=J();if(!c)return;let u=ot(c,a.t.side,a.t.amount);p("#prem").textContent=h(gt(c,a.t.side,u)),p("#payu").textContent=h(u);let d=p("#t-go");d&&(d.disabled=u<=0),y("[data-amt]").forEach(v=>v.classList.toggle("on",Number(v.dataset.amt)===a.t.amount))};e.addEventListener("input",r),e.addEventListener("keydown",c=>{if(c.key==="Enter"){c.preventDefault();let u=p("#t-go");u&&!u.disabled&&u.click()}}),y("[data-amt]").forEach(c=>c.addEventListener("click",()=>{e.value=c.dataset.amt,r()}))}let s=p("#t-go");s&&s.addEventListener("click",()=>tt(nt)),y("[data-tdate]").forEach(r=>r.addEventListener("click",()=>{a.t.tapDate=r.dataset.tdate,t(),q()})),y("[data-tamt]").forEach(r=>r.addEventListener("click",()=>{a.t.tapAmt=Number(r.dataset.tamt),t(),q()})),y("[data-tap]").forEach(r=>r.addEventListener("click",()=>{let c=a.markets.find(u=>u.id===r.dataset.tap);c&&(a.t.side=r.dataset.tside,a.t.strike=c.strike,a.t.seriesId=c.id,a.t.amount=a.t.tapAmt,tt(nt))}));let i=p("#t-sign");i&&i.addEventListener("click",ts);let n=p("#t-back");n&&n.addEventListener("click",()=>{a.t.quote=null,q()}),y("[data-hrole]").forEach(r=>r.addEventListener("click",()=>{a.hedge.role=r.dataset.hrole==="lower"?"own":"rent",a.hedge.sid=null,Q(),q()})),y("[data-hs]").forEach(r=>r.addEventListener("click",()=>{a.hedge.sid=r.dataset.hs,Q(),q()})),y("[data-hg]").forEach(r=>r.addEventListener("click",()=>{a.hedge.gpu=r.dataset.hg,a.hedge.qty=1,Q(),x()}));let o=p("#relink");o&&o.addEventListener("click",()=>xt(!0));let l=p("#hedge-go");l&&l.addEventListener("click",()=>tt(le))}async function nt(){let t=a.t,e=J();if(!e||!a.wallet)return;let s=ot(e,t.side,t.amount);if(!(s<=0)){t.quoting=!0,t.qerr=null,q();try{t.quote=await k("quote",{owner:a.wallet.address,ref:jt(),legs:[{series:e.id,side:t.side==="higher"?"buy":"sell",qty:s}]}),t.quotedAt=Date.now()}catch(i){t.quote=null,t.qerr=i.message}if(t.quoting=!1,q(),t.qerr&&/faucet/i.test(t.qerr)){let i=p("#t-st");i&&(i.innerHTML=`${m(t.qerr)} <button id="fz">Add test USDC</button>`,p("#fz").addEventListener("click",async()=>{await vt(),nt()}))}}}async function ts(){let t=a.t;if(!t.quote)return;if(Date.now()-t.quotedAt>4e4)return t.quote=null,nt();let e=p("#t-sign");e.disabled=!0,e.textContent=a.wallet.kind==="burner"?"Signing":"Approve in your wallet";try{let s=await Y(t.quote),i=J(),n=t.quote,o=t.side==="higher"?n.pay+n.fee:n.lock-n.receive;D("\u2713","Bought.",`${m(ft(t.gpu))} ${Qt[t.side].toLowerCase()} at $${i.strike.toFixed(2)} on ${M(i.windowEnd)}. Premium ${h(o)}, pays up to ${h(n.legs[0].qty)}. It's in your positions.`,s.url),t.quote=null,await Promise.all([St(),H(),de()]),Kt(),x()}catch(s){t.qerr=s.message||"The wallet declined.",t.quote=null,q()}}async function le(){let t=ie();if(!t||!t.m)return;let e=t.m,s=a.hedge.qty||1,i=a.hedge.role==="own",n=p("#h-st"),o=p("#hedge-go");try{n.textContent="Getting a firm price.";let l=await k("quote",{owner:a.wallet.address,ref:jt(),legs:[{series:e.id,side:"buy",qty:s}]});W(`<div class="icon">?</div><b>Confirm</b>
      <div class="lines">
        <div><span>${i?"Floor":"Cap"} ${m(e.gpu)} ${O(e.windowStart)} at $${e.strike.toFixed(2)}, ${s} GPU${s>1?"s":""}</span></div>
        ${l.fee?`<div><span>Fee</span><span>${h(l.fee)}</span></div>`:""}
        <div class="big2"><span>Premium</span><span>${h(l.pay+(l.fee||0)-(l.receive||0))}</span></div>
        <div><span>Pays up to</span><span>${h(e.maxPayoff*s,0)}</span></div>
      </div>
      <div class="actions"><button class="btn" data-close>Cancel</button><button class="btn default" id="ok">Sign with wallet</button></div>`,(r,c)=>p("#ok",r).addEventListener("click",async()=>{c();try{let u=await Y(l);D("\u2713","Bought.",`${i?"Floor":"Cap"} on ${s} ${m(e.gpu)} GPU${s>1?"s":""} for ${O(e.windowStart)} at $${e.strike.toFixed(2)}. Premium ${h(l.pay+(l.fee||0))}, pays up to ${h(e.maxPayoff*s,0)}. It's in your positions.`,u.url),await Promise.all([St(),H(),de()]),Kt(),x()}catch(u){D("!","Not sent.",m(u.message))}})),n.textContent=""}catch(l){if(/faucet/i.test(l.message)&&!o._funded&&a.wallet.kind==="burner")return o._funded=!0,await Zt(),le();n.textContent=l.message}}setInterval(()=>{if(a.view!=="desk"||!a.t.quote)return;let t=40-Math.round((Date.now()-a.t.quotedAt)/1e3);if(t<=0){a.t.quote=null,a.t.qerr="That price expired. Get a fresh one.",q();return}let e=p("#qtm");e&&(e.textContent=`${t}s`)},1e3);function es(){let t=p("#pf-faucet");t&&t.addEventListener("click",vt),y("[data-act]").forEach(e=>e.addEventListener("click",async()=>{try{let s=await Y(await k("action",{type:e.dataset.act,series:e.dataset.s,owner:a.wallet.address,qty:e.dataset.q?Number(e.dataset.q):void 0}));D("\u2713","Done.","Your positions are updated.",s.url)}catch(s){D("!","Not sent.",m(s.message))}await H(),x()})),y("[data-vw]").forEach(e=>e.addEventListener("click",async()=>{try{let s=await Y(await k("vault",{type:"withdraw",epoch:Number(e.dataset.vw),owner:a.wallet.address}));D("\u2713","Withdrawn.","The USDC is in your wallet.",s.url)}catch(s){D("!","Not sent.",m(s.message))}await H(),x()}))}function ss(){We(),oe(),es()}var I={};async function re(t){if(!I[t]){I[t]={loading:!0};try{I[t]=await k(`index/prints?gpu=${encodeURIComponent(t)}`)}catch(e){I[t]={error:e.message}}if(a.view==="index")x();else if(a.view==="desk"){let e=p("#x-pick");e&&(e.innerHTML=$t(),yt());let s=p("#x-out");s&&(s.innerHTML=wt(),kt())}}}var ce=t=>t?`${t.slice(11,16)} UTC`:"",as=t=>t?`${t.slice(0,4)}\u2026${t.slice(-4)}`:"",mt=t=>`https://explorer.solana.com/address/${t}?cluster=devnet`;function ns(t){return t.post?`<a href="${m(t.post.url)}" target="_blank" rel="noopener">posted on Solana, slot ${t.post.slot}</a>`:'<span class="tag ghost">offchain</span>'}function is(t,e){let s=e.method||{},i=s.winsorize_pct||[10,90],n=t.bounds||[];return`<div class="src">
    <table class="tb"><tr><th>Source</th><th class="r">Price per GPU hour</th><th>Read at</th><th>Note</th></tr>${(t.providers||[]).map(l=>`<tr><td>${m(l.name)}</td><td class="r">${h(l.usd_hr,4)}</td><td>${l.fetched_at?`${M(l.fetched_at.slice(0,10))} ${ce(l.fetched_at)}`:""}</td><td>${l.clamped?`clamped to ${h(l.usd_hr>(n[1]||0)?n[1]:n[0],2)}`:""}</td></tr>`).join("")}</table>
    <p><b>Rule.</b> Each source counts once: the median of its on demand list prices. Values outside the ${i[0]}th to ${i[1]}th percentile are clamped to the edge${n.length?` (${h(n[0])} to ${h(n[1])})`:""}, not dropped. The print is the equal weight average of the ${t.n_providers} sources. Hyperscalers are excluded. At least ${s.min_providers||5} sources per print. Method ${m(s.version||"")}.</p>
    <p><b>Input hash.</b> <span class="mono">sha256 ${m(t.inputs_sha256||"")}</span></p>
    <p><b>Publisher key.</b> ${e.publisher?`<a href="${mt(e.publisher)}" target="_blank" rel="noopener" class="mono">${m(e.publisher)}</a>`:"none"}. The sources are offchain; the posted print is onchain.</p>
  </div>`}var Nt=t=>[...t||[]].reverse().find(e=>e.value!==null&&e.range)||null;function At(t,{W:e=1150,H:s=330,R:i=74,B:n=30,T:o=22,L:l=10,axis:r=!0}={}){if(!t||t.length<2)return"";let c=t.map(f=>f.value!==null&&f.range?f.range:null),u=c.filter(Boolean);if(u.length<2)return"";let d=Math.min(...u.map(f=>f.low)),v=Math.max(...u.map(f=>f.high)),$=(v-d||v*.05)*.08;d-=$,v+=$;let g=f=>l+f/(t.length-1)*(e-l-i),P=f=>o+(1-(f-d)/(v-d))*(s-o-n),S=[],b=[];c.forEach((f,L)=>{f?b.push([L,f]):b.length&&(S.push(b),b=[])}),b.length&&S.push(b);let C=S.filter(f=>f.length===1).map(([[f,L]])=>`<line x1="${g(f).toFixed(1)}" x2="${g(f).toFixed(1)}" y1="${P(L.high).toFixed(1)}" y2="${P(L.low).toFixed(1)}" stroke="rgba(255,255,255,.35)" stroke-width="${r?6:3}" ${r?"":'vector-effect="non-scaling-stroke"'}/>`).join(""),T=S.filter(f=>f.length>1).map(f=>`M${f.map(([L,_])=>`${g(L).toFixed(1)},${P(_.high).toFixed(1)}`).join(" L")} L${f.slice().reverse().map(([L,_])=>`${g(L).toFixed(1)},${P(_.low).toFixed(1)}`).join(" L")} Z`).join(" "),Z=S.map(f=>`M${f.map(([L,_])=>`${g(L).toFixed(1)},${P(_.mid).toFixed(1)}`).join(" L")}`).join(" "),G="",Et="";if(r){for(let f=0;f<5;f++){let L=v-(v-d)*f/4,_=P(L);G+=`<line x1="${l}" x2="${e-i}" y1="${_.toFixed(1)}" y2="${_.toFixed(1)}" stroke="rgba(255,255,255,.16)"/><text x="${e-i+10}" y="${(_+4).toFixed(1)}">${h(L)}</text>`}Et=[0,Math.floor((t.length-1)/2),t.length-1].map((f,L)=>`<text x="${g(f).toFixed(1)}" y="${s-6}" text-anchor="${L===0?"start":L===2?"end":"middle"}">${M(t[f].day)}</text>`).join("")}let Lt=c.map((f,L)=>f?L:-1).filter(f=>f>=0).pop();return`<svg class="axis" viewBox="0 0 ${e} ${s}" ${r?"":'preserveAspectRatio="none"'} role="img" aria-label="Daily range, low to high, with the mid">${G}
    <path d="${T}" fill="rgba(255,255,255,.18)"/>${C}
    <path d="${Z}" fill="none" stroke="#fff" stroke-width="${r?2:1.6}" stroke-linejoin="round" ${r?"":'vector-effect="non-scaling-stroke"'}/>
    ${r?`<circle cx="${g(Lt).toFixed(1)}" cy="${P(c[Lt].mid).toFixed(1)}" r="5" fill="#fff"/>`:""}${Et}</svg>`}function os(){let t=xe(),e=a.index.find(d=>d.code===a.ixChip)||t[0];if(!e)return'<div class="pg"><h1>Hourly Index</h1></div>';t.forEach(d=>{I[d.label]||re(d.label)});let s=I[e.label],i=s&&s.days||[],n=Nt(i),o=`<div class="ixg">${t.map(d=>{let v=I[d.label],$=v&&Nt(v.days);return`<button class="ixc ${d.code===e.code?"on":""}" data-ix="${d.code}"><div class="h"><b>${m(d.label)}</b><span>${$?h($.range.mid):"--"}<small>index</small></span></div>
      ${v&&v.days?At(v.days.slice(-90),{W:250,H:62,R:2,B:3,T:3,L:2,axis:!1}):'<svg viewBox="0 0 250 62"></svg>'}
      <div class="c">${$?`${h($.range.low)} to ${h($.range.high)}, ${$.range.n} sources`:v&&v.error?m(v.error):"Loading."}</div></button>`}).join("")}</div>
    <div class="ixg deals">${t.map(d=>{let v=I[d.label],$=v&&v.termDeals||[];return`<div class="ixc"><div class="h"><b>${m(d.label)}</b><i>Term deals</i></div><div class="c">${$.length?$.map(g=>`${h(g.usd_hr)} for ${m(g.term)}, <a href="${m(g.source_url)}" target="_blank" rel="noopener">source</a>`).join("<br>"):"No deals yet"}</div></div>`}).join("")}</div>`,l=`<span class="seg">${t.map(d=>`<button data-ix="${d.code}" class="${d.code===e.code?"on":""}">${m(d.label)}</button>`).join("")}</span>`,r=a.ixRange==="all"?i:i.slice(-Number(a.ixRange)),c=n?`<section class="win ixbig"><div class="bh">${l}<span class="seg">${[["30","30d"],["90","90d"],["all","All"]].map(([d,v])=>`<button data-ixr="${d}" class="${a.ixRange===d?"on":""}">${v}</button>`).join("")}</span></div>
      <button class="num rng" id="ix-open" aria-expanded="${a.ixOpen?"true":"false"}"><b>${m(e.label)}</b> ${h(n.range.low)} to ${h(n.range.high)}<small>mid ${h(n.range.mid)}, the Hourly Index, ${n.range.n} sources</small></button>
      <p class="when">Print for ${M(n.day)}, computed ${M(n.computed_at.slice(0,10))} ${ce(n.computed_at)}. Mid is the Hourly Index print. Low and High are the 25th and 75th percentile of the sources. ${ns(n)}</p>
      ${At(r,innerWidth<760?{W:560,H:300,R:58}:{})}
      <p class="hint">${a.ixOpen?"Where this range comes from:":"Click the range to see each source."}</p>
      ${a.ixOpen?is(n,s):""}</section>`:`<section class="win ixbig"><div class="bh">${l}</div><p class="when">${s&&s.error?m(s.error):"Loading prints."}</p></section>`,u=i.slice(-30).reverse().map(d=>d.value===null||!d.range?`<tr class="gap"><td>${M(d.day)}</td><td colspan="5">no print</td></tr>`:`<tr><td>${M(d.day)}</td><td class="r">${h(d.range.low)}</td><td class="r">${h(d.range.mid)}</td><td class="r">${h(d.range.high)}</td><td class="r">${d.range.n}</td><td>${d.post?`<a href="${m(d.post.url)}" target="_blank" rel="noopener">slot ${d.post.slot}</a>`:'<span class="tag ghost">offchain</span>'}</td></tr>`).join("");return`<div class="pg">
    <h1>Hourly Index</h1>
    <p class="sub">USD per GPU hour, as a range across sources. One print a day per chip.</p>
    ${o}
    ${c}
    ${it(`Recent prints, ${m(e.label)}`,`<table class="tb"><tr><th>Day</th><th class="r">Low</th><th class="r">Mid</th><th class="r">High</th><th class="r">Sources</th><th>Onchain</th></tr>${u}</table>`,"Daily, gaps shown","big")}
  </div>`}function ls(){y("[data-ix]").forEach(e=>e.addEventListener("click",()=>{a.ixChip=e.dataset.ix,x()})),y("[data-ixr]").forEach(e=>e.addEventListener("click",()=>{a.ixRange=e.dataset.ixr,x()}));let t=p("#ix-open");t&&t.addEventListener("click",()=>{a.ixOpen=!a.ixOpen,x()})}function rs(){let t=a.vaults.slice().sort((l,r)=>l.epoch-r.epoch),e=t.find(l=>l.phase==="trading")||t[t.length-1],s=t.reduce((l,r)=>l+r.premiums,0),i=t.reduce((l,r)=>l+r.openSeries,0),n=t.map(l=>`<tr><td>${l.epoch}</td><td>${Ot(l.epochEnd)}</td><td>${m(l.phase)}</td><td class="r">${h(l.deposits,0)}</td><td class="r">${l.cashAccount?`<a href="${mt(l.cashAccount)}" target="_blank" rel="noopener">${h(l.cash)}</a>`:h(l.cash)}</td><td class="r">${h(l.premiums)}</td><td class="r">${h(l.venueSeed,0)}</td></tr>`).join(""),o=t.filter(l=>l.phase==="deposits").sort((l,r)=>l.epoch-r.epoch)[0];return`<div class="pg">
    <h1>The House</h1>
    <p class="sub">The other side of every ticket, backed by a weekly vault.</p>
    <div class="kp"><div><i>Epoch ${e?e.epoch:""} deposits</i><b>${e?h(e.deposits,0):"$0"}</b></div><div><i>Premium in, all epochs</i><b>${h(s)}</b></div><div><i>Open series</i><b>${i}</b></div></div>
    ${it("Weekly vault",`<table class="tb"><tr><th>Epoch</th><th>Ends</th><th>Phase</th><th class="r">Deposits</th><th class="r">Collateral held</th><th class="r">Premium</th><th class="r">Seeded by us</th></tr>${n}</table>`,'<span class="tag ghost">Seeded by us</span>',"vault")}
    ${o?`<p class="coll">Collateral held, epoch ${o.epoch}: <b>${h(o.cash)}</b>, <a href="${mt(o.cashAccount)}" target="_blank" rel="noopener">onchain account ${as(o.cashAccount)}</a>. <span class="tag ghost">Seeded by us</span></p>`:""}
    <div class="dep"><button class="cta" id="hdep-go">Deposit test USDC</button><p class="st" id="hd-st"></p></div>
  </div>`}function cs(){let t=p("#hdep-go");t&&t.addEventListener("click",()=>tt(()=>{let e=a.vaults.filter(i=>i.phase==="deposits").sort((i,n)=>i.epoch-n.epoch)[0],s=p("#hd-st");if(!e){s.textContent="No vault is taking deposits right now.";return}W(`<div class="icon">$</div><b>Deposit, epoch ${e.epoch}</b><p class="small">Deposits close ${Ot(e.depositEnd)}. Test USDC only.</p><p><input id="hdep" inputmode="decimal" value="1000" aria-label="Amount in USDC"></p><div class="actions"><button class="btn" data-close>Cancel</button><button class="btn default" id="ok">Sign with wallet</button></div>`,(i,n)=>p("#ok",i).addEventListener("click",async()=>{let o=Number(p("#hdep",i).value);n();try{s.textContent="Approve the deposit in your wallet.";let l=await Y(await k("vault",{type:"deposit",epoch:e.epoch,owner:a.wallet.address,amount:o}));s.textContent="",D("\u2713","Deposited.","Your share of the vault is in your positions.",l.url),await Promise.all([St(),H()]),x()}catch(l){s.innerHTML=m(l.message),/faucet/i.test(l.message)&&(s.innerHTML+=' <button id="fz">Add test USDC</button>',p("#fz").addEventListener("click",vt))}}))}))}function ds(){let t=a.status||{},e=t.backtest&&t.backtest.result||[],s=t.feeBps||0,i=V()[0],n=i?`chip=${i.underlying}&side=higher&strike=${i.strike}&date=${i.windowEnd}&amount=10`:"chip=H100_SXM&side=higher&strike=3.40&date=2026-11-05&amount=10";return`<div class="pg">
    <h1>Docs</h1>
    <p class="sub">How Hourly works, in short.</p>
    <div class="docs"><nav>${[["tickets","Tickets"],["why-onchain","Why onchain"],["the-index","The Index"],["the-house","The House"],["agents","For agents"],["fees","Fees and limits"],["model","Model check"],["onchain","Onchain"]].map(([l,r])=>`<a href="#${l}" data-jump="${l}">${r}</a>`).join("")}</nav><div>
      <section><h2 id="tickets">Tickets<small>01</small></h2>
        <ul><li><b>Ticket:</b> a floor or a cap at a strike, for one day's print.</li><li><b>One tap:</b> the same ticket, with set amounts.</li><li><b>Lock a month:</b> a floor or a cap on a month's average, for one GPU.</li></ul>
        <p>You pay the Premium up front. That is all you can lose. What it pays up to sits in escrow from the moment it trades.</p></section>
      <section><h2 id="why-onchain">Why onchain<small>02</small></h2>
        <p>Sources are offchain. The print, the payout rule and the collateral are onchain and can't be changed after you pay. Every contract is fully backed in escrow, so neither side needs to trust the other.</p></section>
      <section><h2 id="the-index">The Index<small>03</small></h2>
        <p>One daily print per chip, from public rental list prices. Each print carries its method version and an input hash, so anyone can recompute it. Method <span class="tag ghost">v0 draft</span>, every print <span class="tag ghost">unsigned</span>. Not yet used to pay out any contract.</p></section>
      <section><h2 id="the-house">The House<small>04</small></h2>
        <p>The House is the other side of every ticket. Anyone can back it through the weekly vault and earn the Premium. Today every vault is <span class="tag ghost">seeded by us</span>.</p></section>
      <section><h2 id="agents">For agents<small>05</small></h2>
        <p>Agents read quotes and hand the user a link to sign. No agent can move funds.</p>
        <section class="win"><pre>GET /hourly/api/agent/brief
GET /hourly/api/agent/prepare?${m(n)}
    /hourly/llms.txt</pre></section></section>
      <section><h2 id="fees">Fees and limits<small>06</small></h2>
        <ul><li>Fee: ${s/100}% of Premium.</li><li>Fully backed in escrow, in ${Te}.</li><li>Cap trades: up to 50 GPUs each.</li><li>Test money only. Not audited.</li></ul></section>
      <section><h2 id="model">Model check<small>07</small></h2>
        <p>Pricing model against past prints, run ${t.backtest?M(t.backtest.at.slice(0,10)):"n/a"}. Lower error is better. Baseline quotes every strike at half.</p>
        ${e.length?`<section class="win"><table class="tb"><tr><th>Horizon</th><th class="r">Prints</th><th class="r">Coverage</th><th class="r">Error</th><th class="r">Baseline</th></tr>${e.map(l=>`<tr><td>${l.horizonDays} days</td><td class="r">${l.n}</td><td class="r">${Gt(l.coverage)}</td><td class="r">${l.brier.toFixed(3)}</td><td class="r">${l.brierCoin.toFixed(3)}</td></tr>`).join("")}</table></section>`:""}</section>
      <section><h2 id="onchain">Onchain<small>08</small></h2>
        <p>Solana devnet, test money only.</p>
        <section class="win"><pre><span class="c">program      </span>${m(t.programId||"")}
<span class="c">quote mint   </span>${m(t.quoteMint||"")}  <span class="c">test USDC</span>
<span class="c">oracle queue </span>${m(t.oracleQueue||"")}</pre></section></section>
    </div></div>
  </div>`}function us(){y("#desk [data-jump]").forEach(t=>t.addEventListener("click",e=>{e.preventDefault();let s=document.getElementById(t.dataset.jump);s&&s.scrollIntoView({behavior:"smooth"})}))}function x(){if(ke.includes(a.view)||(a.view="desk"),document.title=a.view==="debt"?"Hourly \xB7 Debt":"Hourly",a.view==="home"&&p("#desk .site")||a.view==="debt"&&p("#desk .debtpg"))return;let t={home:Pe,debt:Fe,desk:Ge,index:os,house:rs,docs:ds,access:_e};p("#desk").innerHTML=t[a.view](),document.body.dataset.view=a.view,{home:He,debt:De,desk:ss,index:ls,house:cs,docs:us,access:Ie}[a.view]()}async function St(){try{let[t,e]=await Promise.all([k("markets"),k("vaults").catch(()=>[])]);a.markets=t,a.vaults=e}catch{}}async function H(){if(!a.wallet){a.portfolio=null;return}try{a.portfolio=await k(`portfolio?owner=${a.wallet.address}`)}catch{}}async function de(){try{a.activity=await k("activity")}catch{}}window.__hourlyGo=(t,e)=>{e&&(a.mode=e),st(t)};window.addEventListener("hashchange",()=>{let t=et[location.hash.slice(1)]||(location.hash===""&&Wt?"debt":null);t&&t!==a.view&&(a.view=t,z(),x())});(async function(){let e=ye();e&&U.set("hourly.ref",e),Ht();try{let d=JSON.parse(U.get("hourly.cleanboot")||"null");d&&d.index&&d.index.length&&(Object.assign(a,{status:d.status,index:d.index,markets:d.markets||[],vaults:d.vaults||[],activity:d.activity}),z(),x())}catch{}let[s,i,n,o,l]=await Promise.all([k("status").catch(()=>null),k("index").catch(()=>null),k("markets").catch(()=>null),k("vaults").catch(()=>[]),k("activity").catch(()=>null)]);s&&(a.status=s),a.index=i||a.index||[],n&&(a.markets=n),a.vaults=o||a.vaults,l&&(a.activity=l),document.querySelector(".modal")||(z(),x()),U.set("hourly.cleanboot",JSON.stringify({status:a.status,index:a.index,markets:a.markets,vaults:a.vaults,activity:a.activity})),(window.requestIdleCallback||setTimeout)(()=>Le()),await Me(),location.hash==="#portfolio"&&H().then(()=>{if(a.view==="desk"){x();let d=document.querySelector(".pos");d&&d.scrollIntoView()}});let r="",c=0,u=()=>document.hidden||document.querySelector(".modal")||a.t.quote||a.t.quoting||document.activeElement&&/^(INPUT|SELECT|TEXTAREA)$/.test(document.activeElement.tagName);setInterval(async()=>{if(u()||!["desk","house","index"].includes(a.view))return;let d=++c%4===0;if(await Promise.all([k("markets").then(g=>{a.markets=g}).catch(()=>{}),d&&a.view==="house"?k("vaults").then(g=>{a.vaults=g}).catch(()=>{}):null,d?H():null]),u())return;let v=JSON.stringify([a.markets,a.vaults,a.portfolio]);if(v===r)return;let $=r==="";if(r=v,!$){let g=window.scrollY;x(),window.scrollTo(0,g)}},1e4)})();
