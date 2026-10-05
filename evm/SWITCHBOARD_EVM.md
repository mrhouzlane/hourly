# Switchboard on EVM: why our update is rejected, and what would make it settle

Checked on 2026-10-05 (UTC). Every on-chain read was an `eth_call` or a local fork. Nothing was broadcast or deployed.

## Answer

**The cause is expired oracle-key registrations on Switchboard's EVM queues. The crossbar route, the bytes, the queue id and the chain id are all fine.**

The v2.0.0 verifier accepts a signature only when `SwitchboardQueue.isValidOracleSigningKey(signer)` holds, which means `block.timestamp <= oracleSigningKeys[signer] + maxAge`, with `maxAge` = 30 days. The signers crossbar uses are registered on each v2.0.0 queue (with two gaps, noted below). Switchboard's admin last refreshed those registrations long ago, so all of them are now expired:

| Chain | Switchboard | Queue | Keys | Registered | Expired | Crossbar signer registered? |
|---|---|---|---|---|---|---|
| Monad mainnet (143) | `0xB7F0…0E67` | `0x5E06…901e` | 12 | 2026-04-28 | 2026-05-28 | yes, all 4 mainnet signers seen today |
| Monad testnet (10143) | `0x6724…690C` | `0x1433…1948` | 7 | 2026-07-08 | 2026-08-07 | partly: `0x1033…F8F5` yes, `0x2d38…c747` (crossbar's most frequent testnet signer today) **no** |
| HyperEVM (999) | `0xcDb2…3347` | `0x81C4…07FB` | 12 | 2025-11-10 | 2025-12-10 | 3 of the 4 mainnet signers seen today; `0x7983…8b35` **no** |

The legacy "Diamond" deployments carry the same signer set with an expiry on each oracle, and those have lapsed as well:

| Chain | Diamond | Queue `0x8680…0752` oracles expire | Notes |
|---|---|---|---|
| Arbitrum One (42161) | `0xAd9b…7198` | 2026-01-20 (all 12) | It also does not speak the v2 `updateFeeds` format. It silently ignored our update (README). |
| Core (1116) | `0x33A5…2e6C` | 2026-01-20 (all 12) | Legacy Diamond. |
| Morph (2818) | `0x33A5…2e6C` | 2024-12-30 to 2025-01-04 (7 other keys) | Legacy Diamond. |
| Arbitrum Sepolia (421614) | `0xA2a0…3b3b` | 2024-09-12 to 2024-09-17 | Different queue ids. Crossbar's testnet queue `c947…a5b0` is not on it. |
| Core testnet (1114) | `0x2f83…2A76` | n/a | No code at the documented address. |
| Morph Holesky | `0x3c16…99e5` | n/a | The RPC host has no DNS. Not checked. |

**Working EVM settlement path today: none.** Registration is admin-only. `setOracleKeys(address[],uint64)` and `addOracleKey(address)` revert with `AccessControlUnauthorizedAccount` for any other caller, and the deployed queue has no permissionless attestation path that adds keys. Until Switchboard re-runs `setOracleKeys` on a chain, no update from any crossbar signer can verify there, whether the feed is ours or one of their own.

**Path once Switchboard refreshes keys: unchanged code.** `SwitchboardSettlementOracle.sol` plus `fetchV2Update(feedId, {chain: "evm", network, use_timestamp: true})` from `crossbar.switchboardlabs.xyz`. The fork tests below show this end to end on all three v2.0.0 chains.

## Evidence

### 1. Contract source and validation rules
- **VERIFIED** (npm `@switchboard-xyz/on-demand-solidity@1.1.0`, `contracts/{Switchboard,SwitchboardVerifier,SwitchboardQueue}.sol`, read 2026-10-05):
  - `Switchboard._processEncodedUpdate` → `verifier.verifyOracleSignatures` → `require(valid > 0, "No valid signatures")`.
  - The verifier builds the message as `sha256(slot u64 LE ‖ timestamp u64 LE ‖ [feedId 32 ‖ value i128 LE ‖ minSamples u8]*)`, recovers the signer with raw `ecrecover`, and counts it only if `switchboardQueue.isValidOracleSigningKey(signer)`.
  - There is **no chainId binding, no queue id in the message, and no freshness check** on the update. The only on-chain freshness rule is that a newer timestamp, or a higher slot at the same timestamp, replaces the stored value. Freshness is the consumer's job; our adapter enforces `notBefore` and `maxAge`.
  - The key registry lives in `SwitchboardQueue`: `oracleSigningKeys[addr] = registeredAt`, `maxAge = 30 days`, `setOracleKeys`/`addOracleKey` are `onlyAdmin`.
- **VERIFIED** (bytecode, 2026-10-05): the deployed contracts are ERC-1967 proxies. On Monad mainnet the implementations are Switchboard `0x140e…72fd`, verifier `0xb32e…864e` and queue `0xd24a…6db4`. Their selector sets match the npm source (`updateFeeds(bytes[])`, `getLatestValue`, `switchboardQueue()`, `setOracleKeys`, `oracleSigningKeys`, `isValidOracleSigningKey`, `cleanupExpiredOracleKeys`, …). The queue's storage slot 0 is `maxAge` and slot 2 is `oracleSigningKeys`; the fork test asserts both.
- **NOTE** (VERIFIED): the npm `SwitchboardVerifier` has `getSwitchboardQueue()`, but the deployed verifier does not, so that call reverts. Use `switchboardQueue()`. The old probe hit this revert, which is why it never reached the key registry.

### 2. What crossbar signs with
- **VERIFIED** (`node evm/scripts/sb-signers.mjs`, 2026-10-05 03:29 UTC, `https://crossbar.switchboardlabs.xyz`): 8 fresh `fetchV2Update(chain=evm)` responses for our feed `0xe627…84e3` all returned 2.715. The signers rotate among `0x2d38…c747`, `0x3a1d…a7d6`, `0xc2e5…8d11` and `0x7983…8b35` (mainnet queue `8680…0752`), and among `0x2d38…c747` and `0x1033…f8f5` (testnet queue `c947…a5b0`). All four mainnet signers are in the Monad mainnet list. HyperEVM lacks `0x7983…8b35`, and the Monad testnet list lacks `0x2d38…c747`. Even after a refresh, an update drawn from an unlisted signer would still fail there; the client would have to refetch until it gets a listed signer, or Switchboard would have to register the full set.
- **VERIFIED**: no other route, gateway or queue is needed. For the fixtures (signers `0xf9b0…15fe` mainnet and `0x7983…8b35` testnet), the signer is on the queue, and its registration timestamp is the only thing failing. The fork tests prove this. **NOT TRIED**: `crossbar.switchboard.xyz` (no DNS, see README) and `fetchGateways`. Neither can change the outcome, because any valid Switchboard signer is expired on-chain.

### 3. Docs and issues
- **VERIFIED** (https://docs.switchboard.xyz/docs-by-chain/evm.md, fetched 2026-10-05): the deployment table lists Arbitrum, Core, HyperEVM, Monad and Morph, and no Base. It says nothing about key refresh or expiry.
- **VERIFIED** (https://docs.switchboard.xyz/docs-by-chain/evm/hyperliquid, fetched 2026-10-05): it gives the crossbar URL `https://crossbar.switchboard.xyz` (no DNS from this host) and lists HyperEVM testnet as "TBD".
- **VERIFIED** (GitHub API, `switchboard-xyz/evm-on-demand`, 2026-10-05): the issues list is empty, and the last commit is dated 2025-03-04 (README). There is no public guidance on key refresh for EVM.
- **UNVERIFIED**: whether Switchboard still operates the EVM key relay at all, or plans to resume it. Only Switchboard can answer that. The newest feed update on Monad mainnet (2026-05-28, from the 2026-10-04 probe, not re-run today) matches the key expiry date to the day, which fits a relay that stopped after its last run on 2026-04-28.

### 4. Fork tests (`test/SwitchboardFork.t.sol`)
`SB_FORK=1 forge test --match-contract SwitchboardFork -vv` forks the real chain, wires a fresh `Hourly` to the **real** Switchboard contract through `SwitchboardSettlementOracle`, and replays the real crossbar bytes from `test/fixtures`. Per chain:
1. `test_fork_live_state_rejects_genuine_update`: `version()` is 2.0.0, and the genuine update reverts with `"No valid signatures"`.
2. `test_fork_cause_is_expired_key_registration`: the fixture's signer is registered (`oracleSigningKeys > 0`), the registration is older than `maxAge`, `isValidOracleSigningKey` is false, and the slot we overwrite is the one the getter reads.
3. `test_fork_refreshed_key_settles_genuine_and_rejects_tampered`: as deployed, settlement reverts `OracleVerify`. After the key timestamp is refreshed with `vm.store` (standing in for Switchboard's admin `setOracleKeys`), a tampered copy (value low byte flipped) still reverts `OracleVerify`, and the genuine bytes settle the series at 2_715_000 with payoff 115_000 × 48.

Result on 2026-10-05: **9 passed, 0 failed** (Monad 143, HyperEVM 999, Monad testnet 10143; the chain id is asserted on each fork). A plain `forge test` skips them and still gives **28 passed, 9 skipped**.

Caveat: step 3 changes one storage slot on a local fork. It proves our adapter and the bytes are correct. It does not prove Switchboard will refresh the keys.

## Options

1. **Ask Switchboard to refresh `setOracleKeys` on Monad (mainnet or testnet) or HyperEVM.** No code change is needed on our side. Ask them for a cadence too, since keys lapse every 30 days and our settlement would break again whenever their relay stalls.
2. **Keep `NoOracle` plus the 72 h backup settler** (current default) until (1) happens.
3. **Run our own verifier with the same oracle signatures** (not built). Deploy Switchboard's open-source Queue + Verifier + Switchboard from npm on any chain, Base included, and register crossbar's signer keys ourselves. The bytes would verify unchanged. The trust then moves from Switchboard's admin to ours for the key list. **UNVERIFIED**: whether those secp256k1 keys can be checked against the Solana queue's oracle accounts or TEE attestations, which would make the key list auditable instead of trusted.

## Reproduce
```bash
bash evm/scripts/sb-queue-keys.sh https://rpc.monad.xyz 0xB7F03eee7B9F56347e32cC71DaD65B303D5a0E67
bash evm/scripts/sb-queue-keys.sh https://rpc.hyperliquid.xyz/evm 0xcDb299Cb902D1E39F83F54c7725f54eDDa7F3347
bash evm/scripts/sb-queue-keys.sh https://testnet-rpc.monad.xyz 0x6724818814927e057a693f4e3A172b6cC1eA690C
APP_DIR=/path/to/app node evm/scripts/sb-signers.mjs
cd evm && SB_FORK=1 forge test --match-contract SwitchboardFork -vv
```
