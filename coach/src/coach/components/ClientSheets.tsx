import { useId, useState } from 'react';
import { Button, Field, Icon, IconButton, Notice, Sheet } from '@/components/ui';
import { fmt } from '@/lib/format';
import { localDateIn } from '@/lib/clientState';
import type { NewClient } from '@/data/types';

/** An instant as the coach's own calendar date, for "expires Mon 5 Oct". */
const coachDay = (iso: string) => fmt.ddm(localDateIn(Intl.DateTimeFormat().resolvedOptions().timeZone, Date.parse(iso)));

/**
 * + Add client (proposal §5.2; wireframe ClientSheets): creates the client's
 * card (`client_records`). "On the app?" decides what comes next: an invite
 * (code + link), or an in-person client the coach manages without the app (§5.7).
 */
export function AddClientSheet({ open, onClose, onAdd, busy, error }: { open: boolean; onClose: () => void; onAdd: (c: NewClient) => void; busy?: boolean; error?: string | null }) {
  const id = useId();
  const [name, setName] = useState('');
  const [contact, setContact] = useState('');
  const [onApp, setOnApp] = useState<boolean | null>(null);
  const ready = name.trim().length > 1 && contact.trim().length > 4 && onApp != null && !busy;
  return (
    <Sheet open={open} title="Add client" onClose={onClose}>
      <Field label="Name" htmlFor={`${id}-n`}>
        <input id={`${id}-n`} className="input box" autoComplete="off" maxLength={160} placeholder="First and last name" value={name} onChange={(e) => setName(e.target.value)} />
      </Field>
      <Field label="Email or phone" htmlFor={`${id}-c`}>
        <input id={`${id}-c`} className="input box" autoComplete="off" inputMode="email" maxLength={254} placeholder="name@example.com or 07700 900000" value={contact} onChange={(e) => setContact(e.target.value)} />
      </Field>
      <Field label="On the app?">
        <div className="pickgrid" role="group" aria-label="On the app?">
          <button type="button" className="pick" aria-pressed={onApp === true} onClick={() => setOnApp(true)}>
            <b>Yes, on BLOC</b><small>Send an invite code and link</small>
          </button>
          <button type="button" className="pick" aria-pressed={onApp === false} onClick={() => setOnApp(false)}>
            <b>Not on the app</b><small>In person. You log for them</small>
          </button>
        </div>
      </Field>
      {error && <Notice icon="warning" tone="bad" title="Couldn’t add the client" style={{ marginTop: 16 }}>{error}</Notice>}
      <Button style={{ marginTop: 22 }} disabled={!ready} onClick={() => onAdd({ name: name.trim(), contact: contact.trim(), onApp: !!onApp })}>
        {onApp === false ? 'Add client' : 'Add and invite'}
      </Button>
    </Sheet>
  );
}

async function copy(text: string) {
  try { await navigator.clipboard.writeText(text); return true; } catch { return false; }
}

/**
 * Invite (proposal §5.2): a single-use code and a share link, both expiring
 * 7 days after they're made (0022 `create_invite`). The code is shown ONCE:
 * only its hash is stored, so it can never be read back. The link opens BLOC,
 * which asks for consent naming the coach (BLOC v8.37, TECHNICAL §129).
 */
export function InviteSheet({ open, name, code, link, expiresAt, onClose, onToast }: {
  open: boolean; name: string; code: string; link: string; expiresAt: string; onClose: () => void; onToast: (msg: string) => void;
}) {
  const first = name.split(' ')[0];
  const share = async () => {
    const text = `Link to me as your coach in BLOC. Your code is ${code}.`;
    if (navigator.share) {
      try { await navigator.share({ title: 'BLOC coach invite', text, url: link }); return; } catch { /* cancelled */ }
    }
    onToast((await copy(`${text} ${link}`)) ? 'Invite copied. Paste it into a message' : 'Couldn’t copy. Share the code instead');
  };
  return (
    <Sheet open={open} title={`Invite ${first}`} onClose={onClose}>
      <p className="muted">{first} enters the code in BLOC, or taps the link, then agrees to share their data with you.</p>
      <div className="card" style={{ marginTop: 16, textAlign: 'center', background: 'var(--surface2)' }}>
        <span className="label">Invite code</span>
        <div className="row" style={{ justifyContent: 'center' }}>
          <span className="num display" style={{ fontSize: 34, letterSpacing: '.08em' }} aria-label={`Code ${code.split('').join(' ')}`}>{code}</span>
          <IconButton icon="copy" label="Copy code" inCard onClick={async () => onToast((await copy(code)) ? 'Code copied' : 'Couldn’t copy the code')} />
        </div>
        <div className="caption" style={{ marginTop: 8, display: 'inline-flex', gap: 6, alignItems: 'center' }}>
          <Icon name="clock" size={14} /> Single use · expires {coachDay(expiresAt)}, 7 days after sending
        </div>
      </div>
      <div style={{ marginTop: 18 }}><Field label="Share link" htmlFor="invite-link">
        <div className="inrow">
          <input id="invite-link" className="input box" value={link} readOnly onFocus={(e) => e.currentTarget.select()} />
          <IconButton icon="copy" label="Copy link" onClick={async () => onToast((await copy(link)) ? 'Link copied' : 'Couldn’t copy the link')} />
        </div>
      </Field></div>
      <p className="caption" style={{ marginTop: 12 }}>This is the only time the code is shown. If it’s lost, make a new one: the old code stops working.</p>
      <Button style={{ marginTop: 18 }} icon="share" onClick={share}>Share invite</Button>
    </Sheet>
  );
}

/**
 * An invited client who hasn't linked yet. The code was shown once and can't
 * be read back, so the coach can make a new one, which replaces it (0022:
 * one live code per card).
 */
export function InviteStatusSheet({ open, name, expiresAt, now, onClose, onNewCode, busy, error }: {
  open: boolean; name: string; expiresAt: string; now: number; onClose: () => void; onNewCode: () => void; busy?: boolean; error?: string | null;
}) {
  const first = name.split(' ')[0];
  const expired = Date.parse(expiresAt) <= now;
  return (
    <Sheet open={open} title={`${first} is invited`} onClose={onClose}>
      <Notice icon={expired ? 'warning' : 'clock'} tone={expired ? 'amber' : 'acc'} title={expired ? `The invite expired ${coachDay(expiresAt)}` : `The invite expires ${coachDay(expiresAt)}`}>
        {expired ? `${first} can’t link with it any more. Make a new code and send it.` : `${first} hasn’t linked yet. Codes are shown once, so if the last one was lost, make a new one.`}
      </Notice>
      {error && <Notice icon="warning" tone="bad" title="Couldn’t make a new code" style={{ marginTop: 16 }}>{error}</Notice>}
      <Button style={{ marginTop: 20 }} icon="link" disabled={busy} onClick={onNewCode}>Make a new code</Button>
      <p className="caption" style={{ marginTop: 10 }}>The old code stops working as soon as the new one is made.</p>
    </Sheet>
  );
}
