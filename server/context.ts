import type { Context } from 'hono';
import type { AppConfig } from './config.js';
import type { Db } from './db/client.js';
import type { users } from './db/schema.js';
import type { Locale } from './lib/emails.js';
import type { Mailer } from './lib/mailer.js';
import type { OtpSender } from './lib/otp-sender.js';

export type UserRow = typeof users.$inferSelect;

/** Dépendances injectées : permettent de tester le serveur complet avec une vraie base et un faux fournisseur. */
export interface Deps {
  db: Db;
  config: AppConfig;
  mailer: Mailer;
  otp: OtpSender;
  /** Horloge injectable (expirations, fenêtres de débit). */
  now: () => Date;
  /** Prolonge la vie de la fonction serverless pour un travail non bloquant (journalisation). */
  defer: (work: Promise<unknown>) => void;
}

export interface AuthContext {
  user: UserRow;
  sessionId: string;
  username: string | null;
  planId: 'free' | 'pro' | 'business';
  expiresAt: Date;
}

export type HonoEnv = {
  Variables: {
    deps: Deps;
    ip: string;
    ua: string;
    locale: Locale;
    auth: AuthContext | null;
    requestId: string;
  };
};

export type C = Context<HonoEnv>;
