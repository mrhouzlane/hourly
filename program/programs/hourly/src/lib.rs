//! Hourly: cash-settled options on a GPU rental price index.
//!
//! Every series has a bounded payoff, so every contract is fully collateralized
//! at write time. Prices are in quote-token atoms per GPU-hour (USDC has 6
//! decimals, so 2_640_000 = $2.64 per GPU-hour).
//!
//!   call    payoff/hour = min(max(S - K, 0), cap)     (a call spread K to K+cap)
//!   put     payoff/hour = min(max(K - S, 0), cap)     (cap <= K)
//!   digital payoff      = cap if S > K else 0         (units = 1: pays `cap` atoms)
//!
//! S is the average of the daily index prints inside the series window, the
//! same convention as ICE's OCPI futures. Settlement is permissionless: anyone
//! can submit a Switchboard On-Demand oracle quote for the series' feed, whose
//! job fetches the index and averages the window's prints. The program checks
//! the quote's signatures against the pinned Switchboard queue and the feed
//! hash stored on the series. A trusted settler key exists only as a fallback,
//! usable FALLBACK_DELAY after expiry if no oracle settlement has happened.
use anchor_lang::prelude::*;
use anchor_spl::token::{self, Burn, Mint, MintTo, Token, TokenAccount, Transfer};
use switchboard_on_demand::QuoteVerifier;

declare_id!("givjbTiAfcwKbKhr5kztwgkkNGZj3E8eEceKnvio8Bf");

// A dependency of the oracle crate links getrandom. On-chain code must never
// draw randomness, so the Solana build registers a source that always fails.
#[cfg(target_os = "solana")]
fn no_randomness(_buf: &mut [u8]) -> core::result::Result<(), getrandom::Error> {
    Err(getrandom::Error::UNSUPPORTED)
}
#[cfg(target_os = "solana")]
getrandom::register_custom_getrandom!(no_randomness);

#[cfg(all(feature = "preview", not(feature = "devnet")))]
compile_error!("the preview build is for the private demo chain only; build it with --features preview,devnet");

pub const CONFIG_SEED: &[u8] = b"config";
pub const SERIES_SEED: &[u8] = b"series";
pub const LONG_SEED: &[u8] = b"long";
pub const VAULT_SEED: &[u8] = b"vault";
pub const POSITION_SEED: &[u8] = b"pos";
pub const LPV_SEED: &[u8] = b"lpvault";
pub const LPV_SHARES_SEED: &[u8] = b"lpshares";
pub const LPV_CASH_SEED: &[u8] = b"lpcash";
pub const LPV_LONG_SEED: &[u8] = b"lplong";
pub const LPV_SERIES_SEED: &[u8] = b"lpseries";

pub const KIND_CALL: u8 = 0;
pub const KIND_PUT: u8 = 1;
pub const KIND_DIGITAL: u8 = 2;

/// Switchboard On-Demand program that must own the oracle queue.
#[cfg(feature = "devnet")]
pub const SB_PROGRAM: Pubkey = switchboard_on_demand::ON_DEMAND_DEVNET_PID;
#[cfg(not(feature = "devnet"))]
pub const SB_PROGRAM: Pubkey = switchboard_on_demand::ON_DEMAND_MAINNET_PID;

pub const SLOT_HASHES_SYSVAR: Pubkey = pubkey!("SysvarS1otHashes111111111111111111111111111");
pub const INSTRUCTIONS_SYSVAR: Pubkey = pubkey!("Sysvar1nstructions1111111111111111111111111");

/// Vault price bounds: the quoter can never make the vault pay more than 95%
/// of a contract's max payoff, nor sell one for less than 1% of it.
pub const VAULT_MAX_BUY_BPS: u64 = 9_500;
pub const VAULT_MIN_SELL_BPS: u64 = 100;
/// Oracle settlement opens this long after expiry, so late prints are included.
pub const ORACLE_GRACE: i64 = 2 * 3600;

/// Protocol fee ceiling: 5% of premium.
pub const MAX_FEE_BPS: u16 = 500;

/// The trusted settler may act only this long after expiry. The `preview`
/// build (private demo chain without Switchboard) settles at expiry instead.
#[cfg(not(feature = "preview"))]
pub const FALLBACK_DELAY: i64 = 72 * 3600;
#[cfg(feature = "preview")]
pub const FALLBACK_DELAY: i64 = 0;
/// Oracle quotes older than this many slots are rejected (about 60 s).
pub const MAX_QUOTE_AGE_SLOTS: u64 = 150;
/// Switchboard feed values are fixed point with 18 decimals; quote atoms use 6.
const SB_TO_ATOMS: i128 = 1_000_000_000_000;

#[program]
pub mod hourly {
    use super::*;

    pub fn init_config(
        ctx: Context<InitConfig>,
        settler: Pubkey,
        oracle_queue: Pubkey,
        fee_bps: u16,
        lister: Pubkey,
        min_oracle_sigs: u8,
    ) -> Result<()> {
        // Mainnet builds bake in the deployer so nobody can initialise first.
        if let Some(auth) = option_env!("HOURLY_INIT_AUTHORITY") {
            let expected: Pubkey = auth.parse().map_err(|_| error!(HourlyError::Unauthorized))?;
            require_keys_eq!(ctx.accounts.admin.key(), expected, HourlyError::Unauthorized);
        }
        require!(fee_bps <= MAX_FEE_BPS, HourlyError::BadTerms);
        require!(min_oracle_sigs >= 1, HourlyError::BadTerms);
        let c = &mut ctx.accounts.config;
        c.treasury = ctx.accounts.treasury.key();
        c.fee_bps = fee_bps;
        c.admin = ctx.accounts.admin.key();
        c.settler = settler;
        c.lister = lister;
        c.min_oracle_sigs = min_oracle_sigs;
        c.oracle_queue = oracle_queue;
        c.quote_mint = ctx.accounts.quote_mint.key();
        c.bump = ctx.bumps.config;
        Ok(())
    }

    pub fn set_settler(ctx: Context<AdminOnly>, settler: Pubkey) -> Result<()> {
        ctx.accounts.config.settler = settler;
        Ok(())
    }

    /// Emergency switch: stops new fills and vault deposits. Settlement,
    /// redemption and withdrawals keep working so funds can always leave.
    pub fn set_paused(ctx: Context<AdminOnly>, paused: bool) -> Result<()> {
        ctx.accounts.config.paused = paused;
        Ok(())
    }

    /// Hands config authority to a new admin (e.g. the Squads multisig vault).
    pub fn set_admin(ctx: Context<AdminOnly>, new_admin: Pubkey) -> Result<()> {
        require_keys_neq!(new_admin, Pubkey::default(), HourlyError::BadTerms);
        ctx.accounts.config.admin = new_admin;
        Ok(())
    }

    pub fn set_lister(ctx: Context<AdminOnly>, lister: Pubkey) -> Result<()> {
        ctx.accounts.config.lister = lister;
        Ok(())
    }

    pub fn set_min_oracle_sigs(ctx: Context<AdminOnly>, min_oracle_sigs: u8) -> Result<()> {
        require!(min_oracle_sigs >= 1, HourlyError::BadTerms);
        ctx.accounts.config.min_oracle_sigs = min_oracle_sigs;
        Ok(())
    }

    pub fn set_fee(ctx: Context<AdminOnly>, fee_bps: u16) -> Result<()> {
        require!(fee_bps <= MAX_FEE_BPS, HourlyError::BadTerms);
        ctx.accounts.config.fee_bps = fee_bps;
        Ok(())
    }

