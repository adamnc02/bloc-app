// What Coach loads about its clients, from either source (live.ts, or the dev
// bypass's fixtures.ts). Column names are super-duper-octo-barnacle's `0022`
// and `0023` tables, camel-cased.
import type { BlocState, CycleReviewImage, Loose } from '@engine';
import type { AiData, AiDraft, AiEdit, AiOriginal, AiTool, CoachPublication } from '@/ai/types';

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
  /** The coach's private notes: never shown to the client (no policy admits them to the card). */
  notes: string | null;
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
  /** The client's own BLOC name, once linked: the client owns it. */
  profileName: { first: string | null; surname: string | null; preferred: string | null } | null;
  snapshot: ClientSnapshot | null;
  /** Why a linked client's upload couldn't be read, if it couldn't. */
  snapshotError: string | null;
}

export interface NewClient { name: string; contact: string; onApp: boolean }
/** A card edit. Name and contact only while the client isn't linked (0022's trigger refuses them after). */
export interface CardPatch { firstName?: string; surname?: string | null; email?: string | null; phone?: string | null; notes?: string | null }
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
  updateCard(cardId: string, patch: CardPatch): Promise<ClientCard>;
  /** Ends an active link (0022 `end_link`): consent goes off, the client's app returns to Solo. */
  endLink(cardId: string): Promise<void>;

  // Review's AI tools (TECHNICAL §141).
  /** The card's AI drafts, its `ai_response` / `note_reply` / `photo_request` publications with their receipts, and the client's submissions. */
  loadAi(cardId: string, clientId: string | null): Promise<AiData>;
  /** Saves a reply exactly as it came back (`coach_ai_drafts.original`, which can't change afterwards). */
  saveAiDraft(cardId: string, tool: AiTool, macroId: string | null, original: AiOriginal): Promise<AiDraft>;
  /** Saves the coach's edit beside the original. */
  saveAiEdit(draftId: string, edited: AiEdit, publicationId?: string): Promise<AiDraft>;
  /** Appends a publication to the card (0023: append-only; a correction names what it `supersedes`). */
  publish(cardId: string, type: 'ai_response' | 'note_reply' | 'photo_request', payload: Loose, supersedes: string | null): Promise<CoachPublication>;
  /** The client's cycle-review photos (`client-media`), readable only while photo consent is on. */
  loadPhotos(paths: string[]): Promise<CycleReviewImage[]>;
}
