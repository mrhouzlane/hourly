// On-chain client for the Hourly program: PDAs, instruction encoders and
// account decoders. Discriminators and argument order come from the IDL that
// `anchor build` generated, so a program change that is not rebuilt fails loudly.
"use strict";
const fs = require("fs");
const path = require("path");
const {
  PublicKey,
  TransactionInstruction,
  SystemProgram,
} = require("@solana/web3.js");
const {
  TOKEN_PROGRAM_ID,
  getAssociatedTokenAddressSync,
} = require("@solana/spl-token");

const IDL = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "idl", "hourly.json"), "utf8"));
const PROGRAM_ID = new PublicKey(process.env.HOURLY_PROGRAM_ID || IDL.address);
const SLOT_HASHES = new PublicKey("SysvarS1otHashes111111111111111111111111111");
const INSTRUCTIONS = new PublicKey("Sysvar1nstructions1111111111111111111111111");
const KIND = { call: 0, put: 1, digital: 2 };
const KIND_NAME = ["call", "put", "digital"];

const IX = Object.fromEntries(IDL.instructions.map((i) => [i.name, i]));
const ACC = Object.fromEntries(IDL.accounts.map((a) => [a.name, Buffer.from(a.discriminator)]));

// ---------- little borsh writer ----------
const u8 = (v) => Buffer.from([v]);
const u64 = (v) => { const b = Buffer.alloc(8); b.writeBigUInt64LE(BigInt(v)); return b; };
const i64 = (v) => { const b = Buffer.alloc(8); b.writeBigInt64LE(BigInt(v)); return b; };
const pk = (k) => new PublicKey(k).toBuffer();
const fixed = (buf, n) => { const b = Buffer.alloc(n); Buffer.from(buf).copy(b, 0, 0, n); return b; };

function encodeArgs(ixName, args) {
  const def = IX[ixName];
  if (!def) throw new Error(`unknown instruction ${ixName}`);
  const parts = [Buffer.from(def.discriminator)];
  for (const a of def.args) {
    const v = args[a.name];
    if (v === undefined) throw new Error(`${ixName}: missing arg ${a.name}`);
    const t = a.type;
    if (t === "u8") parts.push(u8(v));
    else if (t === "u64") parts.push(u64(v));
    else if (t === "i64") parts.push(i64(v));
    else if (t === "pubkey") parts.push(pk(v));
    else if (t.array && t.array[0] === "u8") parts.push(fixed(v, t.array[1]));
    else throw new Error(`${ixName}: unsupported type ${JSON.stringify(t)}`);
  }
  return Buffer.concat(parts);
}

function buildIx(ixName, accounts, args) {
  const def = IX[ixName];
  const keys = def.accounts.map((a) => {
    const k = accounts[a.name];
    if (!k) throw new Error(`${ixName}: missing account ${a.name}`);
    return { pubkey: new PublicKey(k), isSigner: !!a.signer, isWritable: !!a.writable };
  });
  return new TransactionInstruction({ programId: PROGRAM_ID, keys, data: encodeArgs(ixName, args) });
}

// ---------- PDAs ----------
const find = (seeds) => PublicKey.findProgramAddressSync(seeds, PROGRAM_ID)[0];
const configPda = () => find([Buffer.from("config")]);
function underlyingBytes(name) {
  const b = Buffer.alloc(16);
  Buffer.from(name, "utf8").copy(b, 0, 0, 16);
  return b;
}
function seriesPda({ underlying, kind, strike, cap, units, expiry }) {
  return find([
    Buffer.from("series"),
    configPda().toBuffer(),
    underlyingBytes(underlying),
    Buffer.from([kind]),
    u64(strike),
    u64(cap),
    u64(units),
    i64(expiry),
  ]);
}
const longMintPda = (series) => find([Buffer.from("long"), new PublicKey(series).toBuffer()]);
const vaultPda = (series) => find([Buffer.from("vault"), new PublicKey(series).toBuffer()]);
const positionPda = (series, writer) =>
  find([Buffer.from("pos"), new PublicKey(series).toBuffer(), new PublicKey(writer).toBuffer()]);
const ata = (mint, owner) => getAssociatedTokenAddressSync(new PublicKey(mint), new PublicKey(owner), true);

// ---------- instructions ----------
function initConfig({ admin, settler, oracleQueue, quoteMint }) {
  return buildIx("init_config",
    { admin, config: configPda(), quote_mint: quoteMint, system_program: SystemProgram.programId },
    { settler, oracle_queue: oracleQueue });
}

function createSeries({ admin, quoteMint, underlying, kind, strike, cap, units, periodStart, expiry, feedId }) {
  const series = seriesPda({ underlying, kind, strike, cap, units, expiry });
  const ix = buildIx("create_series", {
    admin, config: configPda(), quote_mint: quoteMint, series,
    long_mint: longMintPda(series), vault: vaultPda(series),
    token_program: TOKEN_PROGRAM_ID, system_program: SystemProgram.programId,
  }, {
    underlying: underlyingBytes(underlying), kind, strike, cap, units,
    period_start: periodStart, expiry, feed_id: feedId,
  });
  return { ix, series, longMint: longMintPda(series), vault: vaultPda(series) };
}

