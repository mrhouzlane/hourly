# GPU debt page: fact verification

Checked 2026-11-05 against `draft/debt/index.html` (DEALS lines 338 to 353, page claims lines 186 to 265). Every source below was fetched live this session unless noted otherwise.

**Totals: 69 VERIFIED, 1 WRONG, 11 UNVERIFIED.**

## Deals

| Deal | Field (page value) | Status | Evidence |
|---|---|---|---|
| CW DDTL 4.0 | size $8.5B | VERIFIED | "closed an $8.5 billion delayed draw term loan facility ("DDTL 4.0 Facility")" |
| CW DDTL 4.0 | signed 2026-03-31 | VERIFIED | Release dated "March 31, 2026". The 8-K says the agreement was entered into Mar 30. |
| CW DDTL 4.0 | until Mar 2032 | VERIFIED | "The DDTL 4.0 Facility matures in March 2032". 8-K: "March 31, 2032". |
| CW DDTL 4.0 | rate SOFR + 2.25% (~6.2%) | VERIFIED | "a floating rate tranche financed at SOFR + 2.25%". Note: there is also "a fixed rate tranche financed at approximately 5.9%", which the page leaves out. |
| CW DDTL 4.0 | A3 Moody's, investment grade | VERIFIED | "received ratings of A3 by Moody's and A (low) by DBRS" |
| CW DDTL 4.0 | structure DDTL 4.0 | VERIFIED | Same as size quote. Non-recourse, "secured by substantially all assets of CoreWeave Compute Acquisition Co. VIII, LLC." |
| CW DDTL 4.0 | repay "Monthly installments, balloon Mar 2032" | UNVERIFIED | Neither the release nor the 8-K states it. The credit agreement (ex1011) defines "Monthly Payment Date", "Initial Amortization Payment" and "Schedule 2.08 Amortization Percentage", but Section 2.08 itself was not in the fetched text, so neither monthly principal nor a balloon is confirmed. |
| CW DDTL 4.0 | cy 3 (drawn as "Rental contract, stated") | UNVERIFIED | The release gives no contract length ("an associated customer contract"). The 3-year figure is stated only in the DDTL 5.5 release. |
| CW DDTL 5.0 | size $3.1B | VERIFIED | "closed its $3.1 billion delayed draw term loan facility ("DDTL 5.0 Facility")" |
| CW DDTL 5.0 | signed 2026-05-01 | VERIFIED (month) | Release dated "May 18, 2026". 8-K dated May 15, 2026. The day in the data (05-01) is not right; use 2026-05-18. |
| CW DDTL 5.0 | until May 2031 | **WRONG** | Should be **Nov 2031**. The 8-K says: "The maturity date of the DDTL 5.0 Facility is November 15, 2031." The release says "a maturity of approximately 5.5 years", which matches the page's `y:5.5` but not `untilLbl`. |
| CW DDTL 5.0 | rate SOFR + 4.50% (~8.5%) | VERIFIED | "resulting in final pricing at SOFR + 4.50%." |
| CW DDTL 5.0 | Ba2 Moody's | VERIFIED | "received ratings of Ba2 from Moody's and BB+ from Fitch" |
| CW DDTL 5.0 | structure DDTL 5.0 | VERIFIED | "structured as a delayed draw term loan", issued through CoreWeave Financing DDTL V, LLC |
| CW DDTL 5.0 | repay "Monthly from Nov 2026" | UNVERIFIED | Neither the release nor the 8-K states a repayment schedule. The 8-K gives only the draw period ("until the commitment termination date in September 2026") and a DSCR covenant. The credit agreement was not fetched. |
| CW DDTL 5.0 | cy 3 | UNVERIFIED | Not stated. The release says only "customer contracts with two large, non-investment grade customers". |
| CW DDTL 5.5 | size $2.6B | VERIFIED | "closed its $2.6 billion delayed draw term loan facility ("DDTL 5.5 Facility")" |
| CW DDTL 5.5 | signed 2026-08-10 | VERIFIED | Release dated "August 10, 2026" (8-K dated Aug 7). |
| CW DDTL 5.5 | until Sep 2031 | VERIFIED (via 8-K) | The cited release says only "an approximate five-year maturity". 8-K: "The maturity date of the DDTL 5.5 Facility is September 1, 2031." |
| CW DDTL 5.5 | rate SOFR + 5.50% (~9.5%) | VERIFIED | "priced at SOFR + 5.50%." |
| CW DDTL 5.5 | Ba2 Moody's | VERIFIED | "received ratings of Ba2 from Moody's and BB+ from Fitch" |
| CW DDTL 5.5 | structure DDTL 5.5 | VERIFIED | "issued through CoreWeave Financing DDTL V-V, LLC." |
| CW DDTL 5.5 | repay "Monthly plus excess cash sweep" | VERIFIED (via credit agreement, ex101) | §2.08: "On each Monthly Payment Date, the Borrower shall repay the Loans". §2.09(b)(i)(B) requires "100% of cash on deposit in the Available Cash Account" until principal ≤ the Minimum DDTL Amount ($1.3B). Not in the cited release. |
| CW DDTL 5.5 | cy 3 | VERIFIED | "its underlying customer contracts average approximately three years in length." |
| CW DDTL 3.0 | size $2.6B | VERIFIED | "closed a $2.6 billion delayed draw term loan facility ("DDTL 3.0 Facility")" |
| CW DDTL 3.0 | signed 2025-07-31 | VERIFIED | Release dated "July 31, 2025" (agreement entered July 28, 2025, per the 8-K). |
| CW DDTL 3.0 | until Aug 2030 | VERIFIED | "The DDTL 3.0 Facility matures on August 21, 2030" |
| CW DDTL 3.0 | rate SOFR + 4% (~8.0%) | VERIFIED | "The new DDTL 3.0 Facility, financed at SOFR +4%" |
| CW DDTL 3.0 | structure "secured GPU SPV" | VERIFIED (substance) | "secured by substantially all assets of CoreWeave Compute Acquisition Co. VII, LLC". The source never uses the word "SPV". |
| CW DDTL 3.0 | repay "Monthly from Apr 2026" | UNVERIFIED (likely wrong) | Not stated. The 8-K says draws are available "until the commitment termination date in July 2026" and "Beginning in April 2027 ... debt service coverage ratio of at least 1.40x." Amortization starting in Apr 2026, while draws run until Jul 2026, looks inconsistent with that. Recommend dropping it or replacing it with "Not disclosed". |
| CW DDTL 3.0 | cy 3 | UNVERIFIED | Not stated: "a long-term agreement with OpenAI". |
| Lambda | size $926M | VERIFIED | "closing of its $926 million senior secured term loan B facility" (cited lambda.ai URL 301s to lambda.com) |
| Lambda | signed 2026-08-27 | VERIFIED | Dated "August 27, 2026" |
| Lambda | until Dec 2030 | VERIFIED | "The Facility matures December 31, 2030, on a fully amortizing schedule" |
| Lambda | rate SOFR + 3.00% (~7.0%) | VERIFIED | "priced at SOFR + 3.00%, and issued at 99.5% of the principal amount." |
| Lambda | Baa2 Moody's | VERIFIED | "Moody's assigned the Facility a Baa2 rating." |
| Lambda | structure TLB, SPV secured by GPUs and contracts | VERIFIED | "Lambda's first large-scale private cloud GPU asset-backed SPV financing ... secured by the GPU servers and related infrastructure ... [and] the cash flows those assets generate." |
| Lambda | repay "Fully amortizing inside offtake" | VERIFIED | "on a fully amortizing schedule ... aligned with the contracted cash flows and useful life of the underlying GPU infrastructure" |
| Nebius | size $775M | VERIFIED | "first senior secured debt facility for approximately $775 million" |
| Nebius | signed 2026-07-17 | VERIFIED | "Amsterdam, July 17, 2026" |
| Nebius | until Oct 2030 | VERIFIED | "The facility matures October 31, 2030, and is priced at SOFR + 2.50%." |
| Nebius | rate SOFR + 2.50% (~6.5%) | VERIFIED | Same sentence |
| Nebius | structure senior secured, GPUs and customer cash flows | VERIFIED | "backed by deployed GPU infrastructure and contracted cash flows from an agreement with an investment-grade customer" |
| Nebius | repay "Schedule not disclosed" | VERIFIED | The release gives no amortization terms. |
| IREN | size $3.65B | VERIFIED (not at cited URL) | The Block, Jun 1 2026: "secured $3.65 billion in financing backed by its cloud computing contract with Microsoft". The cited AmCompute tracker lists only separate $1.5B DDTL and $2.1B notes rows. |
| IREN | signed 2026-06-01 | VERIFIED (announcement) | Tracker: "Jun 1, 2026". The 8-K says the agreements are "each dated May 29, 2026", so June is the closing month and May the signing month. |
| IREN | until Dec 2031 | VERIFIED (via 8-K) | "The maturity date for borrowings under the DDTL and the Notes is December 31, 2031" (or earlier, once the final Microsoft service fee is paid). Not on the cited tracker. |
| IREN | rate SOFR + 2.25% | VERIFIED | Tracker row "DDTL ... SOFR + 2.25%". 8-K: "term SOFR plus a margin of 2.25%" |
| IREN | 5.96% notes | VERIFIED | Tracker "Senior notes ... 5.96% fixed". 8-K: "The Notes bear interest at a fixed rate of 5.96% per annum." |
| IREN | Fitch A | VERIFIED (not at cited URL) | The Block: "investment-grade ratings of A from Fitch and A(low) for DBRS" |
| IREN | structure $1.55B DDTL + $2.10B private placement | VERIFIED (not at cited URL) | The Block: "a $2.1 billion U.S. private placement and a $1.55 billion delayed-draw loan". (The 8-K says "approximately $1.5 billion".) |
| IREN | repay "Monthly amortization" | UNVERIFIED | 8-K: each tranche will "amortize in accordance with applicable amortization schedules", with no frequency given. A search snippet says the FY2026 10-K states monthly repayment, but I did not fetch the 10-K. |
| Firmus | size $10B, signed Feb 2026, GPU-backed | VERIFIED (3 fields) | Tracker row: "Feb 9, 2026", "$10B", "GPU-backed facility", "Blackstone +1" |
| Nscale | size $1.4B, signed Feb 2026, DDTL | VERIFIED (3 fields) | Axis: "In February 2026, Nscale signed a $1.4 billion GPU-backed delayed-draw term loan" |
| Valor · xAI | size $3.5B of $5.4B | VERIFIED | "$5.4 billion acquisition and lease of data center compute infrastructure"; "led a $3.5 billion capital solution for Valor Compute Infrastructure L.P." |
| Valor · xAI | signed 2026-01-07 | VERIFIED | "January 07, 2026" |
| Valor · xAI | triple net lease | VERIFIED | "The financing uses a triple net lease structure" |
| Valor · xAI | chip NVIDIA GB200 | VERIFIED | "including NVIDIA GB200 GPUs" |
| Crusoe (Brookfield) | size $750M, signed Jun 2025, AI infra credit facility | VERIFIED (3 fields) | Axis table: June 2025, $750M, "Brookfield Infrastructure Debt credit facility supporting AI infrastructure expansion" |
| Fluidstack (Macquarie) | structure / lender | VERIFIED | Wing: "Fluidstack's Macquarie facilities of up to $10B in capacity". Page shows size as null, which is acceptable; Wing reports capacity, not a drawn amount. |
| Fluidstack (Macquarie) | signed 2025-04-01 | UNVERIFIED | Wing gives no date. The AmCompute tracker (not the cited source) lists "Apr 1, 2025 · Fluidstack · n/d". Recommend citing the tracker for the date. |
| Crusoe (Upper90) | size $225M, signed Mar 2025, GPUs + supporting infra | VERIFIED (3 fields) | "closing of an approximately $225 million credit facility for Crusoe", dated "March 27, 2025", "used exclusively for the purchase of NVIDIA GPUs and supporting cloud infrastructure" |
| Onchain aggregate | 18 loans, $441M | VERIFIED | "$441M committed or drawn across 18 GPU loans." |
| Onchain aggregate | 70% to 80% LTV | VERIFIED | "at 70% to 80% loan-to-value" (the USD.AI row alone is 56.7% to 80%) |
| Onchain aggregate | 10% to 15% fixed | VERIFIED | "Borrowers pay 10% to 15% fixed." |
| Onchain aggregate | ~3 year terms | VERIFIED | USD.AI term: "About 3 years" |
| Onchain aggregate | signed 2025-10-10 (until 2028-10-10) | UNVERIFIED | The source never states this date. It gives loans dated "Jul 1, 2025 to Sep 23, 2026". Recommend showing that range or Jul 2025. |
| Onchain aggregate | repay "Every 30 days, straight line" | UNVERIFIED | Not on the page: no 30-day or straight-line schedule is mentioned. |