    #[allow(clippy::too_many_arguments)]
    pub fn create_series(
        ctx: Context<CreateSeries>,
        underlying: [u8; 16],
        kind: u8,
        strike: u64,
        cap: u64,
        units: u64,
        period_start: i64,
        expiry: i64,
        feed_id: [u8; 32],
    ) -> Result<()> {
        require!(kind <= KIND_DIGITAL, HourlyError::BadKind);
        require!(cap > 0 && units > 0, HourlyError::BadTerms);
        require!(strike > 0, HourlyError::BadTerms);
        require!(period_start < expiry, HourlyError::BadTerms);
        if kind == KIND_PUT {
            require!(cap <= strike, HourlyError::BadTerms);
        }
        let now = Clock::get()?.unix_timestamp;
        require!(expiry > now, HourlyError::Expired);
        cap.checked_mul(units).ok_or(HourlyError::Overflow)?;

        let s = &mut ctx.accounts.series;
        s.config = ctx.accounts.config.key();
        s.underlying = underlying;
        s.kind = kind;
        s.strike = strike;
        s.cap = cap;
        s.units = units;
        s.period_start = period_start;
        s.expiry = expiry;
        s.long_mint = ctx.accounts.long_mint.key();
        s.vault = ctx.accounts.vault.key();
        s.open_interest = 0;
        s.settled = false;
        s.settle_price = 0;
        s.evidence = [0u8; 32];
        s.payoff_per_contract = 0;
        s.feed_id = feed_id;
        s.settled_by_oracle = false;
        s.bump = ctx.bumps.series;
        Ok(())
    }

    /// One RFQ fill. Buyer and seller both sign the same transaction:
    /// the seller's collateral goes to the vault, the buyer's premium goes to
    /// the seller, and the buyer receives `qty` long tokens. Nothing moves
    /// unless all three legs move.
    pub fn fill(ctx: Context<Fill>, qty: u64, premium: u64, quote_expiry: i64) -> Result<()> {
        require!(!ctx.accounts.config.paused, HourlyError::Paused);
        require!(qty > 0, HourlyError::BadQty);
        let now = Clock::get()?.unix_timestamp;
        require!(now <= quote_expiry, HourlyError::StaleQuote);
        let s = &ctx.accounts.series;
        require!(!s.settled && now < s.expiry, HourlyError::Expired);
        require_keys_neq!(
            ctx.accounts.buyer.key(),
            ctx.accounts.seller.key(),
            HourlyError::SelfTrade
        );

        let collateral = collateral_per_contract(s)?
            .checked_mul(qty)
            .ok_or(HourlyError::Overflow)?;

        token::transfer(
            CpiContext::new(
                ctx.accounts.token_program.key(),
                Transfer {
                    from: ctx.accounts.seller_quote.to_account_info(),
                    to: ctx.accounts.vault.to_account_info(),
                    authority: ctx.accounts.seller.to_account_info(),
                },
            ),
            collateral,
        )?;
        if premium > 0 {
            token::transfer(
                CpiContext::new(
                    ctx.accounts.token_program.key(),
                    Transfer {
                        from: ctx.accounts.buyer_quote.to_account_info(),
                        to: ctx.accounts.seller_quote.to_account_info(),
                        authority: ctx.accounts.buyer.to_account_info(),
                    },
                ),
                premium,
            )?;
        }
        // protocol fee, paid by the buyer on top of the premium
        let fee = fee_for(premium, ctx.accounts.config.fee_bps);
        if fee > 0 {
            token::transfer(
                CpiContext::new(
                    ctx.accounts.token_program.key(),
                    Transfer {
                        from: ctx.accounts.buyer_quote.to_account_info(),
                        to: ctx.accounts.treasury.to_account_info(),
                        authority: ctx.accounts.buyer.to_account_info(),
                    },
                ),
                fee,
            )?;
        }
        let seeds = series_seeds(s);
        let bump = [s.bump];
        let signer: &[&[&[u8]]] = &[&[
            SERIES_SEED,
            seeds.0.as_ref(),
            &s.underlying,
            &seeds.1,
            &seeds.2,
            &seeds.3,
            &seeds.4,
            &seeds.5,
            &bump,
        ]];
        token::mint_to(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.key(),
                MintTo {
                    mint: ctx.accounts.long_mint.to_account_info(),
                    to: ctx.accounts.buyer_long.to_account_info(),
                    authority: ctx.accounts.series.to_account_info(),
                },
                signer,
            ),
            qty,
        )?;

