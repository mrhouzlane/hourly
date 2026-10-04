// Venue runtime: connection, keys, persisted state, transaction plumbing and
// chain reads. The venue pays every fee and rent so users never need SOL.
"use strict";
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const bs58 = require("bs58");
const {
  Connection, Keypair, PublicKey, Transaction, ComputeBudgetProgram, SystemProgram,
} = require("@solana/web3.js");
const spl = require("@solana/spl-token");
const chain = require("./chain");

const ROOT = path.join(__dirname, "..");
const CLUSTER = process.env.CLUSTER || "devnet";
const RPC_URL = process.env.RPC_URL || (CLUSTER === "devnet" ? "https://api.devnet.solana.com" : "http://127.0.0.1:8899");
const KEYS_DIR = process.env.KEYS_DIR || path.join(ROOT, "..", "keys");
const STATE_FILE = path.join(ROOT, "state", `${CLUSTER}.json`);
const ORACLE_QUEUE = new PublicKey(process.env.ORACLE_QUEUE || "EYiAmGSdsQTuCw413V5BzaruWuCCSDgTPtBGvLkXHbe7");

const conn = new Connection(RPC_URL, "confirmed");

function loadKey(name) {
  const raw = JSON.parse(fs.readFileSync(path.join(KEYS_DIR, `${name}.json`), "utf8"));
  return Keypair.fromSecretKey(Uint8Array.from(raw));
}
const keys = { admin: loadKey("admin"), maker: loadKey("maker"), settler: loadKey("settler") };

