/**
 * Clés d'accès (passkeys, WebAuthn). Une clé d'accès remplace le mot de passe ET le code : la clé privée ne quitte jamais l'appareil,
 * la signature est liée au site (résistante à l'hameçonnage) et l'appareil vérifie l'utilisateur (empreinte, visage, code). Ouvrir
 * une session par clé d'accès vaut donc deux facteurs : elle n'est jamais suivie d'une seconde étape.
 *
 * Les défis sont stockés côté serveur et à USAGE UNIQUE (lus et supprimés d'un seul coup, valables 5 minutes) : un défi rejoué ou
 * expiré est refusé. La bibliothèque est chargée à la demande : elle n'alourdit pas le démarrage des routes qui ne s'en servent pas.
 */
import { and, asc, eq, gt, isNull, sql } from 'drizzle-orm';
import type { AuthenticationResponseJSON, PublicKeyCredentialCreationOptionsJSON, PublicKeyCredentialRequestOptionsJSON, RegistrationResponseJSON } from '@simplewebauthn/server';
import type { Deps, UserRow } from '../context.js';
import { passkeys, users, webauthnChallenges } from '../db/schema.js';
import { newId } from '../lib/crypto.js';
import { badRequest, conflict, HttpError, notFound, unauthorized } from '../lib/errors.js';
import { uniqueViolation } from './accounts.js';

export const MAX_PASSKEYS_PER_USER = 10;
const CHALLENGE_TTL_MS = 5 * 60_000;
const RP_NAME = '1Link';

let lib: Promise<typeof import('@simplewebauthn/server')> | undefined;
const webauthn = () => (lib ??= import('@simplewebauthn/server'));

/** Site de confiance : l'identifiant (domaine) et les origines acceptées. L'origine de la requête n'est JAMAIS lue dans la requête. */
export function relyingParty(deps: Deps): { id: string; name: string; origins: string[] } {
  const url = new URL(deps.config.publicUrl);
  const origins = new Set([url.origin]);
  for (const extra of deps.config.allowedOrigins) {
    try {
      const o = new URL(extra);
      if (o.hostname === url.hostname || o.hostname.endsWith(`.${url.hostname}`)) origins.add(o.origin);
    } catch {
      /* origine mal formée : ignorée */
    }
  }
  return { id: url.hostname, name: RP_NAME, origins: [...origins] };
}

export interface PasskeyView {
  id: string;
  name: string;
  createdAt: string;
  lastUsedAt: string | null;
  deviceType: string;
  backedUp: boolean;
}

const view = (p: typeof passkeys.$inferSelect): PasskeyView => ({
  id: p.id, name: p.name, createdAt: p.createdAt.toISOString(), lastUsedAt: p.lastUsedAt?.toISOString() ?? null, deviceType: p.deviceType, backedUp: p.backedUp,
});

// — Défis à usage unique —

async function storeChallenge(deps: Deps, kind: 'register' | 'login', userId: string | null, challenge: string): Promise<string> {
  const id = newId('wc');
  await deps.db.insert(webauthnChallenges).values({ id, kind, userId, challenge, expiresAt: new Date(deps.now().getTime() + CHALLENGE_TTL_MS) });
  return id;
}

/** Lit ET supprime le défi (atomique) : un défi ne sert qu'une fois, et seulement pour le même genre d'opération et le même compte. */
async function takeChallenge(deps: Deps, id: string, kind: 'register' | 'login', userId: string | null): Promise<string | null> {
  const rows = await deps.db
    .delete(webauthnChallenges)
    .where(and(eq(webauthnChallenges.id, id), eq(webauthnChallenges.kind, kind), gt(webauthnChallenges.expiresAt, deps.now()), userId === null ? isNull(webauthnChallenges.userId) : eq(webauthnChallenges.userId, userId)))
    .returning({ challenge: webauthnChallenges.challenge });
  return rows[0]?.challenge ?? null;
}

// — Enrôlement (compte connecté, preuve d'identité exigée par la route) —

export async function beginRegistration(deps: Deps, user: UserRow): Promise<{ handle: string; options: PublicKeyCredentialCreationOptionsJSON }> {
  const rp = relyingParty(deps);
  const existing = await deps.db.select({ id: passkeys.id, transports: passkeys.transports }).from(passkeys).where(eq(passkeys.userId, user.id));
  if (existing.length >= MAX_PASSKEYS_PER_USER) throw conflict('passkey_limit');
  const { generateRegistrationOptions } = await webauthn();
  const options = await generateRegistrationOptions({
    rpName: rp.name, rpID: rp.id, userName: user.email ?? user.phone ?? user.id, userDisplayName: user.name, userID: new TextEncoder().encode(user.id),
    attestationType: 'none', // aucune attestation : on ne collecte pas de modèle d'appareil
    excludeCredentials: existing.map((p) => ({ id: p.id, transports: p.transports })), // pas deux fois la même clé
    // Clé « découvrable » (connexion sans saisir d'adresse) ET vérification de l'utilisateur obligatoire : c'est ce qui vaut deux facteurs.
    authenticatorSelection: { residentKey: 'required', userVerification: 'required' },
  });
  await deps.db.delete(webauthnChallenges).where(and(eq(webauthnChallenges.kind, 'register'), eq(webauthnChallenges.userId, user.id))); // un seul enrôlement en cours
  return { handle: await storeChallenge(deps, 'register', user.id, options.challenge), options };
}

