// Independent verification of a NEP-413 signature in the browser: rebuild the exact bytes the
// signer hashed, then check the ed25519 signature against the public key with WebCrypto. Nothing
// here trusts the server's word that the signature is valid.

const B58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

export function b58decode(s: string): Uint8Array {
  const out: number[] = [];
  for (const ch of s) {
    let carry = B58.indexOf(ch);
    if (carry < 0) throw new Error("not base58");
    for (let i = 0; i < out.length; i++) {
      carry += out[i] * 58;
      out[i] = carry & 0xff;
      carry >>= 8;
    }
    while (carry > 0) {
      out.push(carry & 0xff);
      carry >>= 8;
    }
  }
  for (const ch of s) {
    if (ch !== "1") break;
    out.push(0);
  }
  return Uint8Array.from(out.reverse());
}

function b64decode(s: string): Uint8Array {
  const bin = atob(s);
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

const TAG = 2_147_484_061; // 2^31 + 413

function u32le(n: number): Uint8Array {
  const b = new Uint8Array(4);
  new DataView(b.buffer).setUint32(0, n, true);
  return b;
}

function concat(...parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

export interface SignedIntent {
  standard: string;
  payload: { recipient: string; nonce: string; message: string };
  public_key: string;
  signature: string;
}

export type Verification = { ok: true } | { ok: false; reason: string } | { unsupported: true };

export async function verifySigned(s: SignedIntent): Promise<Verification> {
  try {
    if (!globalThis.crypto?.subtle) return { unsupported: true };
    const enc = new TextEncoder();
    const msg = enc.encode(s.payload.message);
    const rcp = enc.encode(s.payload.recipient);
    const nonce = b64decode(s.payload.nonce);
    if (nonce.length !== 32) return { ok: false, reason: "nonce is not 32 bytes" };
    const bytes = concat(u32le(TAG), u32le(msg.length), msg, nonce, u32le(rcp.length), rcp, Uint8Array.of(0));
    const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes as BufferSource));
    const pub = b58decode(s.public_key.replace(/^ed25519:/, ""));
    const sig = b58decode(s.signature.replace(/^ed25519:/, ""));
    let key: CryptoKey;
    try {
      key = await crypto.subtle.importKey("raw", pub as BufferSource, { name: "Ed25519" }, false, ["verify"]);
    } catch {
      return { unsupported: true };
    }
    const ok = await crypto.subtle.verify({ name: "Ed25519" }, key, sig as BufferSource, digest as BufferSource);
    return ok ? { ok: true } : { ok: false, reason: "signature does not match this message and key" };
  } catch (e) {
    return { ok: false, reason: e instanceof Error ? e.message : "could not verify" };
  }
}

/** Reads the adapter's reply out of a payment's response_json, if it holds a signed intent. */
export function signedFrom(responseJson: string | undefined): SignedIntent | null {
  if (!responseJson) return null;
  try {
    const r = JSON.parse(responseJson);
    const s = r?.signed;
    return s && s.signature && s.payload?.message ? (s as SignedIntent) : null;
  } catch {
    return null;
  }
}
