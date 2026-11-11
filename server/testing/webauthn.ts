/**
 * Authentificateur WebAuthn VIRTUEL, pour les tests UNIQUEMENT (jamais importé par le code de production). Il fabrique de vraies
 * attestations et assertions — clé ECDSA P-256, signatures DER, structures CBOR — que la bibliothèque serveur vérifie exactement comme
 * celles d'un navigateur : aucune vérification n'est contournée ni simulée.
 */
import { createHash, generateKeyPairSync, randomBytes, sign, type KeyObject } from 'node:crypto';
import type { AuthenticationResponseJSON, PublicKeyCredentialCreationOptionsJSON, PublicKeyCredentialRequestOptionsJSON, RegistrationResponseJSON } from '@simplewebauthn/server';

const sha256 = (data: Uint8Array | Buffer) => createHash('sha256').update(data).digest();

/**
 * Encodeur CBOR minimal (entiers, texte, octets, tables) — suffisant pour une attestation. Volontairement autonome : l'encodeur de la
 * bibliothèque compare les types avec `instanceof` et refuse les `Uint8Array` d'un autre « royaume » JavaScript (cas de jsdom).
 */
function cborHead(major: number, n: number): Buffer {
  if (n < 24) return Buffer.from([(major << 5) | n]);
  if (n < 0x100) return Buffer.from([(major << 5) | 24, n]);
  if (n < 0x10000) {
    const b = Buffer.alloc(3);
    b[0] = (major << 5) | 25;
    b.writeUInt16BE(n, 1);
    return b;
  }
  const b = Buffer.alloc(5);
  b[0] = (major << 5) | 26;
  b.writeUInt32BE(n, 1);
  return b;
}
function cbor(value: unknown): Buffer {
  if (typeof value === 'number') return value >= 0 ? cborHead(0, value) : cborHead(1, -1 - value);
  if (typeof value === 'string') {
    const text = Buffer.from(value, 'utf8');
    return Buffer.concat([cborHead(3, text.length), text]);
  }
  if (Buffer.isBuffer(value) || ArrayBuffer.isView(value)) {
    const bytes = Buffer.from((value as Uint8Array).buffer, (value as Uint8Array).byteOffset, (value as Uint8Array).byteLength);
    return Buffer.concat([cborHead(2, bytes.length), bytes]);
  }
  if (value instanceof Map) return Buffer.concat([cborHead(5, value.size), ...[...value].flatMap(([k, v]) => [cbor(k), cbor(v)])]);
  throw new Error('type CBOR non géré dans l’authentificateur virtuel');
}
const b64 = (data: Uint8Array | Buffer) => Buffer.from(data).toString('base64url');

export interface VirtualOptions {
  origin: string;
  rpId: string;
  /** L'appareil vérifie l'utilisateur (empreinte, code). `false` : clé de présence seule, que le serveur doit refuser. */
  userVerification?: boolean;
}

export class VirtualAuthenticator {
  readonly credentialId = randomBytes(32);
  private readonly privateKey: KeyObject;
  private readonly publicJwk: { x: string; y: string };
  counter = 0;
  userHandle: Buffer | null = null;

  constructor(readonly opts: VirtualOptions, keys = generateKeyPairSync('ec', { namedCurve: 'P-256' })) {
    this.privateKey = keys.privateKey;
    const jwk = keys.publicKey.export({ format: 'jwk' }) as { x: string; y: string };
    this.publicJwk = { x: jwk.x, y: jwk.y };
  }

  get id(): string {
    return b64(this.credentialId);
  }

  private flags(base: number): number {
    return this.opts.userVerification === false ? base : base | 0x04; // 0x01 présence, 0x04 utilisateur vérifié, 0x40 données d'identifiant
  }

  private clientData(type: 'webauthn.create' | 'webauthn.get', challenge: string, origin = this.opts.origin): Buffer {
    return Buffer.from(JSON.stringify({ type, challenge, origin, crossOrigin: false }));
  }

  /** Clé publique au format COSE (EC2 / ES256 / P-256). */
  private coseKey(): Uint8Array {
    return cbor(new Map<number, number | Uint8Array>([
      [1, 2], [3, -7], [-1, 1], [-2, Buffer.from(this.publicJwk.x, 'base64url')], [-3, Buffer.from(this.publicJwk.y, 'base64url')],
    ]));
  }

  /** Répond à \`navigator.credentials.create(...)\`. */
  register(options: PublicKeyCredentialCreationOptionsJSON, over: { origin?: string; challenge?: string } = {}): RegistrationResponseJSON {
    this.userHandle = Buffer.from(options.user.id, 'base64url');
    const counter = Buffer.alloc(4);
    const idLen = Buffer.alloc(2);
    idLen.writeUInt16BE(this.credentialId.length);
    const authData = Buffer.concat([sha256(Buffer.from(this.opts.rpId)), Buffer.from([this.flags(0x41)]), counter, Buffer.alloc(16), idLen, this.credentialId, this.coseKey()]);
    const attestationObject = cbor(new Map<string, unknown>([['fmt', 'none'], ['attStmt', new Map()], ['authData', authData]]));
    return {
      id: this.id, rawId: this.id, type: 'public-key', authenticatorAttachment: 'platform', clientExtensionResults: {},
      response: {
        clientDataJSON: b64(this.clientData('webauthn.create', over.challenge ?? options.challenge, over.origin)),
        attestationObject: b64(attestationObject), transports: ['internal'],
      },
    };
  }

  /** Répond à \`navigator.credentials.get(...)\`. */
  authenticate(options: PublicKeyCredentialRequestOptionsJSON, over: { origin?: string; challenge?: string; counter?: number; userHandle?: Buffer | null } = {}): AuthenticationResponseJSON {
    this.counter = over.counter ?? this.counter + 1;
    const counter = Buffer.alloc(4);
    counter.writeUInt32BE(this.counter);
    const authData = Buffer.concat([sha256(Buffer.from(this.opts.rpId)), Buffer.from([this.flags(0x01)]), counter]);
    const clientDataJSON = this.clientData('webauthn.get', over.challenge ?? options.challenge, over.origin);
    const signature = sign('sha256', Buffer.concat([authData, sha256(clientDataJSON)]), this.privateKey); // ECDSA, signature DER
    const handle = over.userHandle === undefined ? this.userHandle : over.userHandle;
    return {
      id: this.id, rawId: this.id, type: 'public-key', clientExtensionResults: {},
      response: { clientDataJSON: b64(clientDataJSON), authenticatorData: b64(authData), signature: b64(signature), ...(handle ? { userHandle: b64(handle) } : {}) },
    };
  }
}