const cleanName = (raw: string | undefined) => (raw ?? '').replace(/[\u0000-\u001F\u007F]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 60);

export async function finishRegistration(deps: Deps, user: UserRow, handle: string, response: RegistrationResponseJSON, name: string | undefined): Promise<PasskeyView> {
  const challenge = await takeChallenge(deps, handle, 'register', user.id);
  if (!challenge) throw badRequest('passkey_challenge_expired');
  const rp = relyingParty(deps);
  const { verifyRegistrationResponse } = await webauthn();
  let verified: Awaited<ReturnType<typeof verifyRegistrationResponse>>;
  try {
    verified = await verifyRegistrationResponse({ response, expectedChallenge: challenge, expectedOrigin: rp.origins, expectedRPID: rp.id, requireUserPresence: true, requireUserVerification: true });
  } catch {
    throw new HttpError(422, 'passkey_invalid');
  }
  if (!verified.verified) throw new HttpError(422, 'passkey_invalid');
  const { credential, credentialDeviceType, credentialBackedUp } = verified.registrationInfo;
  try {
    const [row] = await deps.db
      .insert(passkeys)
      .values({
        id: credential.id, userId: user.id, publicKey: Buffer.from(credential.publicKey).toString('base64url'), counter: credential.counter,
        transports: credential.transports ?? response.response.transports ?? [], deviceType: credentialDeviceType, backedUp: credentialBackedUp,
        name: cleanName(name) || 'Clé d’accès', createdAt: deps.now(),
      })
      .returning();
    return view(row!);
  } catch (e) {
    if (uniqueViolation(e)) throw conflict('passkey_exists');
    throw e;
  }
}

// — Connexion (anonyme) —

export async function beginLogin(deps: Deps): Promise<{ handle: string; options: PublicKeyCredentialRequestOptionsJSON }> {
  const rp = relyingParty(deps);
  const { generateAuthenticationOptions } = await webauthn();
  // Sans `allowCredentials` : l'appareil propose lui-même les clés de ce site (aucune adresse à saisir, aucune fuite sur l'existence d'un compte).
  const options = await generateAuthenticationOptions({ rpID: rp.id, userVerification: 'required' });
  return { handle: await storeChallenge(deps, 'login', null, options.challenge), options };
}

/** Vérifie la signature ; renvoie le compte propriétaire de la clé. Toute erreur de vérification est la même `invalid_passkey` (aucun détail). */
export async function finishLogin(deps: Deps, handle: string, response: AuthenticationResponseJSON): Promise<UserRow> {
  const challenge = await takeChallenge(deps, handle, 'login', null);
  if (!challenge) throw unauthorized('invalid_challenge');
  const [key] = await deps.db.select().from(passkeys).where(eq(passkeys.id, response.id)).limit(1);
  if (!key) throw unauthorized('invalid_passkey');
  const [user] = await deps.db.select().from(users).where(eq(users.id, key.userId)).limit(1);
  if (!user) throw unauthorized('invalid_passkey');
  // L'identifiant d'utilisateur que l'appareil renvoie doit être celui du propriétaire de la clé.
  const handleBytes = response.response.userHandle;
  if (handleBytes && Buffer.from(handleBytes, 'base64url').toString('utf8') !== user.id) throw unauthorized('invalid_passkey');

  const rp = relyingParty(deps);
  const { verifyAuthenticationResponse } = await webauthn();
  let verified: Awaited<ReturnType<typeof verifyAuthenticationResponse>>;
  try {
    verified = await verifyAuthenticationResponse({
      response, expectedChallenge: challenge, expectedOrigin: rp.origins, expectedRPID: rp.id, requireUserVerification: true,
      credential: { id: key.id, publicKey: Buffer.from(key.publicKey, 'base64url'), counter: key.counter, transports: key.transports },
    });
  } catch {
    throw unauthorized('invalid_passkey'); // signature, origine, défi, compteur en régression (clé clonée) : même réponse
  }
  if (!verified.verified) throw unauthorized('invalid_passkey');
  await deps.db
    .update(passkeys)
    .set({ counter: verified.authenticationInfo.newCounter, backedUp: verified.authenticationInfo.credentialBackedUp, lastUsedAt: deps.now() })
    .where(eq(passkeys.id, key.id));
  return user;
}

// — Gestion —

export async function listPasskeys(deps: Deps, userId: string): Promise<PasskeyView[]> {
  return (await deps.db.select().from(passkeys).where(eq(passkeys.userId, userId)).orderBy(asc(passkeys.createdAt))).map(view);
}

export async function removePasskey(deps: Deps, userId: string, id: string): Promise<void> {
  const removed = await deps.db.delete(passkeys).where(and(eq(passkeys.id, id), eq(passkeys.userId, userId))).returning({ id: passkeys.id });
  if (removed.length === 0) throw notFound('passkey');
}

export const passkeyCount = async (deps: Deps, userId: string): Promise<number> =>
  (await deps.db.select({ n: sql<number>`count(*)::int` }).from(passkeys).where(eq(passkeys.userId, userId)))[0]?.n ?? 0;