        let p = &mut ctx.accounts.position;
        if p.writer == Pubkey::default() {
            p.writer = ctx.accounts.seller.key();
            p.series = ctx.accounts.series.key();
            p.bump = ctx.bumps.position;
        }
        p.amount = p.amount.checked_add(qty).ok_or(HourlyError::Overflow)?;
        let s = &mut ctx.accounts.series;
        s.open_interest = s
            .open_interest
            .checked_add(qty)
            .ok_or(HourlyError::Overflow)?;
        emit!(Filled {
            series: s.key(),
            buyer: ctx.accounts.buyer.key(),
            seller: ctx.accounts.seller.key(),
            qty,
            premium,
            fee,
        });
        Ok(())
    }

    /// Before settlement, a writer who holds long tokens of the same series can
    /// burn them against their short position and take the collateral back.
    pub fn close(ctx: Context<Close>, qty: u64) -> Result<()> {
        require!(qty > 0, HourlyError::BadQty);
        let s = &ctx.accounts.series;
        require!(!s.settled, HourlyError::AlreadySettled);
        require!(ctx.accounts.position.amount >= qty, HourlyError::BadQty);
        let collateral = collateral_per_contract(s)?
            .checked_mul(qty)
            .ok_or(HourlyError::Overflow)?;

        token::burn(
            CpiContext::new(
                ctx.accounts.token_program.key(),
                Burn {
                    mint: ctx.accounts.long_mint.to_account_info(),
                    from: ctx.accounts.writer_long.to_account_info(),
                    authority: ctx.accounts.writer.to_account_info(),
                },
            ),
            qty,
        )?;
        pay_from_vault(
            s,
            &ctx.accounts.series.to_account_info(),
            &ctx.accounts.vault,
            &ctx.accounts.writer_quote,
            &ctx.accounts.token_program,
            collateral,
        )?;
        ctx.accounts.position.amount -= qty;
        let s = &mut ctx.accounts.series;
        s.open_interest -= qty;
        Ok(())
    }

    /// Permissionless settlement from a Switchboard oracle quote. The quote's
    /// Ed25519 instruction must sit at `quote_ix_index` in this transaction.
    pub fn settle_oracle(ctx: Context<SettleOracle>, quote_ix_index: u8) -> Result<()> {
        let clock = Clock::get()?;
        let series = &ctx.accounts.series;
        require!(!series.settled, HourlyError::AlreadySettled);
        require!(clock.unix_timestamp >= series.expiry + ORACLE_GRACE, HourlyError::NotExpired);

        let queue = ctx.accounts.queue.to_account_info();
        let slothashes = ctx.accounts.slothashes.to_account_info();
        let instructions = ctx.accounts.instructions.to_account_info();
        let mut verifier = QuoteVerifier::new();
        verifier
            .queue(&queue)
            .slothash_sysvar(&slothashes)
            .ix_sysvar(&instructions)
            .clock_slot(clock.slot)
            .max_age(MAX_QUOTE_AGE_SLOTS);
        let quote = verifier.verify_instruction_at(quote_ix_index as i64).map_err(|e| {
            msg!("oracle quote rejected: {}", e);
            error!(HourlyError::OracleVerify)
        })?;
        let mut sigs = 0u8;
        while quote.oracle_index(sigs as usize).is_ok() {
            sigs += 1;
        }
        require!(sigs >= ctx.accounts.config.min_oracle_sigs, HourlyError::OracleVerify);
        let feed = quote
            .feeds()
            .iter()
            .find(|f| f.feed_id() == &series.feed_id)
            .ok_or(HourlyError::OracleFeedMissing)?;
        let price = sb_value_to_atoms(feed.feed_value())?;
        let mut evidence = [0u8; 32];
        evidence[..8].copy_from_slice(&quote.slot().to_le_bytes());

        let s = &mut ctx.accounts.series;
        apply_settlement(s, price, evidence, true)
    }

    /// Fallback only: the trusted settler posts the averaged index value if no
    /// oracle settlement has happened FALLBACK_DELAY after expiry.
    pub fn settle(ctx: Context<Settle>, price: u64, evidence: [u8; 32]) -> Result<()> {
        let now = Clock::get()?.unix_timestamp;
        let s = &mut ctx.accounts.series;
        require!(!s.settled, HourlyError::AlreadySettled);
        require!(now >= s.expiry, HourlyError::NotExpired);
        require!(now >= s.expiry + FALLBACK_DELAY, HourlyError::FallbackTooEarly);
        apply_settlement(s, price, evidence, false)
    }

    /// Long holder burns tokens and receives the settled payoff.
    pub fn redeem(ctx: Context<Redeem>, qty: u64) -> Result<()> {
        require!(qty > 0, HourlyError::BadQty);
        let s = &ctx.accounts.series;
        require!(s.settled, HourlyError::NotSettled);
        let amount = s
            .payoff_per_contract
            .checked_mul(qty)
            .ok_or(HourlyError::Overflow)?;
        token::burn(
            CpiContext::new(
                ctx.accounts.token_program.key(),
                Burn {
                    mint: ctx.accounts.long_mint.to_account_info(),
                    from: ctx.accounts.holder_long.to_account_info(),
                    authority: ctx.accounts.holder.to_account_info(),
                },
            ),
            qty,
        )?;
        if amount > 0 {
            pay_from_vault(
                s,
                &ctx.accounts.series.to_account_info(),
                &ctx.accounts.vault,
                &ctx.accounts.holder_quote,
                &ctx.accounts.token_program,
                amount,
            )?;
        }
        Ok(())
    }

    /// Writer takes back collateral minus what the longs are owed.
    pub fn reclaim(ctx: Context<Reclaim>) -> Result<()> {
        let s = &ctx.accounts.series;
        require!(s.settled, HourlyError::NotSettled);
        let qty = ctx.accounts.position.amount;
        require!(qty > 0, HourlyError::BadQty);
        let per = collateral_per_contract(s)? - s.payoff_per_contract;
        let amount = per.checked_mul(qty).ok_or(HourlyError::Overflow)?;
        if amount > 0 {
            pay_from_vault(
                s,
                &ctx.accounts.series.to_account_info(),
                &ctx.accounts.vault,
                &ctx.accounts.writer_quote,
                &ctx.accounts.token_program,
                amount,
            )?;
        }
        ctx.accounts.position.amount = 0;
        Ok(())
    }

    // ---------- underwriting vaults ----------
    // A vault pools LP deposits for one epoch. Deposits are taken before the
    // epoch trades; during the epoch the venue's quoter trades the vault's
    // capital within on-chain exposure caps; after every series it touched is
    // settled and collected, LPs withdraw pro rata. No mark-to-model is needed
    // because deposits and withdrawals only happen when the vault holds cash.

    pub fn create_vault(
        ctx: Context<CreateVault>,
        epoch: u32,
        quoter: Pubkey,
        deposit_end: i64,
        epoch_end: i64,
        max_series_bps: u16,
        max_epoch_bps: u16,
    ) -> Result<()> {
        require!(deposit_end < epoch_end, HourlyError::BadTerms);
        require!(max_series_bps > 0 && max_series_bps <= 10_000, HourlyError::BadTerms);
        require!(max_epoch_bps >= max_series_bps && max_epoch_bps <= 10_000, HourlyError::BadTerms);
        let v = &mut ctx.accounts.lp_vault;
        v.config = ctx.accounts.config.key();
        v.epoch = epoch;
        v.quoter = quoter;
        v.share_mint = ctx.accounts.share_mint.key();
        v.cash = ctx.accounts.cash.key();
        v.deposit_end = deposit_end;
        v.epoch_end = epoch_end;
        v.deposits = 0;
        v.max_series_bps = max_series_bps;
        v.max_epoch_bps = max_epoch_bps;
        v.at_risk = 0;
        v.open_series = 0;
        v.premiums = 0;
        v.bump = ctx.bumps.lp_vault;
        Ok(())
    }

    pub fn vault_deposit(ctx: Context<VaultDeposit>, amount: u64) -> Result<()> {
        require!(!ctx.accounts.config.paused, HourlyError::Paused);
        require!(amount > 0, HourlyError::BadQty);
        let now = Clock::get()?.unix_timestamp;
        require!(now < ctx.accounts.lp_vault.deposit_end, HourlyError::VaultClosed);
        token::transfer(
            CpiContext::new(
                ctx.accounts.token_program.key(),
                Transfer {
                    from: ctx.accounts.depositor_quote.to_account_info(),
                    to: ctx.accounts.cash.to_account_info(),
                    authority: ctx.accounts.depositor.to_account_info(),
                },
            ),
            amount,
        )?;
        let v = &ctx.accounts.lp_vault;
        let epoch = v.epoch.to_le_bytes();
        let bump = [v.bump];
        let signer: &[&[&[u8]]] = &[&[LPV_SEED, v.config.as_ref(), &epoch, &bump]];
        token::mint_to(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.key(),
                MintTo {
                    mint: ctx.accounts.share_mint.to_account_info(),
                    to: ctx.accounts.depositor_shares.to_account_info(),
                    authority: ctx.accounts.lp_vault.to_account_info(),
                },
                signer,
            ),
            amount,
        )?;
        let v = &mut ctx.accounts.lp_vault;
        v.deposits = v.deposits.checked_add(amount).ok_or(HourlyError::Overflow)?;
        Ok(())
    }

    /// The vault writes `qty` contracts to a taker. The quoter sets the price.
    pub fn vault_sell(ctx: Context<VaultSell>, qty: u64, premium: u64, quote_expiry: i64) -> Result<()> {
        require!(!ctx.accounts.config.paused, HourlyError::Paused);
        require!(qty > 0, HourlyError::BadQty);
        let now = Clock::get()?.unix_timestamp;
        require!(now <= quote_expiry, HourlyError::StaleQuote);
        let s = &ctx.accounts.series;
        let v = &ctx.accounts.lp_vault;
        require!(now >= v.deposit_end, HourlyError::VaultNotTrading);
        require!(!s.settled && now < s.expiry, HourlyError::Expired);
        require!(s.expiry <= v.epoch_end, HourlyError::SeriesOutsideEpoch);
        let per = collateral_per_contract(s)?;
        let collateral = per.checked_mul(qty).ok_or(HourlyError::Overflow)?;
        let new_short = ctx.accounts.vault_series.short.checked_add(qty).ok_or(HourlyError::Overflow)?;
        require!(
            (premium as u128) * 10_000 >= (collateral as u128) * (VAULT_MIN_SELL_BPS as u128),
            HourlyError::VaultPrice
        );
        let at_risk = v.at_risk.checked_add(collateral).ok_or(HourlyError::Overflow)?;
        require!(
            (at_risk as u128) * 10_000 <= (v.deposits as u128) * (v.max_epoch_bps as u128),
            HourlyError::VaultLimit
        );
        require!(
            (new_short as u128) * (per as u128) <= (v.deposits as u128) * (v.max_series_bps as u128) / 10_000,
            HourlyError::VaultLimit
        );
        let epoch = v.epoch.to_le_bytes();
        let vbump = [v.bump];
        let vault_signer: &[&[&[u8]]] = &[&[LPV_SEED, v.config.as_ref(), &epoch, &vbump]];
        // collateral: vault cash -> series escrow
        token::transfer(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.key(),
                Transfer {
                    from: ctx.accounts.cash.to_account_info(),
                    to: ctx.accounts.vault.to_account_info(),
                    authority: ctx.accounts.lp_vault.to_account_info(),
                },
                vault_signer,
            ),
            collateral,
        )?;
        // premium and fee: taker -> vault cash, taker -> treasury
        if premium > 0 {
            token::transfer(
                CpiContext::new(
                    ctx.accounts.token_program.key(),
                    Transfer {
                        from: ctx.accounts.taker_quote.to_account_info(),
                        to: ctx.accounts.cash.to_account_info(),
                        authority: ctx.accounts.taker.to_account_info(),
                    },
                ),
                premium,
            )?;
        }
        let fee = fee_for(premium, ctx.accounts.config.fee_bps);
        if fee > 0 {
            token::transfer(
                CpiContext::new(
                    ctx.accounts.token_program.key(),
                    Transfer {
                        from: ctx.accounts.taker_quote.to_account_info(),
                        to: ctx.accounts.treasury.to_account_info(),
                        authority: ctx.accounts.taker.to_account_info(),
                    },
                ),
                fee,
            )?;
        }
        // long tokens to the taker
        let seeds = series_seeds(s);
        let sbump = [s.bump];
        let series_signer: &[&[&[u8]]] = &[&[
            SERIES_SEED, seeds.0.as_ref(), &s.underlying, &seeds.1, &seeds.2, &seeds.3, &seeds.4, &seeds.5, &sbump,
        ]];
        token::mint_to(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.key(),
                MintTo {
                    mint: ctx.accounts.long_mint.to_account_info(),
                    to: ctx.accounts.taker_long.to_account_info(),
                    authority: ctx.accounts.series.to_account_info(),
                },
                series_signer,
            ),
            qty,
        )?;
        let lp_key = ctx.accounts.lp_vault.key();
        let series_key = ctx.accounts.series.key();
        let p = &mut ctx.accounts.position;
        if p.writer == Pubkey::default() {
            p.writer = lp_key;
            p.series = series_key;
            p.bump = ctx.bumps.position;
        }
        p.amount = p.amount.checked_add(qty).ok_or(HourlyError::Overflow)?;
        let vs = &mut ctx.accounts.vault_series;
        if vs.vault == Pubkey::default() {
            vs.vault = lp_key;
            vs.series = series_key;
            vs.bump = ctx.bumps.vault_series;
            ctx.accounts.lp_vault.open_series += 1;
        }
        vs.short = new_short;
        let s = &mut ctx.accounts.series;
        s.open_interest = s.open_interest.checked_add(qty).ok_or(HourlyError::Overflow)?;
        let v = &mut ctx.accounts.lp_vault;
        v.premiums = v.premiums.checked_add(premium).ok_or(HourlyError::Overflow)?;
        v.at_risk = at_risk;
        emit!(Filled { series: series_key, buyer: ctx.accounts.taker.key(), seller: lp_key, qty, premium, fee });
        Ok(())
    }

    /// The vault buys `qty` contracts written by a taker.
    pub fn vault_buy(ctx: Context<VaultBuy>, qty: u64, premium: u64, quote_expiry: i64) -> Result<()> {
        require!(!ctx.accounts.config.paused, HourlyError::Paused);
        require!(qty > 0, HourlyError::BadQty);
        let now = Clock::get()?.unix_timestamp;
        require!(now <= quote_expiry, HourlyError::StaleQuote);
        let s = &ctx.accounts.series;
        let v = &ctx.accounts.lp_vault;
        require!(now >= v.deposit_end, HourlyError::VaultNotTrading);
        require!(!s.settled && now < s.expiry, HourlyError::Expired);
        require!(s.expiry <= v.epoch_end, HourlyError::SeriesOutsideEpoch);
        require_keys_neq!(ctx.accounts.taker.key(), ctx.accounts.lp_vault.key(), HourlyError::SelfTrade);
        let per = collateral_per_contract(s)?;
        let collateral = per.checked_mul(qty).ok_or(HourlyError::Overflow)?;
        let new_long = ctx.accounts.vault_series.long.checked_add(qty).ok_or(HourlyError::Overflow)?;
        require!(
            (premium as u128) * 10_000 <= (collateral as u128) * (VAULT_MAX_BUY_BPS as u128),
            HourlyError::VaultPrice
        );
        let spend = premium.checked_add(fee_for(premium, ctx.accounts.config.fee_bps)).ok_or(HourlyError::Overflow)?;
        let at_risk = v.at_risk.checked_add(spend).ok_or(HourlyError::Overflow)?;
        require!(
            (at_risk as u128) * 10_000 <= (v.deposits as u128) * (v.max_epoch_bps as u128),
            HourlyError::VaultLimit
        );
        require!(
            (new_long as u128) * (per as u128) <= (v.deposits as u128) * (v.max_series_bps as u128) / 10_000,
            HourlyError::VaultLimit
        );
        // taker's collateral -> series escrow
        token::transfer(
            CpiContext::new(
                ctx.accounts.token_program.key(),
                Transfer {
                    from: ctx.accounts.taker_quote.to_account_info(),
                    to: ctx.accounts.vault.to_account_info(),
                    authority: ctx.accounts.taker.to_account_info(),
                },
            ),
            collateral,
        )?;
        let epoch = v.epoch.to_le_bytes();
        let vbump = [v.bump];
        let vault_signer: &[&[&[u8]]] = &[&[LPV_SEED, v.config.as_ref(), &epoch, &vbump]];
        // premium and fee from vault cash
        if premium > 0 {
            token::transfer(
                CpiContext::new_with_signer(
                    ctx.accounts.token_program.key(),
                    Transfer {
                        from: ctx.accounts.cash.to_account_info(),
                        to: ctx.accounts.taker_quote.to_account_info(),
                        authority: ctx.accounts.lp_vault.to_account_info(),
                    },
                    vault_signer,
                ),
                premium,
            )?;
        }
        let fee = fee_for(premium, ctx.accounts.config.fee_bps);
        if fee > 0 {
            token::transfer(
                CpiContext::new_with_signer(
                    ctx.accounts.token_program.key(),
                    Transfer {
                        from: ctx.accounts.cash.to_account_info(),
                        to: ctx.accounts.treasury.to_account_info(),
                        authority: ctx.accounts.lp_vault.to_account_info(),
                    },
                    vault_signer,
                ),
                fee,
            )?;
        }
        let seeds = series_seeds(s);
        let sbump = [s.bump];
        let series_signer: &[&[&[u8]]] = &[&[
            SERIES_SEED, seeds.0.as_ref(), &s.underlying, &seeds.1, &seeds.2, &seeds.3, &seeds.4, &seeds.5, &sbump,
        ]];
        token::mint_to(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.key(),
                MintTo {
                    mint: ctx.accounts.long_mint.to_account_info(),
                    to: ctx.accounts.vault_long.to_account_info(),
                    authority: ctx.accounts.series.to_account_info(),
                },
                series_signer,
            ),
            qty,
        )?;
        let lp_key = ctx.accounts.lp_vault.key();
        let series_key = ctx.accounts.series.key();
        let taker_key = ctx.accounts.taker.key();
        let p = &mut ctx.accounts.position;
        if p.writer == Pubkey::default() {
            p.writer = taker_key;
            p.series = series_key;
            p.bump = ctx.bumps.position;
        }
        p.amount = p.amount.checked_add(qty).ok_or(HourlyError::Overflow)?;
        let vs = &mut ctx.accounts.vault_series;
        if vs.vault == Pubkey::default() {
            vs.vault = lp_key;
            vs.series = series_key;
            vs.bump = ctx.bumps.vault_series;
            ctx.accounts.lp_vault.open_series += 1;
        }
        vs.long = new_long;
        ctx.accounts.lp_vault.at_risk = at_risk;
        let s = &mut ctx.accounts.series;
        s.open_interest = s.open_interest.checked_add(qty).ok_or(HourlyError::Overflow)?;
        emit!(Filled { series: series_key, buyer: lp_key, seller: taker_key, qty, premium, fee });
        Ok(())
    }

    /// After settlement, pulls everything the vault is owed on one series back
    /// into vault cash. Anyone can call it.
    pub fn vault_collect(ctx: Context<VaultCollect>) -> Result<()> {
        let s = &ctx.accounts.series;
        require!(s.settled, HourlyError::NotSettled);
        let per_payoff = s.payoff_per_contract;
        let per_coll = collateral_per_contract(s)?;
        let vs_long = ctx.accounts.vault_series.long;
        let vs_short = ctx.accounts.vault_series.short;
        let v = &ctx.accounts.lp_vault;
        let epoch = v.epoch.to_le_bytes();
        let vbump = [v.bump];
        let vault_signer: &[&[&[u8]]] = &[&[LPV_SEED, v.config.as_ref(), &epoch, &vbump]];
        let mut owed: u64 = 0;
        if vs_long > 0 {
            let vl = ctx.accounts.vault_long.as_ref().ok_or(HourlyError::BadQty)?;
            token::burn(
                CpiContext::new_with_signer(
                    ctx.accounts.token_program.key(),
                    Burn {
                        mint: ctx.accounts.long_mint.to_account_info(),
                        from: vl.to_account_info(),
                        authority: ctx.accounts.lp_vault.to_account_info(),
                    },
                    vault_signer,
                ),
                vs_long,
            )?;
            owed = owed.checked_add(per_payoff.checked_mul(vs_long).ok_or(HourlyError::Overflow)?).ok_or(HourlyError::Overflow)?;
        }
        if vs_short > 0 {
            let pos = ctx.accounts.position.as_mut().ok_or(HourlyError::BadQty)?;
            require_keys_eq!(pos.writer, ctx.accounts.lp_vault.key(), HourlyError::Unauthorized);
            let back = (per_coll - per_payoff).checked_mul(pos.amount).ok_or(HourlyError::Overflow)?;
            owed = owed.checked_add(back).ok_or(HourlyError::Overflow)?;
            pos.amount = 0;
        }
        if owed > 0 {
            pay_from_vault(s, &ctx.accounts.series.to_account_info(), &ctx.accounts.vault, &ctx.accounts.cash, &ctx.accounts.token_program, owed)?;
        }
        let vs = &mut ctx.accounts.vault_series;
        vs.long = 0;
        vs.short = 0;
        if !vs.closed {
            vs.closed = true;
            let v = &mut ctx.accounts.lp_vault;
            v.open_series = v.open_series.saturating_sub(1);
        }
        Ok(())
    }

    /// After the epoch ends and every series is collected, LPs burn shares for
    /// their pro rata slice of vault cash.
    pub fn vault_withdraw(ctx: Context<VaultWithdraw>, shares: u64) -> Result<()> {
        require!(shares > 0, HourlyError::BadQty);
        let now = Clock::get()?.unix_timestamp;
        let v = &ctx.accounts.lp_vault;
        require!(now >= v.epoch_end && v.open_series == 0, HourlyError::VaultLocked);
        let supply = ctx.accounts.share_mint.supply;
        require!(supply > 0 && shares <= supply, HourlyError::BadQty);
        let amount = ((ctx.accounts.cash.amount as u128) * (shares as u128) / (supply as u128)) as u64;
        token::burn(
            CpiContext::new(
                ctx.accounts.token_program.key(),
                Burn {
                    mint: ctx.accounts.share_mint.to_account_info(),
                    from: ctx.accounts.owner_shares.to_account_info(),
                    authority: ctx.accounts.owner.to_account_info(),
                },
            ),
            shares,
        )?;
        let epoch = v.epoch.to_le_bytes();
        let vbump = [v.bump];
        let vault_signer: &[&[&[u8]]] = &[&[LPV_SEED, v.config.as_ref(), &epoch, &vbump]];
        if amount > 0 {
            token::transfer(
                CpiContext::new_with_signer(
                    ctx.accounts.token_program.key(),
                    Transfer {
                        from: ctx.accounts.cash.to_account_info(),
                        to: ctx.accounts.owner_quote.to_account_info(),
                        authority: ctx.accounts.lp_vault.to_account_info(),
                    },
                    vault_signer,
                ),
                amount,
            )?;
        }
        Ok(())
    }
}

