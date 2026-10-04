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
//! S is the settlement price posted by the settler: the average of the daily
//! index over [period_start, expiry], the same convention as ICE's OCPI futures.
//! The settler also stores a sha256 of the raw index data it averaged, so anyone
//! can recompute it. The settler is a trusted key in this version.
use anchor_lang::prelude::*;
use anchor_spl::token::{self, Burn, Mint, MintTo, Token, TokenAccount, Transfer};

declare_id!("givjbTiAfcwKbKhr5kztwgkkNGZj3E8eEceKnvio8Bf");

pub const CONFIG_SEED: &[u8] = b"config";
pub const SERIES_SEED: &[u8] = b"series";
pub const LONG_SEED: &[u8] = b"long";
pub const VAULT_SEED: &[u8] = b"vault";
pub const POSITION_SEED: &[u8] = b"pos";

pub const KIND_CALL: u8 = 0;
pub const KIND_PUT: u8 = 1;
pub const KIND_DIGITAL: u8 = 2;

#[program]
pub mod hourly {
    use super::*;

    pub fn init_config(ctx: Context<InitConfig>, settler: Pubkey) -> Result<()> {
        let c = &mut ctx.accounts.config;
        c.admin = ctx.accounts.admin.key();
        c.settler = settler;
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

    /// Settler posts the averaged index value once the window has closed.
    pub fn settle(ctx: Context<Settle>, price: u64, evidence: [u8; 32]) -> Result<()> {
        let now = Clock::get()?.unix_timestamp;
        let s = &mut ctx.accounts.series;
        require!(!s.settled, HourlyError::AlreadySettled);
        require!(now >= s.expiry, HourlyError::NotExpired);
        s.settle_price = price;
        s.evidence = evidence;
        s.payoff_per_contract = payoff_per_contract(s.kind, s.strike, s.cap, s.units, price)?;
        s.settled = true;
        emit!(Settled {
            series: s.key(),
            price,
            payoff_per_contract: s.payoff_per_contract,
        });
        Ok(())
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
#[instruction(underlying: [u8; 16], kind: u8, strike: u64, cap: u64, units: u64, period_start: i64, expiry: i64)]
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
}
