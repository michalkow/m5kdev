import BIP32Factory from "bip32";
import * as bip39 from "bip39";
import * as bitcoin from "bitcoinjs-lib";
import * as ecc from "tiny-secp256k1";
import { ok } from "neverthrow";
import { BaseService } from "../base/base.service";
import type { ServerResult } from "../base/base.dto";
import type { CryptoRepository } from "./crypto.repository";
import type { BIP32Interface } from "bip32";

const BITCOIN_NATIVE_SEGWIT_PATH = "m/84'/0'/0'/0";

const bip32 = BIP32Factory(ecc);

export class CryptoService extends BaseService<
  { crypto: CryptoRepository },
  Record<string, never>
> {
  private root: BIP32Interface | null = null;

  private getRoot(): BIP32Interface {
    if (this.root) return this.root;
    const seed = process.env.BITCOIN_SEED;
    if (!seed?.trim()) {
      throw new Error("BITCOIN_SEED environment variable is not set");
    }
    if (!bip39.validateMnemonic(seed.trim())) {
      throw new Error("BITCOIN_SEED is not a valid BIP39 mnemonic");
    }
    const seedBuffer = bip39.mnemonicToSeedSync(seed.trim());
    this.root = bip32.fromSeed(seedBuffer);
    return this.root;
  }

  createBitcoinAddress(derivationIndex: number): ServerResult<string> {
    return this.throwable(() => {
      if (derivationIndex < 0 || !Number.isInteger(derivationIndex)) {
        return this.error("BAD_REQUEST", "derivationIndex must be a non-negative integer");
      }
      const root = this.getRoot();
      const path = `${BITCOIN_NATIVE_SEGWIT_PATH}/${derivationIndex}`;
      const child = root.derivePath(path);
      if (!child.publicKey) {
        return this.error("INTERNAL_SERVER_ERROR", "Failed to derive public key");
      }
      const payment = bitcoin.payments.p2wpkh({
        pubkey: child.publicKey,
        network: bitcoin.networks.bitcoin,
      });
      const address = payment.address;
      if (!address) {
        return this.error("INTERNAL_SERVER_ERROR", "Failed to generate address");
      }
      return ok(address);
    });
  }
}
