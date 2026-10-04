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

pub const CONFIG_SEED: &[u8] = b"config";
pub const SERIES_SEED: &[u8] = b"series";
pub const LONG_SEED: &[u8] = b"long";
pub const VAULT_SEED: &[u8] = b"vault";
pub const POSITION_SEED: &[u8] = b"pos";

pub const KIND_CALL: u8 = 0;
pub const KIND_PUT: u8 = 1;
pub const KIND_DIGITAL: u8 = 2;

pub const SLOT_HASHES_SYSVAR: Pubkey = pubkey!("SysvarS1otHashes111111111111111111111111111");
pub const INSTRUCTIONS_SYSVAR: Pubkey = pubkey!("Sysvar1nstructions1111111111111111111111111");

/// The trusted settler may act only this long after expiry.
pub const FALLBACK_DELAY: i64 = 72 * 3600;
/// Oracle quotes older than this many slots are rejected (about 60 s).
pub const MAX_QUOTE_AGE_SLOTS: u64 = 150;
/// Switchboard feed values are fixed point with 18 decimals; quote atoms use 6.
const SB_TO_ATOMS: i128 = 1_000_000_000_000;

#[program]
pub mod hourly {
    use super::*;

    pub fn init_config(ctx: Context<InitConfig>, settler: Pubkey, oracle_queue: Pubkey) -> Result<()> {
        let c = &mut ctx.accounts.config;
        c.admin = ctx.accounts.admin.key();
        c.settler = settler;
        c.oracle_queue = oracle_queue;
        c.quote_mint = ctx.accounts.quote_mint.key();
        c.bump = ctx.bumps.config;
        Ok(())
    }

    pub fn set_settler(ctx: Context<AdminOnly>, settler: Pubkey) -> Result<()> {
        ctx.accounts.config.settler = settler;
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
        require!(clock.unix_timestamp >= series.expiry, HourlyError::NotExpired);

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

#[event]
pub struct Filled {
    pub series: Pubkey,
    pub buyer: Pubkey,
    pub seller: Pubkey,
    pub qty: u64,
    pub premium: u64,
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
}

// ---------- accounts ----------

#[derive(Accounts)]
pub struct InitConfig<'info> {
    #[account(mut)]
    pub admin: Signer<'info>,
    #[account(init, payer = admin, space = 8 + Config::INIT_SPACE, seeds = [CONFIG_SEED], bump)]
    pub config: Account<'info, Config>,
    pub quote_mint: Box<Account<'info, Mint>>,
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
    pub admin: Signer<'info>,
    #[account(seeds = [CONFIG_SEED], bump = config.bump, has_one = admin @ HourlyError::Unauthorized, has_one = quote_mint)]
    pub config: Account<'info, Config>,
    pub quote_mint: Box<Account<'info, Mint>>,
    #[account(
        init,
        payer = admin,
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
        payer = admin,
        seeds = [LONG_SEED, series.key().as_ref()],
        bump,
        mint::decimals = 0,
        mint::authority = series,
    )]
    pub long_mint: Box<Account<'info, Mint>>,
    #[account(
        init,
        payer = admin,
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
    #[account(address = config.oracle_queue @ HourlyError::OracleVerify, owner = switchboard_on_demand::ON_DEMAND_DEVNET_PID @ HourlyError::OracleVerify)]
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
