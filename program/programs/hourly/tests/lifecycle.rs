//! End-to-end tests of the Hourly program on LiteSVM.
//! Token state is written directly with set_account (packed SPL layouts),
//! so the tests depend only on the program and the stock SPL Token program.
use {
    anchor_lang::{
        prelude::{Clock, Pubkey},
        solana_program::instruction::Instruction,
        AccountDeserialize, InstructionData, ToAccountMetas,
    },
    hourly::{Config, Position, Series, KIND_CALL, KIND_DIGITAL, KIND_PUT},
    litesvm::LiteSVM,
    solana_keypair::Keypair,
    solana_message::{Message, VersionedMessage},
    solana_signer::Signer,
    solana_transaction::versioned::VersionedTransaction,
};

const TOKEN: Pubkey = anchor_spl::token::ID;
const SYSTEM: Pubkey = anchor_lang::system_program::ID;
const DAY: i64 = 86_400;
const T0: i64 = 1_791_158_400; // 2026-10-05 00:00 UTC
const FEED: [u8; 32] = [9u8; 32];
const SB_QUEUE: Pubkey = anchor_lang::pubkey!("EYiAmGSdsQTuCw413V5BzaruWuCCSDgTPtBGvLkXHbe7");
const FALLBACK: i64 = hourly::FALLBACK_DELAY;

struct Env {
    svm: LiteSVM,
    admin: Keypair,
    settler: Keypair,
    maker: Keypair,
    taker: Keypair,
    usdc: Pubkey,
    config: Pubkey,
}

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
    d[108] = 1; // AccountState::Initialized
    d
}