// ---------- pure math ----------

fn apply_settlement(s: &mut Account<Series>, price: u64, evidence: [u8; 32], by_oracle: bool) -> Result<()> {
    s.settle_price = price;
    s.evidence = evidence;
    s.payoff_per_contract = payoff_per_contract(s.kind, s.strike, s.cap, s.units, price)?;
    s.settled = true;
    s.settled_by_oracle = by_oracle;
    emit!(Settled {
        series: s.key(),
        price,
        payoff_per_contract: s.payoff_per_contract,
        by_oracle,
    });
    Ok(())
}

/// Converts an 18-decimal Switchboard value to 6-decimal quote atoms,
/// rounding half up. Rejects non-positive and out-of-range values.
pub fn sb_value_to_atoms(v: i128) -> Result<u64> {
    require!(v > 0, HourlyError::OracleBadValue);
    let atoms = (v + SB_TO_ATOMS / 2) / SB_TO_ATOMS;
    require!(atoms > 0 && atoms <= u64::MAX as i128, HourlyError::OracleBadValue);
    Ok(atoms as u64)
}

/// Fee in quote atoms, rounded down.
pub fn fee_for(premium: u64, fee_bps: u16) -> u64 {
    ((premium as u128 * fee_bps as u128) / 10_000) as u64
}

