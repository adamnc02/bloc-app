// Coach's own domain types: only what a built screen reads lives here. The client's training and
// nutrition data is always the engine's `BlocState`, never a copy of it.

export type ISODate = string; // 'YYYY-MM-DD'

/** A client's link, as the coach sees it. */
export type LinkStatus = 'linked' | 'invited' | 'unlinked' | 'not-on-app';

/** The outcome every client list leads with. Computed from Review's model, in the engine. */
export type { OutcomeStatus } from '@engine/review';
