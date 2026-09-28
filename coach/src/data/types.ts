// What Coach loads about its clients, from either source (live.ts, or the dev
// bypass's fixtures.ts). Column names are super-duper-octo-barnacle's `0022`
// and `0023` tables, camel-cased.
import type { BlocState } from '@engine';

export interface CoachProfile {
  coachId: string;
  displayName: string;
  businessName: string | null;
  /** `active | pending_approval | suspended` (0022). Any other than active switches access off. */
  status: 'active' | 'pending_approval' | 'suspended';
}

/** The coach's card for a client (`client_records`). */
export interface ClientCard {
  id: string;
  firstName: string;
  surname: string | null;
  email: string | null;
  phone: string | null;
  createdAt: string;
}

/** The link (`coach_clients`), if one was ever made. */
export interface ClientLink {
  clientId: string;
  status: 'pending' | 'active' | 'ended';
  photoConsent: boolean;
  linkedAt: string | null;
  endedAt: string | null;
}

/** The card's unused invite (`invite_codes`). The code itself is never readable (0022). */
export interface ClientInvite {
  expiresAt: string;
  createdAt: string;
}

/** The newest `client_state` upload, decoded. */
export interface ClientSnapshot {
  rev: number;
  hash: string;
  tz: string;
  uploadedAt: string;
  appVersion: string | null;
  state: BlocState;
}

export interface ClientBundle {
  card: ClientCard;
  link: ClientLink | null;
  invite: ClientInvite | null;
  /** The client's own BLOC name, once linked (proposal §11 Q12: the client owns it). */
  profileName: { first: string | null; surname: string | null; preferred: string | null } | null;
  snapshot: ClientSnapshot | null;
  /** Why a linked client's upload couldn't be read, if it couldn't. */
  snapshotError: string | null;
}

export interface NewClient { name: string; contact: string; onApp: boolean }
export interface NewInvite { code: string; expiresAt: string }

/** Everything the screens built so far ask of a data source. */
export interface CoachRepo {
  kind: 'live' | 'fixture';
  /** The coach's "now". Fixtures pin it to the demo dataset's anchor; live is the clock. */
  now(): number;
  loadClients(): Promise<ClientBundle[]>;
  addClient(input: NewClient): Promise<ClientCard>;
  createInvite(cardId: string): Promise<NewInvite>;
  updateProfile(displayName: string, businessName: string | null): Promise<CoachProfile>;
}