fn put_account(svm: &mut LiteSVM, key: Pubkey, data: Vec<u8>) {
    let lamports = svm.minimum_balance_for_rent_exemption(data.len());
    svm.set_account(
        key,
        solana_account::Account { lamports, data, owner: TOKEN, executable: false, rent_epoch: 0 },
    )
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

fn setup() -> Env {
    let mut svm = LiteSVM::new();
    let bytes = include_bytes!(concat!(env!("CARGO_TARGET_TMPDIR"), "/../deploy/hourly.so"));
    svm.add_program(hourly::id(), bytes).unwrap();
    let (admin, settler, maker, taker) = (Keypair::new(), Keypair::new(), Keypair::new(), Keypair::new());
    for k in [&admin, &settler, &maker, &taker] {
        svm.airdrop(&k.pubkey(), 10_000_000_000).unwrap();
    }
    set_time(&mut svm, T0);
    let usdc = Keypair::new().pubkey();
    put_account(&mut svm, usdc, pack_mint(&admin.pubkey(), 6));
    let config = Pubkey::find_program_address(&[hourly::CONFIG_SEED], &hourly::id()).0;
    let ix = Instruction::new_with_bytes(
        hourly::id(),
        &hourly::instruction::InitConfig { settler: settler.pubkey(), oracle_queue: SB_QUEUE }.data(),
        hourly::accounts::InitConfig { admin: admin.pubkey(), config, quote_mint: usdc, system_program: SYSTEM }
            .to_account_metas(None),
    );
    send(&mut svm, &[ix], &admin, &[&admin]).unwrap();
    Env { svm, admin, settler, maker, taker, usdc, config }
}

struct S {
    series: Pubkey,
    long_mint: Pubkey,
    vault: Pubkey,
}

fn underlying(name: &str) -> [u8; 16] {
    let mut u = [0u8; 16];
    u[..name.len()].copy_from_slice(name.as_bytes());
    u
}

fn create_series(e: &mut Env, signer_is_admin: bool, kind: u8, strike: u64, cap: u64, units: u64, start: i64, expiry: i64) -> Result<S, String> {
    let u = underlying("H100_SXM");
    let series = Pubkey::find_program_address(
        &[
            hourly::SERIES_SEED,
            e.config.as_ref(),
            &u,
            &[kind],
            &strike.to_le_bytes(),
            &cap.to_le_bytes(),
            &units.to_le_bytes(),
            &expiry.to_le_bytes(),
        ],
        &hourly::id(),
    )
    .0;
    let long_mint = Pubkey::find_program_address(&[hourly::LONG_SEED, series.as_ref()], &hourly::id()).0;
    let vault = Pubkey::find_program_address(&[hourly::VAULT_SEED, series.as_ref()], &hourly::id()).0;
    let who = if signer_is_admin { e.admin.insecure_clone() } else { e.maker.insecure_clone() };
    let ix = Instruction::new_with_bytes(
        hourly::id(),
        &hourly::instruction::CreateSeries { underlying: u, kind, strike, cap, units, period_start: start, expiry, feed_id: FEED }.data(),
        hourly::accounts::CreateSeries {
            admin: who.pubkey(),
            config: e.config,
            quote_mint: e.usdc,
            series,
            long_mint,
            vault,
            token_program: TOKEN,
            system_program: SYSTEM,
        }
        .to_account_metas(None),
    );
    send(&mut e.svm, &[ix], &who, &[&who])?;
    Ok(S { series, long_mint, vault })
}

fn position(series: &Pubkey, writer: &Pubkey) -> Pubkey {
    Pubkey::find_program_address(&[hourly::POSITION_SEED, series.as_ref(), writer.as_ref()], &hourly::id()).0
}

#[allow(clippy::too_many_arguments)]
fn fill(e: &mut Env, s: &S, buyer: &Keypair, seller: &Keypair, buyer_q: Pubkey, seller_q: Pubkey, buyer_long: Pubkey, qty: u64, premium: u64, quote_expiry: i64) -> Result<(), String> {
    let ix = Instruction::new_with_bytes(
        hourly::id(),
        &hourly::instruction::Fill { qty, premium, quote_expiry }.data(),
        hourly::accounts::Fill {
            payer: e.admin.pubkey(),
            buyer: buyer.pubkey(),
            seller: seller.pubkey(),
            config: e.config,
            series: s.series,
            long_mint: s.long_mint,
            vault: s.vault,
            buyer_quote: buyer_q,
            seller_quote: seller_q,
            buyer_long,
            position: position(&s.series, &seller.pubkey()),
            token_program: TOKEN,
            system_program: SYSTEM,
        }
        .to_account_metas(None),
    );
    let admin = e.admin.insecure_clone();
    send(&mut e.svm, &[ix], &admin, &[&admin, buyer, seller])
}

fn settle(e: &mut Env, s: &S, who: &Keypair, price: u64) -> Result<(), String> {
    let ix = Instruction::new_with_bytes(
        hourly::id(),
        &hourly::instruction::Settle { price, evidence: [7u8; 32] }.data(),
        hourly::accounts::Settle { settler: who.pubkey(), config: e.config, series: s.series }.to_account_metas(None),
    );
    send(&mut e.svm, &[ix], who, &[who])
}

fn settle_oracle(e: &mut Env, s: &S, queue: Pubkey) -> Result<(), String> {
    let ix = Instruction::new_with_bytes(
        hourly::id(),
        &hourly::instruction::SettleOracle { quote_ix_index: 0 }.data(),
        hourly::accounts::SettleOracle {
            config: e.config,
            series: s.series,
            queue,
            slothashes: hourly::SLOT_HASHES_SYSVAR,
            instructions: hourly::INSTRUCTIONS_SYSVAR,
        }
        .to_account_metas(None),
    );
    let admin = e.admin.insecure_clone();
    send(&mut e.svm, &[ix], &admin, &[&admin])
}

fn redeem(e: &mut Env, s: &S, holder: &Keypair, holder_long: Pubkey, holder_q: Pubkey, qty: u64) -> Result<(), String> {
    let ix = Instruction::new_with_bytes(
        hourly::id(),
        &hourly::instruction::Redeem { qty }.data(),
        hourly::accounts::Redeem {
            holder: holder.pubkey(),
            config: e.config,
            series: s.series,
            long_mint: s.long_mint,
            vault: s.vault,
            holder_long,
            holder_quote: holder_q,
            token_program: TOKEN,
        }
        .to_account_metas(None),
    );
    send(&mut e.svm, &[ix], holder, &[holder])
}

fn reclaim(e: &mut Env, s: &S, writer: &Keypair, writer_q: Pubkey) -> Result<(), String> {
    let ix = Instruction::new_with_bytes(
        hourly::id(),
        &hourly::instruction::Reclaim {}.data(),
        hourly::accounts::Reclaim {
            writer: writer.pubkey(),
            config: e.config,
            series: s.series,
            vault: s.vault,
            writer_quote: writer_q,
            position: position(&s.series, &writer.pubkey()),
            token_program: TOKEN,
        }
        .to_account_metas(None),
    );
    send(&mut e.svm, &[ix], writer, &[writer])
}

fn close(e: &mut Env, s: &S, writer: &Keypair, writer_long: Pubkey, writer_q: Pubkey, qty: u64) -> Result<(), String> {
    let ix = Instruction::new_with_bytes(
        hourly::id(),
        &hourly::instruction::Close { qty }.data(),
        hourly::accounts::Close {
            writer: writer.pubkey(),
            config: e.config,
            series: s.series,
            long_mint: s.long_mint,
            vault: s.vault,
            writer_long,
            writer_quote: writer_q,
            position: position(&s.series, &writer.pubkey()),
            token_program: TOKEN,
        }
        .to_account_metas(None),
    );
    send(&mut e.svm, &[ix], writer, &[writer])
}

fn read<T: AccountDeserialize>(svm: &LiteSVM, k: &Pubkey) -> T {
    let a = svm.get_account(k).unwrap();
    let mut d: &[u8] = &a.data;
    T::try_deserialize(&mut d).unwrap()
}


fn expect_code(r: Result<(), String>, code: &str) {
    match r {
        Ok(()) => panic!("expected failure {code}, got success"),
        Err(e) => assert!(e.contains(code), "expected {code}, got {}", &e[..e.len().min(400)]),
    }
}

const USD: u64 = 1_000_000;

#[test]
fn digital_full_lifecycle_pays_winner_and_returns_rest() {
    let mut e = setup();
    let cfg: Config = read(&e.svm, &e.config);
    assert_eq!(cfg.settler, e.settler.pubkey());
    let expiry = T0 + 5 * DAY;
    let s = create_series(&mut e, true, KIND_DIGITAL, 2_700_000, USD, 1, T0 + 4 * DAY, expiry).unwrap();
    let (maker, taker) = (e.maker.insecure_clone(), e.taker.insecure_clone());
    let mq = token_account(&mut e.svm, &e.usdc, &maker.pubkey(), 1_000 * USD);
    let tq = token_account(&mut e.svm, &e.usdc, &taker.pubkey(), 100 * USD);
    let tl = token_account(&mut e.svm, &s.long_mint, &taker.pubkey(), 0);

    // taker buys 50 YES at $0.42 each
    fill(&mut e, &s, &taker, &maker, tq, mq, tl, 50, 21 * USD, T0 + 30).unwrap();
    assert_eq!(balance(&e.svm, &tl), 50);
    assert_eq!(balance(&e.svm, &s.vault), 50 * USD);
    assert_eq!(balance(&e.svm, &tq), 79 * USD);
    assert_eq!(balance(&e.svm, &mq), 1_000 * USD - 50 * USD + 21 * USD);
    let ser: Series = read(&e.svm, &s.series);
    assert_eq!(ser.open_interest, 50);
    let pos: Position = read(&e.svm, &position(&s.series, &maker.pubkey()));
    assert_eq!(pos.amount, 50);

    // cannot settle early, cannot redeem before settlement
    let settler = e.settler.insecure_clone();
    expect_code(settle(&mut e, &s, &settler, 2_800_000), "Custom(6005)"); // NotExpired
    expect_code(redeem(&mut e, &s, &taker, tl, tq, 50), "Custom(6007)"); // NotSettled

    set_time(&mut e.svm, expiry);
    // the trusted settler is a fallback only: closed until FALLBACK_DELAY after expiry
    expect_code(settle(&mut e, &s, &settler, 2_800_000), "Custom(6014)"); // FallbackTooEarly
    // an oracle settlement from the wrong queue is rejected
    expect_code(settle_oracle(&mut e, &s, Keypair::new().pubkey()), "Custom(6011)"); // OracleVerify
    // a quote-less oracle settlement against the pinned queue fails (queue not present here)
    assert!(settle_oracle(&mut e, &s, SB_QUEUE).is_err());
    set_time(&mut e.svm, expiry + FALLBACK);
    // only the settler can settle
    expect_code(settle(&mut e, &s, &maker, 1), "Custom(6010)"); // Unauthorized
    settle(&mut e, &s, &settler, 2_800_000).unwrap();
    expect_code(settle(&mut e, &s, &settler, 2_000_000), "Custom(6006)"); // AlreadySettled
    let ser: Series = read(&e.svm, &s.series);
    assert!(ser.settled);
    assert!(!ser.settled_by_oracle);
    assert_eq!(ser.feed_id, FEED);
    assert_eq!(ser.payoff_per_contract, USD);
    assert_eq!(ser.evidence, [7u8; 32]);

    redeem(&mut e, &s, &taker, tl, tq, 50).unwrap();
    assert_eq!(balance(&e.svm, &tq), 79 * USD + 50 * USD);
    reclaim(&mut e, &s, &maker, mq).unwrap();
    assert_eq!(balance(&e.svm, &s.vault), 0, "vault fully paid out");
    expect_code(reclaim(&mut e, &s, &maker, mq), "Custom(6002)"); // BadQty
}

#[test]
fn call_spread_pays_capped_amount_and_vault_balances() {
    let mut e = setup();
    let expiry = T0 + 30 * DAY;
    // 720 GPU-hours, strike $2.60, cap $0.40 -> $288 collateral per contract
    let s = create_series(&mut e, true, KIND_CALL, 2_600_000, 400_000, 720, T0, expiry).unwrap();
    let (maker, taker) = (e.maker.insecure_clone(), e.taker.insecure_clone());
    let mq = token_account(&mut e.svm, &e.usdc, &maker.pubkey(), 10_000 * USD);
    let tq = token_account(&mut e.svm, &e.usdc, &taker.pubkey(), 1_000 * USD);
    let tl = token_account(&mut e.svm, &s.long_mint, &taker.pubkey(), 0);
    fill(&mut e, &s, &taker, &maker, tq, mq, tl, 3, 150 * USD, T0 + 30).unwrap();
    assert_eq!(balance(&e.svm, &s.vault), 3 * 288 * USD);

    set_time(&mut e.svm, expiry + FALLBACK);
    let settler = e.settler.insecure_clone();
    settle(&mut e, &s, &settler, 2_750_000).unwrap(); // average $2.75 -> $0.15/h -> $108 per contract
    redeem(&mut e, &s, &taker, tl, tq, 3).unwrap();
    assert_eq!(balance(&e.svm, &tq), 1_000 * USD - 150 * USD + 3 * 108 * USD);
    reclaim(&mut e, &s, &maker, mq).unwrap();
    assert_eq!(balance(&e.svm, &mq), 10_000 * USD + 150 * USD - 3 * 108 * USD);
    assert_eq!(balance(&e.svm, &s.vault), 0);
}

#[test]
fn put_out_of_the_money_returns_all_collateral_to_writer() {
    let mut e = setup();
    let expiry = T0 + 30 * DAY;
    let s = create_series(&mut e, true, KIND_PUT, 2_400_000, 500_000, 720, T0, expiry).unwrap();
    let (maker, taker) = (e.maker.insecure_clone(), e.taker.insecure_clone());
    // here the TAKER writes (a hedger selling the put is unusual, but the program is side-agnostic)
    let mq = token_account(&mut e.svm, &e.usdc, &maker.pubkey(), 1_000 * USD);
    let tq = token_account(&mut e.svm, &e.usdc, &taker.pubkey(), 1_000 * USD);
    let ml = token_account(&mut e.svm, &s.long_mint, &maker.pubkey(), 0);
    fill(&mut e, &s, &maker, &taker, mq, tq, ml, 2, 20 * USD, T0 + 30).unwrap();
    assert_eq!(balance(&e.svm, &tq), 1_000 * USD - 720 * USD + 20 * USD);
    set_time(&mut e.svm, expiry + FALLBACK);
    let settler = e.settler.insecure_clone();
    settle(&mut e, &s, &settler, 2_500_000).unwrap();
    redeem(&mut e, &s, &maker, ml, mq, 2).unwrap();
    assert_eq!(balance(&e.svm, &mq), 1_000 * USD - 20 * USD, "worthless put pays nothing");
    reclaim(&mut e, &s, &taker, tq).unwrap();
    assert_eq!(balance(&e.svm, &tq), 1_000 * USD + 20 * USD);
    assert_eq!(balance(&e.svm, &s.vault), 0);
}

#[test]
fn writer_can_close_with_own_longs_before_settlement() {
    let mut e = setup();
    let expiry = T0 + 30 * DAY;
    let s = create_series(&mut e, true, KIND_DIGITAL, 2_700_000, USD, 1, T0, expiry).unwrap();
    let (maker, taker) = (e.maker.insecure_clone(), e.taker.insecure_clone());
    let mq = token_account(&mut e.svm, &e.usdc, &maker.pubkey(), 100 * USD);
    let tq = token_account(&mut e.svm, &e.usdc, &taker.pubkey(), 100 * USD);
    let tl = token_account(&mut e.svm, &s.long_mint, &taker.pubkey(), 0);
    let ml = token_account(&mut e.svm, &s.long_mint, &maker.pubkey(), 0);
    fill(&mut e, &s, &taker, &maker, tq, mq, tl, 10, 5 * USD, T0 + 30).unwrap();
    // maker also buys 4 back from the taker's side by writing? No: maker buys 4 written by the taker.
    fill(&mut e, &s, &maker, &taker, mq, tq, ml, 4, 2 * USD, T0 + 30).unwrap();
    // maker holds 4 longs and is short 10: close 4
    close(&mut e, &s, &maker, ml, mq, 4).unwrap();
    let pos: Position = read(&e.svm, &position(&s.series, &maker.pubkey()));
    assert_eq!(pos.amount, 6);
    let ser: Series = read(&e.svm, &s.series);
    assert_eq!(ser.open_interest, 10 - 4 + 4);
    expect_code(close(&mut e, &s, &maker, ml, mq, 1), "Custom(1)"); // SPL insufficient funds on burn
    // vault = 6 (maker) + 4 (taker) contracts of $1
    assert_eq!(balance(&e.svm, &s.vault), 10 * USD);
}

#[test]
fn rejects_bad_fills_and_bad_listings() {
    let mut e = setup();
    let expiry = T0 + 5 * DAY;
    // only admin lists
    expect_code(create_series(&mut e, false, KIND_DIGITAL, 2_700_000, USD, 1, T0, expiry).map(|_| ()), "Custom(6010)");
    // put cap above strike rejected
    expect_code(create_series(&mut e, true, KIND_PUT, 1_000_000, 2_000_000, 720, T0, expiry).map(|_| ()), "Custom(6001)");
    // expiry in the past rejected
    expect_code(create_series(&mut e, true, KIND_CALL, 1_000_000, 1, 1, T0 - 10, T0 - 1).map(|_| ()), "Custom(6004)");
    let s = create_series(&mut e, true, KIND_DIGITAL, 2_700_000, USD, 1, T0, expiry).unwrap();
    let (maker, taker) = (e.maker.insecure_clone(), e.taker.insecure_clone());
    let mq = token_account(&mut e.svm, &e.usdc, &maker.pubkey(), 10 * USD);
    let tq = token_account(&mut e.svm, &e.usdc, &taker.pubkey(), 10 * USD);
    let tl = token_account(&mut e.svm, &s.long_mint, &taker.pubkey(), 0);
    let ml = token_account(&mut e.svm, &s.long_mint, &maker.pubkey(), 0);
    // stale quote
    expect_code(fill(&mut e, &s, &taker, &maker, tq, mq, tl, 1, USD / 2, T0 - 1), "Custom(6003)"); // StaleQuote
    // self trade
    expect_code(fill(&mut e, &s, &maker, &maker, mq, mq, ml, 1, 0, T0 + 30), "Custom(2040)"); // self-trade: duplicate mutable account guard fires before SelfTrade
    // seller lacks collateral: 11 contracts need $11
    expect_code(fill(&mut e, &s, &taker, &maker, tq, mq, tl, 11, 0, T0 + 30), "Custom(1)"); // SPL insufficient funds
    // buyer's long account must belong to the buyer
    expect_code(fill(&mut e, &s, &taker, &maker, tq, mq, ml, 1, 0, T0 + 30), "Custom(2015)"); // ConstraintTokenOwner
    // zero quantity
    expect_code(fill(&mut e, &s, &taker, &maker, tq, mq, tl, 0, 0, T0 + 30), "Custom(6002)"); // BadQty
    // nothing moved
    assert_eq!(balance(&e.svm, &s.vault), 0);
    assert_eq!(balance(&e.svm, &tq), 10 * USD);
    // after expiry no new fills
    set_time(&mut e.svm, expiry);
    expect_code(fill(&mut e, &s, &taker, &maker, tq, mq, tl, 1, 0, expiry + 30), "Custom(6004)"); // Expired
}
