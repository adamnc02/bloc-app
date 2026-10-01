// ═══════════════════════════════════════════════════════════════════════
// The demo clients' cards on the demo coach (TECHNICAL §164). Every name, address
// and number is fictional: emails are on example.com, which is reserved and
// can never reach anyone, and phone numbers are Ofcom's drama range.
//
// `account`: a BLOC sign-in exists for this client. `link` is where the card
// stands with it: active, ended (the client left), an invite not yet
// redeemed, or none (not on the app). Casey is the existing test client
// (the Work sign-in), so Set up links him but never creates or deletes him.
// ═══════════════════════════════════════════════════════════════════════

export type DemoCardKey = 'maya' | 'tom' | 'grace' | 'priya' | 'casey' | 'ben' | 'sam' | 'hannah' | 'eileen';

export interface DemoCard {
  key: DemoCardKey;
  firstName: string;
  surname: string;
  email: string | null;
  phone: string | null;
  notes: string | null;
  ratePence: number | null;
  /** 'new': Set up creates the sign-in; 'existing': Casey's; null: none. */
  account: 'new' | 'existing' | null;
  link: 'active' | 'ended' | 'invite' | 'none';
  photoConsent: boolean;
}

export const DEMO_CARDS: DemoCard[] = [
  { key: 'maya', firstName: 'Maya', surname: 'Okafor', email: 'maya.okafor@example.com', phone: '07700 900111', notes: 'Shift work: trains early on weekdays. Old left knee niggle, fine on leg press.', ratePence: 4500, account: 'new', link: 'active', photoConsent: true },
  { key: 'tom', firstName: 'Tom', surname: 'Hartley', email: 'tom.hartley@example.com', phone: '07700 900222', notes: 'Runs his own programme; checks in with me monthly.', ratePence: 3000, account: 'new', link: 'active', photoConsent: false },
  { key: 'grace', firstName: 'Grace', surname: 'Lin', email: 'grace.lin@example.com', phone: null, notes: 'Online only: lives in Auckland (NZ time).', ratePence: 3500, account: 'new', link: 'active', photoConsent: true },
  { key: 'priya', firstName: 'Priya', surname: 'Shah', email: 'priya.shah@example.com', phone: '07700 900444', notes: 'Wedding in November.', ratePence: 4500, account: 'new', link: 'active', photoConsent: true },
  { key: 'casey', firstName: 'Casey', surname: 'Morgan', email: null, phone: null, notes: 'Weekends are the sticking point.', ratePence: 4500, account: 'existing', link: 'active', photoConsent: false },
  { key: 'ben', firstName: 'Ben', surname: 'Carter', email: 'ben.carter@example.com', phone: '07700 900666', notes: 'New client: first session next week.', ratePence: 4500, account: 'new', link: 'active', photoConsent: false },
  { key: 'sam', firstName: 'Sam', surname: 'Whitfield', email: 'sam.whitfield@example.com', phone: '07700 900777', notes: 'Invited after a trial session.', ratePence: null, account: null, link: 'invite', photoConsent: false },
  { key: 'hannah', firstName: 'Hannah', surname: 'Brooks', email: 'hannah.brooks@example.com', phone: '07700 900888', notes: 'Moved away; may come back in the new year.', ratePence: 4500, account: 'new', link: 'ended', photoConsent: false },
  { key: 'eileen', firstName: 'Eileen', surname: 'Moss', email: null, phone: '01632 960555', notes: 'Not on the app: I log everything in person. Mild osteoarthritis, both knees.', ratePence: 4000, account: null, link: 'none', photoConsent: false },
];

/**
 * Whether the demo is set up: EVERY demo card is registered. Casey's card outlives a Remove (his account stays), so
 * "any card" read a half-removed demo as set up and hid Set up, the one action that repairs it.
 */
export const isSetUp = (cards: Partial<Record<DemoCardKey, string>>) => DEMO_CARDS.every((c) => !!cards[c.key]);