pub fn collateral_per_contract(s: &Series) -> Result<u64> {
    Ok(s.cap.checked_mul(s.units).ok_or(HourlyError::Overflow)?)
}

pub fn payoff_per_contract(kind: u8, strike: u64, cap: u64, units: u64, price: u64) -> Result<u64> {
    let per_hour = match kind {
        KIND_CALL => price.saturating_sub(strike).min(cap),
        KIND_PUT => strike.saturating_sub(price).min(cap),
        KIND_DIGITAL => {
            if price > strike {
                cap
            } else {
                0
            }
        }
        _ => return err!(HourlyError::BadKind),
    };
    Ok(per_hour.checked_mul(units).ok_or(HourlyError::Overflow)?)
}

fn series_seeds(s: &Series) -> (Pubkey, [u8; 1], [u8; 8], [u8; 8], [u8; 8], [u8; 8]) {
    (
        s.config,
        [s.kind],
        s.strike.to_le_bytes(),
        s.cap.to_le_bytes(),
        s.units.to_le_bytes(),
        s.expiry.to_le_bytes(),
    )
}

fn pay_from_vault<'info>(
    s: &Series,
    series_ai: &AccountInfo<'info>,
    vault: &Account<'info, TokenAccount>,
    to: &Account<'info, TokenAccount>,
    token_program: &Program<'info, Token>,
    amount: u64,
) -> Result<()> {
    let seeds = series_seeds(s);
    let bump = [s.bump];
    let signer: &[&[&[u8]]] = &[&[
        SERIES_SEED,
        seeds.0.as_ref(),
        &s.underlying,
        &seeds.1,
        &seeds.2,
        &seeds.3,
        &seeds.4,
        &seeds.5,
        &bump,
    ]];
    token::transfer(
        CpiContext::new_with_signer(
            token_program.key(),
            Transfer {
                from: vault.to_account_info(),
                to: to.to_account_info(),
                authority: series_ai.clone(),
            },
            signer,
        ),
        amount,
    )
}

