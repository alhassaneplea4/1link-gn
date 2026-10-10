/**
 * Vérification d'un profil (badge « Profil vérifié »).
 * Le badge est décerné UNIQUEMENT par l'équipe de modération : un utilisateur ne peut pas se l'attribuer
 * (le champ `verified` du profil n'est jamais modifiable depuis l'éditeur, et le serveur doit l'ignorer à l'enregistrement).
 */
export const VERIFICATION_KINDS = ['person', 'business', 'organization'] as const;
export type VerificationKind = (typeof VERIFICATION_KINDS)[number];

export type VerificationStatus = 'none' | 'pending' | 'approved' | 'rejected';

export interface VerificationInput {
  kind: VerificationKind;
  /** Nom légal de la personne, de l'entreprise ou de l'organisation. */
  legalName: string;
  /** Numéro d'immatriculation (RCCM, NIF…), facultatif. */
  registryNumber: string;
  /** Lien public permettant de recouper l'identité (site officiel, page d'entreprise, registre). */
  proofUrl: string;
  note: string;
  /** Attestation sur l'honneur. */
  attest: boolean;
}

export interface VerificationRequest extends Omit<VerificationInput, 'attest'> {
  id: string;
  username: string;
  owner: string;
  status: Exclude<VerificationStatus, 'none'>;
  createdAt: string;
  decidedAt: string | null;
  decisionNote: string | null;
}

export interface VerificationState {
  status: VerificationStatus;
  request: VerificationRequest | null;
}

export type VerificationDecision = 'approve' | 'reject';
