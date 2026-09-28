// Coach's own domain types (PROMPT-03 Phase 5). The wireframes' domain/types.ts
// is reconciled with the engine's BlocState one screen at a time (proposal
// §12): only what a built screen reads lives here. The client's training and
// nutrition data is always the engine's `BlocState`, never a copy of it.

export type ISODate = string; // 'YYYY-MM-DD'

/** A client's link, as the coach sees it (proposal §5.3 Profile). */
export type LinkStatus = 'linked' | 'invited' | 'unlinked' | 'not-on-app';

/** The outcome every client list leads with (proposal §2.1). Computed from Review's model (5b). */
export type OutcomeStatus = 'on-track' | 'off-track' | 'no-data';