// ---------- state ----------

#[account]
#[derive(InitSpace)]
pub struct Config {
    pub admin: Pubkey,
    pub settler: Pubkey,
    pub quote_mint: Pubkey,
    pub oracle_queue: Pubkey,
    pub treasury: Pubkey,
    pub fee_bps: u16,
    pub paused: bool,
    pub lister: Pubkey,
    pub min_oracle_sigs: u8,
    pub bump: u8,
}

#[account]
#[derive(InitSpace)]
pub struct Series {
    pub config: Pubkey,
    pub underlying: [u8; 16],
    pub kind: u8,
    pub strike: u64,
    pub cap: u64,
    pub units: u64,
    pub period_start: i64,
    pub expiry: i64,
    pub long_mint: Pubkey,
    pub vault: Pubkey,
    pub open_interest: u64,
    pub settled: bool,
    pub settle_price: u64,
    pub evidence: [u8; 32],
    pub payoff_per_contract: u64,
    pub feed_id: [u8; 32],
    pub settled_by_oracle: bool,
    pub bump: u8,
}

#[account]
#[derive(InitSpace)]
pub struct Position {
    pub writer: Pubkey,
    pub series: Pubkey,
    pub amount: u64,
    pub bump: u8,
}

#[account]
#[derive(InitSpace)]
pub struct LpVault {
    pub config: Pubkey,
    pub epoch: u32,
    pub quoter: Pubkey,
    pub share_mint: Pubkey,
    pub cash: Pubkey,
    pub deposit_end: i64,
    pub epoch_end: i64,
    pub deposits: u64,
    pub max_series_bps: u16,
    pub max_epoch_bps: u16,
    pub at_risk: u64,
    pub open_series: u32,
    pub premiums: u64,
    pub bump: u8,
}

#[account]
#[derive(InitSpace)]
pub struct VaultSeries {
    pub vault: Pubkey,
    pub series: Pubkey,
    pub short: u64,
    pub long: u64,
    pub closed: bool,
    pub bump: u8,
}

#[event]
pub struct Filled {
    pub series: Pubkey,
    pub buyer: Pubkey,
    pub seller: Pubkey,
    pub qty: u64,
    pub premium: u64,
    pub fee: u64,
}

#[event]
pub struct Settled {
    pub series: Pubkey,
    pub price: u64,
    pub payoff_per_contract: u64,
    pub by_oracle: bool,
}

#[error_code]
pub enum HourlyError {
    #[msg("unknown series kind")]
    BadKind,
    #[msg("invalid series terms")]
    BadTerms,
    #[msg("quantity must be positive and covered")]
    BadQty,
    #[msg("quote has expired")]
    StaleQuote,
    #[msg("series has expired")]
    Expired,
    #[msg("series has not expired yet")]
    NotExpired,
    #[msg("series already settled")]
    AlreadySettled,
    #[msg("series not settled")]
    NotSettled,
    #[msg("buyer and seller must differ")]
    SelfTrade,
    #[msg("arithmetic overflow")]
    Overflow,
    #[msg("signer is not authorized")]
    Unauthorized,
    #[msg("oracle quote failed verification")]
    OracleVerify,
    #[msg("oracle quote does not contain this series' feed")]
    OracleFeedMissing,
    #[msg("oracle value is out of range")]
    OracleBadValue,
    #[msg("fallback settlement is not open yet")]
    FallbackTooEarly,
    #[msg("vault deposits are closed")]
    VaultClosed,
    #[msg("vault is locked until its epoch ends and every series is collected")]
    VaultLocked,
    #[msg("trade exceeds the vault's exposure cap for this series")]
    VaultLimit,
    #[msg("vault is not trading yet")]
    VaultNotTrading,
    #[msg("series expires after the vault's epoch")]
    SeriesOutsideEpoch,
    #[msg("venue is paused")]
    Paused,
    #[msg("vault trade price is outside the on-chain bounds")]
    VaultPrice,
}

// ---------- accounts ----------

#[derive(Accounts)]
pub struct InitConfig<'info> {
    #[account(mut)]
    pub admin: Signer<'info>,
    #[account(init, payer = admin, space = 8 + Config::INIT_SPACE, seeds = [CONFIG_SEED], bump)]
    pub config: Account<'info, Config>,
    pub quote_mint: Box<Account<'info, Mint>>,
    #[account(token::mint = quote_mint)]
    pub treasury: Box<Account<'info, TokenAccount>>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct AdminOnly<'info> {
    pub admin: Signer<'info>,
    #[account(mut, seeds = [CONFIG_SEED], bump = config.bump, has_one = admin @ HourlyError::Unauthorized)]
    pub config: Account<'info, Config>,
}

