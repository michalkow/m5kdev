---
sidebar_position: 15
---

# Crypto module

The crypto module handles cryptocurrency payment addresses: it derives Bitcoin
receive addresses from an app seed and tracks payments in a dedicated table.

## Package map

| Package | What it owns |
| --- | --- |
| `@m5kdev/backend` | `CryptoModule`: `crypto_payments` table, repository, `CryptoService`. |

## Registration

```ts
import { CryptoModule } from "@m5kdev/backend/modules/crypto/crypto.module";

backendApp.use(new CryptoModule());
```

No tRPC surface — the service is consumed by app code.

## Service API

| Method | Description |
| --- | --- |
| `createBitcoinAddress(derivationIndex)` | Derive a Bitcoin address at the given index from the `BITCOIN_SEED` environment variable |

Payments are persisted in `crypto_payments` (amount, address, status) via the
repository; watching the chain and reconciling payments is app-level logic.

## Environment

| Variable | Purpose |
| --- | --- |
| `BITCOIN_SEED` | HD wallet seed used for address derivation — treat as a production secret |