function fill({ payer, buyer, seller, series, quoteMint, qty, premium, quoteExpiry }) {
  const longMint = longMintPda(series);
  return buildIx("fill", {
    payer, buyer, seller, config: configPda(), series, long_mint: longMint, vault: vaultPda(series),
    buyer_quote: ata(quoteMint, buyer), seller_quote: ata(quoteMint, seller), buyer_long: ata(longMint, buyer),
    position: positionPda(series, seller), token_program: TOKEN_PROGRAM_ID, system_program: SystemProgram.programId,
  }, { qty, premium, quote_expiry: quoteExpiry });
}

function close({ writer, series, quoteMint, qty }) {
  const longMint = longMintPda(series);
  return buildIx("close", {
    writer, config: configPda(), series, long_mint: longMint, vault: vaultPda(series),
    writer_long: ata(longMint, writer), writer_quote: ata(quoteMint, writer),
    position: positionPda(series, writer), token_program: TOKEN_PROGRAM_ID,
  }, { qty });
}

function redeem({ holder, series, quoteMint, qty }) {
  const longMint = longMintPda(series);
  return buildIx("redeem", {
    holder, config: configPda(), series, long_mint: longMint, vault: vaultPda(series),
    holder_long: ata(longMint, holder), holder_quote: ata(quoteMint, holder), token_program: TOKEN_PROGRAM_ID,
  }, { qty });
}

function reclaim({ writer, series, quoteMint }) {
  return buildIx("reclaim", {
    writer, config: configPda(), series, vault: vaultPda(series),
    writer_quote: ata(quoteMint, writer), position: positionPda(series, writer), token_program: TOKEN_PROGRAM_ID,
  }, {});
}

function settleFallback({ settler, series, price, evidence }) {
  return buildIx("settle", { settler, config: configPda(), series }, { price, evidence });
}

function settleOracle({ series, queue, quoteIxIndex }) {
  return buildIx("settle_oracle", {
    config: configPda(), series, queue, slothashes: SLOT_HASHES, instructions: INSTRUCTIONS,
  }, { quote_ix_index: quoteIxIndex });
}

// ---------- decoders ----------
class Reader {
  constructor(buf) { this.b = buf; this.o = 0; }
  u8() { return this.b.readUInt8(this.o++); }
  bool() { return this.u8() !== 0; }
  u64() { const v = this.b.readBigUInt64LE(this.o); this.o += 8; return v; }
  i64() { const v = this.b.readBigInt64LE(this.o); this.o += 8; return v; }
  pk() { const v = new PublicKey(this.b.subarray(this.o, this.o + 32)); this.o += 32; return v; }
  bytes(n) { const v = Buffer.from(this.b.subarray(this.o, this.o + n)); this.o += n; return v; }
}

function checkDisc(buf, name) {
  if (!buf || buf.length < 8 || !buf.subarray(0, 8).equals(ACC[name])) throw new Error(`not a ${name} account`);
  return new Reader(buf.subarray(8));
}

function decodeConfig(buf) {
  const r = checkDisc(buf, "Config");
  return { admin: r.pk(), settler: r.pk(), quoteMint: r.pk(), oracleQueue: r.pk(), bump: r.u8() };
}

function decodeSeries(buf) {
  const r = checkDisc(buf, "Series");
  const s = {
    config: r.pk(),
    underlying: r.bytes(16).toString("utf8").replace(/\0+$/, ""),
    kind: r.u8(),
    strike: r.u64(), cap: r.u64(), units: r.u64(),
    periodStart: r.i64(), expiry: r.i64(),
    longMint: r.pk(), vault: r.pk(),
    openInterest: r.u64(),
    settled: r.bool(), settlePrice: r.u64(), evidence: r.bytes(32), payoffPerContract: r.u64(),
    feedId: r.bytes(32), settledByOracle: r.bool(), bump: r.u8(),
  };
  s.kindName = KIND_NAME[s.kind];
  return s;
}

function decodePosition(buf) {
  const r = checkDisc(buf, "Position");
  return { writer: r.pk(), series: r.pk(), amount: r.u64(), bump: r.u8() };
}

const seriesDiscriminator = () => ACC.Series;

module.exports = {
  IDL, PROGRAM_ID, KIND, KIND_NAME, SLOT_HASHES, INSTRUCTIONS,
  configPda, seriesPda, longMintPda, vaultPda, positionPda, ata, underlyingBytes,
  initConfig, createSeries, fill, close, redeem, reclaim, settleFallback, settleOracle,
  decodeConfig, decodeSeries, decodePosition, seriesDiscriminator,
};