#[derive(Accounts)]
#[instruction(underlying: [u8; 16], kind: u8, strike: u64, cap: u64, units: u64, period_start: i64, expiry: i64, feed_id: [u8; 32])]
pub struct CreateSeries<'info> {
    #[account(mut)]
    pub lister: Signer<'info>,
    #[account(seeds = [CONFIG_SEED], bump = config.bump, has_one = lister @ HourlyError::Unauthorized, has_one = quote_mint)]
    pub config: Account<'info, Config>,
    pub quote_mint: Box<Account<'info, Mint>>,
    #[account(
        init,
        payer = lister,
        space = 8 + Series::INIT_SPACE,
        seeds = [
            SERIES_SEED,
            config.key().as_ref(),
            &underlying,
            &[kind],
            &strike.to_le_bytes(),
            &cap.to_le_bytes(),
            &units.to_le_bytes(),
            &expiry.to_le_bytes(),
        ],
        bump
    )]
    pub series: Box<Account<'info, Series>>,
    #[account(
        init,
        payer = lister,
        seeds = [LONG_SEED, series.key().as_ref()],
        bump,
        mint::decimals = 0,
        mint::authority = series,
    )]
    pub long_mint: Box<Account<'info, Mint>>,
    #[account(
        init,
        payer = lister,
        seeds = [VAULT_SEED, series.key().as_ref()],
        bump,
        token::mint = quote_mint,
        token::authority = series,
    )]
    pub vault: Box<Account<'info, TokenAccount>>,
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct Fill<'info> {
    /// Pays rent for the writer's position account. Usually the venue, so
    /// takers need no SOL.
    #[account(mut)]
    pub payer: Signer<'info>,
    pub buyer: Signer<'info>,
    pub seller: Signer<'info>,
    #[account(seeds = [CONFIG_SEED], bump = config.bump)]
    pub config: Account<'info, Config>,
    #[account(mut, has_one = config, has_one = long_mint, has_one = vault)]
    pub series: Box<Account<'info, Series>>,
    #[account(mut)]
    pub long_mint: Box<Account<'info, Mint>>,
    #[account(mut)]
    pub vault: Box<Account<'info, TokenAccount>>,
    #[account(mut, token::mint = config.quote_mint, token::authority = buyer)]
    pub buyer_quote: Box<Account<'info, TokenAccount>>,
    #[account(mut, token::mint = config.quote_mint, token::authority = seller)]
    pub seller_quote: Box<Account<'info, TokenAccount>>,
    #[account(mut, token::mint = long_mint, token::authority = buyer)]
    pub buyer_long: Box<Account<'info, TokenAccount>>,
    #[account(mut, address = config.treasury @ HourlyError::Unauthorized)]
    pub treasury: Box<Account<'info, TokenAccount>>,
    #[account(
        init_if_needed,
        payer = payer,
        space = 8 + Position::INIT_SPACE,
        seeds = [POSITION_SEED, series.key().as_ref(), seller.key().as_ref()],
        bump
    )]
    pub position: Box<Account<'info, Position>>,
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct Close<'info> {
    pub writer: Signer<'info>,
    #[account(seeds = [CONFIG_SEED], bump = config.bump)]
    pub config: Account<'info, Config>,
    #[account(mut, has_one = config, has_one = long_mint, has_one = vault)]
    pub series: Box<Account<'info, Series>>,
    #[account(mut)]
    pub long_mint: Box<Account<'info, Mint>>,
    #[account(mut)]
    pub vault: Box<Account<'info, TokenAccount>>,
    #[account(mut, token::mint = long_mint, token::authority = writer)]
    pub writer_long: Box<Account<'info, TokenAccount>>,
    #[account(mut, token::mint = config.quote_mint, token::authority = writer)]
    pub writer_quote: Box<Account<'info, TokenAccount>>,
    #[account(mut, seeds = [POSITION_SEED, series.key().as_ref(), writer.key().as_ref()], bump = position.bump, has_one = writer, has_one = series)]
    pub position: Box<Account<'info, Position>>,
    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct SettleOracle<'info> {
    #[account(seeds = [CONFIG_SEED], bump = config.bump)]
    pub config: Box<Account<'info, Config>>,
    #[account(mut, has_one = config)]
    pub series: Box<Account<'info, Series>>,
    /// CHECK: pinned to the Switchboard queue chosen at init and owned by the
    /// Switchboard On-Demand program; its oracle keys are read by QuoteVerifier.
    #[account(address = config.oracle_queue @ HourlyError::OracleVerify, owner = SB_PROGRAM @ HourlyError::OracleVerify)]
    pub queue: UncheckedAccount<'info>,
    /// CHECK: address-checked slot hashes sysvar
    #[account(address = SLOT_HASHES_SYSVAR)]
    pub slothashes: UncheckedAccount<'info>,
    /// CHECK: address-checked instructions sysvar
    #[account(address = INSTRUCTIONS_SYSVAR)]
    pub instructions: UncheckedAccount<'info>,
}

#[derive(Accounts)]
pub struct Settle<'info> {
    pub settler: Signer<'info>,
    #[account(seeds = [CONFIG_SEED], bump = config.bump, has_one = settler @ HourlyError::Unauthorized)]
    pub config: Account<'info, Config>,
    #[account(mut, has_one = config)]
    pub series: Box<Account<'info, Series>>,
}

#[derive(Accounts)]
pub struct Redeem<'info> {
    pub holder: Signer<'info>,
    #[account(seeds = [CONFIG_SEED], bump = config.bump)]
    pub config: Account<'info, Config>,
    #[account(has_one = config, has_one = long_mint, has_one = vault)]
    pub series: Box<Account<'info, Series>>,
    #[account(mut)]
    pub long_mint: Box<Account<'info, Mint>>,
    #[account(mut)]
    pub vault: Box<Account<'info, TokenAccount>>,
    #[account(mut, token::mint = long_mint, token::authority = holder)]
    pub holder_long: Box<Account<'info, TokenAccount>>,
    #[account(mut, token::mint = config.quote_mint)]
    pub holder_quote: Box<Account<'info, TokenAccount>>,
    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct Reclaim<'info> {
    pub writer: Signer<'info>,
    #[account(seeds = [CONFIG_SEED], bump = config.bump)]
    pub config: Account<'info, Config>,
    #[account(has_one = config, has_one = vault)]
    pub series: Box<Account<'info, Series>>,
    #[account(mut)]
    pub vault: Box<Account<'info, TokenAccount>>,
    #[account(mut, token::mint = config.quote_mint, token::authority = writer)]
    pub writer_quote: Box<Account<'info, TokenAccount>>,
    #[account(mut, seeds = [POSITION_SEED, series.key().as_ref(), writer.key().as_ref()], bump = position.bump, has_one = writer, has_one = series)]
    pub position: Box<Account<'info, Position>>,
    pub token_program: Program<'info, Token>,
}