## Page-level claims

| Claim | Status | Evidence |
|---|---|---|
| SOFR 3.97% (FRED, Nov 3, 2026) | VERIFIED | FRED SOFR shows 2026-11-03 = 3.97. Note that the latest print is now 3.94 (Nov 4), with FRED updated Nov 5. |
| CoreWeave customer contracts average about 3 years (DDTL 5.5) | VERIFIED | "its underlying customer contracts average approximately three years in length." |
| $31K to $40K per H100 (Mercatus) | VERIFIED | "8-GPU HGX servers cost $250,000 to $320,000 fully built, about $31,000 to $40,000 per GPU including server overhead." |
| Onchain aggregate (18 loans, 70 to 80% LTV, 10 to 15% fixed, $441M) | VERIFIED | See the onchain rows above. |
| Stat tile "Rental contracts 12 to 36 months" | UNVERIFIED | The page cites no source for it. |

## Notes / recommended fixes

1. **WRONG:** DDTL 5.0 `until:"2031-05-01"`, `untilLbl:"May 2031"` should be `2031-11-15` / `Nov 2031` (8-K: https://www.sec.gov/Archives/edgar/data/0001769628/000176962826000236/crwv-20260515.htm). `y:5.5` is already consistent with that. Also change `signed` to `2026-05-18`.
2. IREN's cited URL (the AmCompute tracker) supports only the date, the two rates and the tranche sizes. The 8-K (https://www.sec.gov/Archives/edgar/data/1878848/000114036126023427/ef20075181_8k.htm) supports the maturity, and The Block (https://www.theblock.co/post/403194/iren-lands-3-65-billion-a-rated-financing-microsoft-ai-buildout) supports $3.65B and Fitch A. Consider re-citing.
3. DDTL 5.5's maturity and repayment come from the 8-K and credit agreement (https://www.sec.gov/Archives/edgar/data/0001769628/000176962826000357/), not from the cited release.
4. The CoreWeave repayment notes for 4.0, 5.0 and 3.0 are unsupported by any source fetched. The 3.0 note ("Apr 2026") conflicts with the 8-K's July 2026 draw period and April 2027 DSCR start.
5. `cy:3` for DDTL 4.0, 5.0 and 3.0 draws a "Rental contract, stated" bar, but only the 5.5 source states 3 years. That contradicts the page's own footnote ("Other rows use the typical 12 to 36 month range"). Remove `cy` from those three rows, or label them as typical.
6. The DDTL 4.0 rate shows only the floating tranche. The ~5.9% fixed tranche is omitted. That isn't wrong, but it is incomplete.
7. The Lambda URL redirects (301) from lambda.ai to lambda.com, so update the link.
