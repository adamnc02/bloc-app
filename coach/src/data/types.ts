// What Coach loads about its clients, from either source (live.ts, or the dev
// bypass's fixtures.ts). Column names are super-duper-octo-barnacle's `0022`
// and `0023` tables, camel-cased.
import type { BlocState, CycleReviewImage, Loose } from '@engine';
import type { AiData, AiDraft, AiEdit, AiOriginal, AiTool, CoachPublication, Submission } from '@/ai/types';
import type { PlanDoc } from '@/plan/doc';
import type { Template, TemplateBody } from '@/plan/templates';
import type { LibraryEntry } from '@/plan/library';
import type { FlagLeave } from '@/review/effort';
import type { AssignedSession, Booking, DayOff, Diary, DiarySettings, SentBooking, Series, Slot, RequestStatus } from '@/diary/types';

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
  /**
   * When this card's most recent link ENDED (any link, even with a newer one
   * active). Unlinking removes the coach's plan from the client's phone, so
   * Plan ignores publications made before it (TECHNICAL §144).
   */
  lastEndedAt: string | null;
}

/** A plan draft (`coach_plan_drafts`): one cycle as the coach is editing it, before Publish. */
export interface PlanDraftBody {
  v: 1;
  doc: PlanDoc;
  /** The published cycle the draft started from (its JSON), to say when it has moved on since. */
  base: string | null;
}
export interface PlanDraft { id: string; cardId: string; macroId: string; body: PlanDraftBody; updatedAt: string }
export interface PlanData {
  /** This card's `plan`, `goal_phases` and `ai_response` publications, with their receipts. */
  publications: CoachPublication[];
  drafts: PlanDraft[];
}
export interface NewTemplate { kind: Template['kind']; name: string; summary: string | null; body: TemplateBody }

export interface NewClient { name: string; contact: string; onApp: boolean }

/** What Today reads across every card (TECHNICAL §154). */
export interface Inbox {
  /** `client_submissions` to this coach, with the sign-in that sent them. */
  submissions: (Submission & { clientId: string })[];
  /** `coach_ai_drafts`, every card. */
  drafts: AiDraft[];
  /** `plan`, `ai_response`, `note_reply`, `photo_request` and `session_log` publications, every card (a client not on the
   *  app has a plan only here, which Needs you's effort check folds, §163). */
  publications: (CoachPublication & { cardId: string })[];
  /** The flags the coach left (`coach_flag_dismissals`, 0034, §163). Absent: none. */
  leaves?: FlagLeave[];
  /** The Needs you items the coach dismissed (`coach_needs_dismissals`, 0036, §169). Absent: none. */
  dismissed?: NeedsDismissal[];
}
/** A dismissed Needs you item: its key in today/model.ts, and when (UTC). The client is never told. */
export interface NeedsDismissal { cardId: string; key: string; at: string }
/** A card edit. Name and contact only while the client isn't linked (0022's trigger refuses them after). */
export interface CardPatch { firstName?: string; surname?: string | null; email?: string | null; phone?: string | null; notes?: string | null }
export interface NewInvite { code: string; expiresAt: string }

/** The Diary's reads and writes (0024's diary tables and `session_requests`; TECHNICAL §152). */
export interface DiaryRepo {
  loadDiary(): Promise<Diary>;
  saveSettings(s: DiarySettings): Promise<void>;
  addDayOff(o: Omit<DayOff, 'id'>): Promise<DayOff>;
  deleteDayOff(id: string): Promise<void>;
  createSeries(s: Omit<Series, 'id'>): Promise<Series>;
  /** `clientIds` replaces the attendees. */
  updateSeries(id: string, patch: Partial<Omit<Series, 'id'>>): Promise<void>;
  createBooking(b: Omit<Booking, 'id'>): Promise<Booking>;
  updateBooking(id: string, patch: Partial<Omit<Booking, 'id' | 'seriesId' | 'occursOn' | 'assigned'>>): Promise<void>;
  /** The session assigned to one attendee of a booking, or null to release it (`diary_booking_clients.assigned_session`). */
  assignSession(bookingId: string, cardId: string, session: AssignedSession | null): Promise<void>;
  // 🚨 No delete for a series or a booking: a request names its booking (`on delete set null`), and a deleted row
  // leaves the request unbooked, which autoBook books again. Cancel instead (diary/actions.ts).
  /** The coach's half of a request (0024's trigger): propose a time, accept (naming the booking), or decline. */
  updateRequest(id: string, patch: { status?: Extract<RequestStatus, 'proposed' | 'accepted' | 'declined'>; proposed?: Slot | null; bookingId?: string | null }): Promise<void>;
  /** A `booking` publication to one card. */
  publishBooking(cardId: string, payload: Record<string, unknown>, supersedes: string | null): Promise<SentBooking>;
  /** Calls back when a client's request changes (Realtime); returns the unsubscribe. Fixtures: never. */
  watchRequests(onChange: () => void): () => void;
}

/** Everything the screens built so far ask of a data source. */
export interface CoachRepo extends DiaryRepo {
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
  publish(cardId: string, type: 'ai_response' | 'note_reply' | 'photo_request' | 'plan' | 'goal_phases' | 'session_log' | 'measurement', payload: Loose, supersedes: string | null): Promise<CoachPublication>;
  /** Every publication on a card, oldest first, with receipts: In person folds them over the client's upload (inperson/model.ts). */
  loadCardPublications(cardId: string): Promise<CoachPublication[]>;
  /** Today's inputs across every card: the client submissions, the AI drafts, and the publications Today reads. */
  loadInbox(): Promise<Inbox>;
  /** Leave a Needs you flag (0034): BLOC's hold stands; a further week the same way raises it again. */
  leaveFlag(l: FlagLeave): Promise<void>;
  /** Dismiss a Needs you item (0036): a note back or a check-in due. Nothing reaches the client. */
  dismissNeeds(cardId: string, key: string): Promise<void>;
  /** The client's cycle-review photos (`client-media`), readable only while photo consent is on. */
  loadPhotos(paths: string[]): Promise<CycleReviewImage[]>;

  // Plan and Library (TECHNICAL §144).
  loadPlan(cardId: string): Promise<PlanData>;
  /** One draft per (card, cycle): updated if there is one, else inserted. */
  savePlanDraft(cardId: string, macroId: string, body: PlanDraftBody): Promise<PlanDraft>;
  deletePlanDraft(draftId: string): Promise<void>;
  /** The coach's templates, with how often each was applied (all time, and in the last 90 days). */
  loadTemplates(): Promise<Template[]>;
  saveTemplate(t: NewTemplate): Promise<Template>;
  starTemplate(id: string, starred: boolean): Promise<void>;
  deleteTemplate(id: string): Promise<void>;
  /** A workout template's body replaced (its Group / Client type, §165). */
  updateTemplateBody(id: string, body: TemplateBody): Promise<void>;
  /** The coach's own exercise library (`coach_exercises`, 0035), as library entries (`source: 'mine'`). */
  loadExercises(): Promise<LibraryEntry[]>;
  /** Adds one to it; a name already there (whatever its case) is left as it is. */
  saveExercise(e: LibraryEntry): Promise<void>;
  /** Records a template applied to a card (`template_applications`), for "most used". */
  recordApplication(templateId: string, cardId: string): Promise<void>;
}
