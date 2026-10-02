# SourceGuard Project

SourceGuard is a compact GenLayer app for source-backed claim verification. Users prepare a claim attestation, inspect the deployed contract, and read the latest report from GenLayer Studio RPC.

## GenLayer Contract

- Contract: `0x326bC3E58Ea37bd288E4B15DF6848706C3ec5E4A`
- Explorer: `https://explorer-studio.genlayer.com/address/0x326bC3E58Ea37bd288E4B15DF6848706C3ec5E4A`
- Source: `https://github.com/burak33bb/sourceguard-claim-attestor`

## Project Flow

1. Enter a claim and source URLs.
2. Prepare the `attest` call for the deployed SourceGuard contract.
3. Read `get_latest_report` through GenLayer Studio RPC.
4. Open the contract in Explorer or Studio for writes.

## Files

- `public/index.html`
- `public/styles.css`
- `public/script.js`