// ---------- persisted state ----------
let state = { cluster: CLUSTER, quoteMint: null, series: {}, settlements: [], fills: [] };
try { state = { ...state, ...JSON.parse(fs.readFileSync(STATE_FILE, "utf8")) }; } catch (_) { /* fresh */ }
function save() {
  fs.mkdirSync(path.dirname(STATE_FILE), { recursive: true });
  const tmp = `${STATE_FILE}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(state, null, 1));
  fs.renameSync(tmp, STATE_FILE);
}

// ---------- transactions ----------
const CU_PRICE = 10_000; // micro-lamports per CU; explicit so wallets leave the fee alone

function computeIxs(units = 200_000) {
  return [
    ComputeBudgetProgram.setComputeUnitLimit({ units }),
    ComputeBudgetProgram.setComputeUnitPrice({ microLamports: CU_PRICE }),
  ];
}

async function sendAndConfirm(tx, signers) {
  const { blockhash, lastValidBlockHeight } = await conn.getLatestBlockhash("confirmed");
  tx.recentBlockhash = blockhash;
  tx.feePayer = tx.feePayer || signers[0].publicKey;
  tx.sign(...signers);
  const sig = await conn.sendRawTransaction(tx.serialize(), { skipPreflight: false, maxRetries: 5 });
  const res = await conn.confirmTransaction({ signature: sig, blockhash, lastValidBlockHeight }, "confirmed");
  if (res.value.err) throw new Error(`tx ${sig} failed: ${JSON.stringify(res.value.err)}`);
  return sig;
}

async function send(ixs, signers, { units } = {}) {
  const tx = new Transaction().add(...computeIxs(units), ...ixs);
  tx.feePayer = keys.admin.publicKey;
  const all = [keys.admin, ...signers.filter((s) => !s.publicKey.equals(keys.admin.publicKey))];
  return sendAndConfirm(tx, all);
}

// Pending transactions that a user must co-sign. Keyed by id; the exact message
// bytes are pinned so a wallet cannot alter what the venue signed.
const pending = new Map();
const PENDING_TTL_MS = 90_000;

async function prepareUserTx({ ixs, user, venueSigners = [], meta = {}, units }) {
  const { blockhash, lastValidBlockHeight } = await conn.getLatestBlockhash("confirmed");
  const tx = new Transaction({ feePayer: keys.admin.publicKey, blockhash, lastValidBlockHeight })
    .add(...computeIxs(units), ...ixs);
  const signers = [keys.admin, ...venueSigners];
  tx.partialSign(...signers);
  const message = tx.serializeMessage();
  const id = crypto.randomBytes(12).toString("hex");
  pending.set(id, { message, user: new PublicKey(user), venueSigs: tx.signatures, blockhash, lastValidBlockHeight, meta, at: Date.now() });
  for (const [k, v] of pending) if (Date.now() - v.at > PENDING_TTL_MS) pending.delete(k);
  return {
    id,
    tx: tx.serialize({ requireAllSignatures: false, verifySignatures: false }).toString("base64"),
    message: message.toString("base64"),
  };
}

// Accepts either a wallet-signed transaction or a bare signature over the message.
async function submitUserTx({ id, tx, signature }) {
  const p = pending.get(id);
  if (!p) throw httpError(410, "This quote has expired. Ask for a new one.");
  let signed;
  if (tx) {
    signed = Transaction.from(Buffer.from(tx, "base64"));
    if (!signed.serializeMessage().equals(p.message)) throw httpError(400, "The wallet changed the transaction. Nothing was sent.");
  } else if (signature) {
    signed = Transaction.populate(require("@solana/web3.js").Message.from(p.message), []);
    for (const s of p.venueSigs) if (s.signature) signed.addSignature(s.publicKey, s.signature);
    signed.addSignature(p.user, Buffer.from(signature, "base64"));
  } else {
    throw httpError(400, "missing signed transaction");
  }
  const userSig = signed.signatures.find((s) => s.publicKey.equals(p.user));
  if (!userSig || !userSig.signature) throw httpError(400, "Your wallet did not sign.");
  if (!signed.verifySignatures()) throw httpError(400, "Signature check failed.");
  pending.delete(id);
  const sig = await conn.sendRawTransaction(signed.serialize(), { skipPreflight: false, maxRetries: 5 });
  const res = await conn.confirmTransaction({ signature: sig, blockhash: p.blockhash, lastValidBlockHeight: p.lastValidBlockHeight }, "confirmed");
  if (res.value.err) throw httpError(400, `Transaction failed on chain: ${JSON.stringify(res.value.err)}`);
  return { signature: sig, meta: p.meta };
}

function httpError(status, message) {
  const e = new Error(message);
  e.status = status;
  return e;
}

// ---------- reads ----------
async function readConfig() {
  const a = await conn.getAccountInfo(chain.configPda());
  return a ? chain.decodeConfig(a.data) : null;
}

async function readAllSeries() {
  const accts = await conn.getProgramAccounts(chain.PROGRAM_ID, {
    filters: [{ memcmp: { offset: 0, bytes: bs58.encode(chain.seriesDiscriminator()) } }],
  });
  return accts.map(({ pubkey, account }) => ({ pubkey, ...chain.decodeSeries(account.data) }));
}

async function tokenBalances(owner, mints) {
  // one RPC call for all of the owner's SPL token accounts
  const res = await conn.getParsedTokenAccountsByOwner(new PublicKey(owner), { programId: spl.TOKEN_PROGRAM_ID });
  const out = {};
  for (const { account } of res.value) {
    const info = account.data.parsed.info;
    out[info.mint] = (out[info.mint] || 0n) + BigInt(info.tokenAmount.amount);
  }
  if (mints) for (const m of mints) out[m] = out[m] || 0n;
  return out;
}

async function positions(owner, seriesKeys) {
  const pdas = seriesKeys.map((s) => chain.positionPda(s, owner));
  const out = {};
  for (let i = 0; i < pdas.length; i += 100) {
    const infos = await conn.getMultipleAccountsInfo(pdas.slice(i, i + 100));
    infos.forEach((a, j) => {
      if (a) out[seriesKeys[i + j].toBase58()] = chain.decodePosition(a.data).amount;
    });
  }
  return out;
}

// ---------- token helpers ----------
function ataIx(mint, owner) {
  const a = chain.ata(mint, owner);
  return { ata: a, ix: spl.createAssociatedTokenAccountIdempotentInstruction(keys.admin.publicKey, a, new PublicKey(owner), new PublicKey(mint)) };
}

async function createQuoteMint() {
  const mint = Keypair.generate();
  const lamports = await spl.getMinimumBalanceForRentExemptMint(conn);
  const ixs = [
    SystemProgram.createAccount({ fromPubkey: keys.admin.publicKey, newAccountPubkey: mint.publicKey, space: spl.MINT_SIZE, lamports, programId: spl.TOKEN_PROGRAM_ID }),
    spl.createInitializeMint2Instruction(mint.publicKey, 6, keys.admin.publicKey, null),
  ];
  await send(ixs, [mint]);
  return mint.publicKey;
}

async function mintQuote(owner, usd) {
  const mint = new PublicKey(state.quoteMint);
  const { ata, ix } = ataIx(mint, owner);
  const amount = BigInt(Math.round(usd * 1e6));
  return send([ix, spl.createMintToInstruction(mint, ata, keys.admin.publicKey, amount)], []);
}

const explorer = (sig) => `https://explorer.solana.com/tx/${sig}${CLUSTER === "devnet" ? "?cluster=devnet" : `?cluster=custom&customUrl=${encodeURIComponent(RPC_URL)}`}`;
const explorerAddr = (a) => `https://explorer.solana.com/address/${a}${CLUSTER === "devnet" ? "?cluster=devnet" : `?cluster=custom&customUrl=${encodeURIComponent(RPC_URL)}`}`;

module.exports = {
  CLUSTER, RPC_URL, ORACLE_QUEUE, conn, keys, get state() { return state; }, save,
  send, prepareUserTx, submitUserTx, httpError, readConfig, readAllSeries, tokenBalances, positions,
  ataIx, createQuoteMint, mintQuote, explorer, explorerAddr, computeIxs,
};