#[derive(Accounts)]
#[instruction(epoch: u32)]
pub struct CreateVault<'info> {
    #[account(mut)]
    pub lister: Signer<'info>,
    #[account(seeds = [CONFIG_SEED], bump = config.bump, has_one = lister @ HourlyError::Unauthorized, has_one = quote_mint)]
    pub config: Box<Account<'info, Config>>,
    pub quote_mint: Box<Account<'info, Mint>>,
    #[account(init, payer = lister, space = 8 + LpVault::INIT_SPACE, seeds = [LPV_SEED, config.key().as_ref(), &epoch.to_le_bytes()], bump)]
    pub lp_vault: Box<Account<'info, LpVault>>,
    #[account(init, payer = lister, seeds = [LPV_SHARES_SEED, lp_vault.key().as_ref()], bump, mint::decimals = 6, mint::authority = lp_vault)]
    pub share_mint: Box<Account<'info, Mint>>,
    #[account(init, payer = lister, seeds = [LPV_CASH_SEED, lp_vault.key().as_ref()], bump, token::mint = quote_mint, token::authority = lp_vault)]
    pub cash: Box<Account<'info, TokenAccount>>,
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct VaultDeposit<'info> {
    pub depositor: Signer<'info>,
    #[account(seeds = [CONFIG_SEED], bump = config.bump)]
    pub config: Box<Account<'info, Config>>,
    #[account(mut, has_one = config, has_one = share_mint, has_one = cash)]
    pub lp_vault: Box<Account<'info, LpVault>>,
    #[account(mut)]
    pub share_mint: Box<Account<'info, Mint>>,
    #[account(mut)]
    pub cash: Box<Account<'info, TokenAccount>>,
    #[account(mut, token::mint = config.quote_mint, token::authority = depositor)]
    pub depositor_quote: Box<Account<'info, TokenAccount>>,
    #[account(mut, token::mint = share_mint, token::authority = depositor)]
    pub depositor_shares: Box<Account<'info, TokenAccount>>,
    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct VaultSell<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    pub quoter: Signer<'info>,
    pub taker: Signer<'info>,
    #[account(seeds = [CONFIG_SEED], bump = config.bump)]
    pub config: Box<Account<'info, Config>>,
    #[account(mut, has_one = config, has_one = quoter @ HourlyError::Unauthorized, has_one = cash)]
    pub lp_vault: Box<Account<'info, LpVault>>,
    #[account(mut)]
    pub cash: Box<Account<'info, TokenAccount>>,
    #[account(mut, address = config.treasury @ HourlyError::Unauthorized)]
    pub treasury: Box<Account<'info, TokenAccount>>,
    #[account(mut, has_one = config, has_one = long_mint, has_one = vault)]
    pub series: Box<Account<'info, Series>>,
    #[account(mut)]
    pub long_mint: Box<Account<'info, Mint>>,
    #[account(mut)]
    pub vault: Box<Account<'info, TokenAccount>>,
    #[account(mut, token::mint = config.quote_mint, token::authority = taker)]
    pub taker_quote: Box<Account<'info, TokenAccount>>,
    #[account(mut, token::mint = long_mint, token::authority = taker)]
    pub taker_long: Box<Account<'info, TokenAccount>>,
    #[account(init_if_needed, payer = payer, space = 8 + Position::INIT_SPACE,
        seeds = [POSITION_SEED, series.key().as_ref(), lp_vault.key().as_ref()], bump)]
    pub position: Box<Account<'info, Position>>,
    #[account(init_if_needed, payer = payer, space = 8 + VaultSeries::INIT_SPACE,
        seeds = [LPV_SERIES_SEED, lp_vault.key().as_ref(), series.key().as_ref()], bump)]
    pub vault_series: Box<Account<'info, VaultSeries>>,
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct VaultBuy<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    pub quoter: Signer<'info>,
    pub taker: Signer<'info>,
    #[account(seeds = [CONFIG_SEED], bump = config.bump)]
    pub config: Box<Account<'info, Config>>,
    #[account(mut, has_one = config, has_one = quoter @ HourlyError::Unauthorized, has_one = cash)]
    pub lp_vault: Box<Account<'info, LpVault>>,
    #[account(mut)]
    pub cash: Box<Account<'info, TokenAccount>>,
    #[account(mut, address = config.treasury @ HourlyError::Unauthorized)]
    pub treasury: Box<Account<'info, TokenAccount>>,
    #[account(mut, has_one = config, has_one = long_mint, has_one = vault)]
    pub series: Box<Account<'info, Series>>,
    #[account(mut)]
    pub long_mint: Box<Account<'info, Mint>>,
    #[account(mut)]
    pub vault: Box<Account<'info, TokenAccount>>,
    #[account(mut, token::mint = config.quote_mint, token::authority = taker)]
    pub taker_quote: Box<Account<'info, TokenAccount>>,
    #[account(init_if_needed, payer = payer, seeds = [LPV_LONG_SEED, lp_vault.key().as_ref(), series.key().as_ref()], bump,
        token::mint = long_mint, token::authority = lp_vault)]
    pub vault_long: Box<Account<'info, TokenAccount>>,
    #[account(init_if_needed, payer = payer, space = 8 + Position::INIT_SPACE,
        seeds = [POSITION_SEED, series.key().as_ref(), taker.key().as_ref()], bump)]
    pub position: Box<Account<'info, Position>>,
    #[account(init_if_needed, payer = payer, space = 8 + VaultSeries::INIT_SPACE,
        seeds = [LPV_SERIES_SEED, lp_vault.key().as_ref(), series.key().as_ref()], bump)]
    pub vault_series: Box<Account<'info, VaultSeries>>,
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct VaultCollect<'info> {
    #[account(seeds = [CONFIG_SEED], bump = config.bump)]
    pub config: Box<Account<'info, Config>>,
    #[account(mut, has_one = config, has_one = cash)]
    pub lp_vault: Box<Account<'info, LpVault>>,
    #[account(mut)]
    pub cash: Box<Account<'info, TokenAccount>>,
    #[account(has_one = config, has_one = long_mint, has_one = vault)]
    pub series: Box<Account<'info, Series>>,
    #[account(mut)]
    pub long_mint: Box<Account<'info, Mint>>,
    #[account(mut)]
    pub vault: Box<Account<'info, TokenAccount>>,
    #[account(mut, seeds = [LPV_SERIES_SEED, lp_vault.key().as_ref(), series.key().as_ref()], bump = vault_series.bump)]
    pub vault_series: Box<Account<'info, VaultSeries>>,
    #[account(mut, seeds = [LPV_LONG_SEED, lp_vault.key().as_ref(), series.key().as_ref()], bump)]
    pub vault_long: Option<Box<Account<'info, TokenAccount>>>,
    #[account(mut, seeds = [POSITION_SEED, series.key().as_ref(), lp_vault.key().as_ref()], bump = position.bump)]
    pub position: Option<Box<Account<'info, Position>>>,
    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct VaultWithdraw<'info> {
    pub owner: Signer<'info>,
    #[account(seeds = [CONFIG_SEED], bump = config.bump)]
    pub config: Box<Account<'info, Config>>,
    #[account(mut, has_one = config, has_one = share_mint, has_one = cash)]
    pub lp_vault: Box<Account<'info, LpVault>>,
    #[account(mut)]
    pub share_mint: Box<Account<'info, Mint>>,
    #[account(mut)]
    pub cash: Box<Account<'info, TokenAccount>>,
    #[account(mut, token::mint = share_mint, token::authority = owner)]
    pub owner_shares: Box<Account<'info, TokenAccount>>,
    #[account(mut, token::mint = config.quote_mint)]
    pub owner_quote: Box<Account<'info, TokenAccount>>,
    pub token_program: Program<'info, Token>,
}

#[cfg(test)]
mod math_tests {
    use super::*;
    #[test]
    fn payoffs() {
        // call spread: 2.60 strike, 0.40 cap, 720 hours
        assert_eq!(payoff_per_contract(KIND_CALL, 2_600_000, 400_000, 720, 2_500_000).unwrap(), 0);
        assert_eq!(payoff_per_contract(KIND_CALL, 2_600_000, 400_000, 720, 2_750_000).unwrap(), 150_000 * 720);
        assert_eq!(payoff_per_contract(KIND_CALL, 2_600_000, 400_000, 720, 9_000_000).unwrap(), 400_000 * 720);
        // put
        assert_eq!(payoff_per_contract(KIND_PUT, 2_400_000, 2_400_000, 720, 2_100_000).unwrap(), 300_000 * 720);
        assert_eq!(payoff_per_contract(KIND_PUT, 2_400_000, 2_400_000, 720, 2_500_000).unwrap(), 0);
        // digital pays only strictly above
        assert_eq!(payoff_per_contract(KIND_DIGITAL, 2_500_000, 1_000_000, 1, 2_500_000).unwrap(), 0);
        assert_eq!(payoff_per_contract(KIND_DIGITAL, 2_500_000, 1_000_000, 1, 2_500_001).unwrap(), 1_000_000);
        assert!(payoff_per_contract(9, 1, 1, 1, 1).is_err());
    }

    #[test]
    fn fee_math() {
        assert_eq!(fee_for(600_000, 100), 6_000); // 1% of $0.60
        assert_eq!(fee_for(99, 100), 0); // rounds down
        assert_eq!(fee_for(1_000_000, 0), 0);
        assert_eq!(fee_for(u64::MAX, 500), ((u64::MAX as u128) * 500 / 10_000) as u64);
    }

    #[test]
    fn oracle_value_conversion() {
        // 2.715 with 18 decimals -> 2_715_000 atoms
        assert_eq!(sb_value_to_atoms(2_715_000_000_000_000_000).unwrap(), 2_715_000);
        // 2.6928571428571428571 -> rounds to 2_692_857
        assert_eq!(sb_value_to_atoms(2_692_857_142_857_142_857).unwrap(), 2_692_857);
        // half-up rounding at the 7th decimal
        assert_eq!(sb_value_to_atoms(1_000_000_500_000_000_000).unwrap(), 1_000_001);
        assert!(sb_value_to_atoms(0).is_err());
        assert!(sb_value_to_atoms(-5).is_err());
        assert!(sb_value_to_atoms(400_000_000_000).is_err(), "rounds to zero atoms");
    }
}
