import { useId, useState, type ReactNode } from 'react';
import { Avatar, Button, Chip, Field, Hero, Icon, Notice, Section, Sheet, Toast, useToast, type IconName } from '@/components/ui';
import { InviteSheet, InviteStatusSheet } from '@/coach/components/ClientSheets';
import { inviteLink } from '@/coach/screens/ClientsScreen';
import { useCoach } from '@/app/App';
import { fmt } from '@/lib/format';
import { localDateIn } from '@/lib/clientState';
import type { CardPatch, NewInvite } from '@/data/types';
import type { LinkStatus } from '@/domain/types';
import type { ClientView } from '@/coach/screens/ClientScreen';

const STATUS: Record<LinkStatus, { label: string; tone: 'good' | 'acc' | 'neutral' | 'amber'; icon: IconName }> = {
  linked: { label: 'Linked', tone: 'good', icon: 'link' },
  invited: { label: 'Invited', tone: 'acc', icon: 'clock' },
  unlinked: { label: 'Unlinked', tone: 'amber', icon: 'userMinus' },
  'not-on-app': { label: 'Not on the app', tone: 'neutral', icon: 'account' },
};

function FactRow({ icon, title, sub }: { icon: IconName; title: ReactNode; sub: ReactNode }) {
  return (
    <div style={{ display: 'flex', gap: 12, alignItems: 'center', padding: '10px 0' }}>
      <span className="icon-tile"><Icon name={icon} size={18} /></span>
      <span style={{ minWidth: 0 }}><b style={{ display: 'block', fontSize: 14.5 }}>{title}</b><small className="muted" style={{ fontSize: 12.5 }}>{sub}</small></span>
    </div>
  );
}

/**
 * Client → Profile: name and contact, link status, photo consent (read-only:
 * only the client can change it) and the coach's private notes. The card's
 * rate is stored (`rate_pence`) and not shown.
 *
 * 🚨 Once linked, the client's own BLOC profile owns their name and contact
 *    (0022's trigger refuses the coach's change), so they're read-only here and
 *    the name shown is theirs. The notes stay the coach's.
 */
export function ProfileTab({ v }: { v: ClientView }) {
  const { repo } = useCoach();
  const toast = useToast();
  const id = useId();
  const { bundle, summary: c, first } = v;
  const card = bundle.card;
  const linked = c.status === 'linked';
  const [contact, setContact] = useState({ first: card.firstName, surname: card.surname ?? '', email: card.email ?? '', phone: card.phone ?? '' });
  const [notes, setNotes] = useState(card.notes ?? '');
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<{ where: string; msg: string } | null>(null);
  const [sheet, setSheet] = useState<'unlink' | 'invite-status' | null>(null);
  const [invite, setInvite] = useState<NewInvite | null>(null);

  const run = async (where: string, fn: () => Promise<void>) => {
    setBusy(where); setErr(null);
    try { await fn(); } catch (e) { setErr({ where, msg: e instanceof Error ? e.message : String(e) }); } finally { setBusy(null); }
  };

  const contactPatch = (): CardPatch => {
    const p: CardPatch = {};
    const clean = (x: string) => x.trim() || null;
    if (contact.first.trim() !== card.firstName) p.firstName = contact.first.trim();
    if (clean(contact.surname) !== card.surname) p.surname = clean(contact.surname);
    if (clean(contact.email) !== card.email) p.email = clean(contact.email);
    if (clean(contact.phone) !== card.phone) p.phone = clean(contact.phone);
    return p;
  };
  const patch = contactPatch();
  const contactChanged = Object.keys(patch).length > 0;
  const notesChanged = (notes.trim() || null) !== (card.notes ?? null);

  const saveContact = () => run('contact', async () => { await repo.updateCard(card.id, patch); toast.show('Contact saved'); v.reload(); });
  const saveNotes = () => run('notes', async () => { await repo.updateCard(card.id, { notes: notes.trim() || null }); toast.show('Notes saved'); v.reload(); });
  const unlink = () => run('unlink', async () => { await repo.endLink(card.id); setSheet(null); toast.show(`${first} unlinked`); v.reload(); });
  const newInvite = () => run('invite', async () => { const inv = await repo.createInvite(card.id); setSheet(null); setInvite(inv); v.reload(); });

  const shownContact = linked ? [card.email, card.phone].filter(Boolean).join(' · ') : [contact.email, contact.phone].filter(Boolean).join(' · ');

  return (
    <>
      <Hero style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
        <Avatar initials={c.initials} size={64} solid />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="display" style={{ fontSize: 20, overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.name}</div>
          <div className="muted" style={{ marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis' }}>{shownContact || 'No contact details yet'}</div>
        </div>
        <Chip tone={STATUS[c.status].tone} icon={STATUS[c.status].icon}>{STATUS[c.status].label}</Chip>
      </Hero>

      <div className="grid-2">
        <Section i={2} title="Contact" sub={linked ? `${first} owns their name in BLOC. Email and phone are what you added.` : `${first}’s name and how to reach them.`}>
          <div className="card">
            {linked ? (
              <div className="list" style={{ padding: 0 }}>
                <FactRow icon="account" title={c.name} sub="Their name in BLOC" />
                <FactRow icon="message" title={card.email || 'No email'} sub="Email" />
                <FactRow icon="bell" title={card.phone || 'No phone'} sub="Phone" />
              </div>
            ) : (
              <>
                <div className="grid-2" style={{ gap: '0 12px' }}>
                  <Field label="First name" htmlFor={`${id}-f`}><input id={`${id}-f`} className="input" autoComplete="off" maxLength={80} value={contact.first} onChange={(e) => setContact({ ...contact, first: e.target.value })} /></Field>
                  <Field label="Surname" htmlFor={`${id}-s`}><input id={`${id}-s`} className="input" autoComplete="off" maxLength={80} value={contact.surname} placeholder="Not added" onChange={(e) => setContact({ ...contact, surname: e.target.value })} /></Field>
                </div>
                <Field label="Email" htmlFor={`${id}-e`}><input id={`${id}-e`} className="input" type="email" autoComplete="off" maxLength={254} value={contact.email} placeholder="Not added" onChange={(e) => setContact({ ...contact, email: e.target.value })} /></Field>
                <Field label="Phone" htmlFor={`${id}-p`}><input id={`${id}-p`} className="input num" type="tel" autoComplete="off" maxLength={40} value={contact.phone} placeholder="Not added" onChange={(e) => setContact({ ...contact, phone: e.target.value })} /></Field>
                {err?.where === 'contact' && <Notice icon="warning" tone="bad" title="Couldn’t save the contact" style={{ marginTop: 14 }}>{err.msg}</Notice>}
                <Button size="card" style={{ marginTop: 18 }} disabled={!contact.first.trim() || !contactChanged || busy === 'contact'} onClick={saveContact}>Save contact</Button>
              </>
            )}
          </div>
        </Section>

        <Section i={3} title="Link status" sub={
          linked ? `${first} uses BLOC, linked to you. Either of you can unlink.`
            : c.status === 'invited' ? `Waiting for ${first} to enter the code in BLOC.`
            : c.status === 'unlinked' ? `${first} is back to training solo. Invite them again to relink.`
            : `You book, plan and log for ${first} in person.`
        }>
          <div className="card">
            {linked && (
              <>
                <div className="list" style={{ padding: 0 }}>
                  <FactRow icon="link" title="Linked" sub={bundle.link?.linkedAt ? `Since ${fmt.ddm(bundle.link.linkedAt.slice(0, 10))}` : 'Linked with a code'} />
                  <FactRow icon="sync" title={c.syncedHoursAgo == null ? 'Not synced yet' : 'Syncing'} sub={`${fmt.ago(c.syncedHoursAgo)}${bundle.snapshot?.appVersion ? ` · BLOC ${bundle.snapshot.appVersion}` : ''}`} />
                  {c.tz && c.clientToday && <FactRow icon="clock" title={`${fmt.ddm(c.clientToday)} for them`} sub={c.tz} />}
                </div>
                <Button size="card" variant="danger" icon="userMinus" style={{ marginTop: 14 }} onClick={() => { setErr(null); setSheet('unlink'); }}>Unlink {first}</Button>
              </>
            )}
            {c.status === 'invited' && bundle.invite && (
              <>
                <FactRow icon="clock" title={Date.parse(bundle.invite.expiresAt) > repo.now() ? 'Invite sent' : 'Invite expired'} sub={`${Date.parse(bundle.invite.expiresAt) > repo.now() ? 'Expires' : 'Expired'} ${fmt.ddm(localDateIn(Intl.DateTimeFormat().resolvedOptions().timeZone, Date.parse(bundle.invite.expiresAt)))}`} />
                <Button size="card" variant="ghost" icon="link" style={{ marginTop: 14 }} onClick={() => { setErr(null); setSheet('invite-status'); }}>Make a new code</Button>
              </>
            )}
            {(c.status === 'not-on-app' || c.status === 'unlinked') && (
              <>
                {c.status === 'not-on-app' ? (
                  <div className="list" style={{ padding: 0 }}>
                    <FactRow icon="diary" title="Bookings, plans and logs" sub="You create and manage them yourself." />
                    <FactRow icon="tape" title="Measurements in person" sub="You record them at the studio." />
                    <FactRow icon="bell" title="Nothing is pushed" sub={`${first} gets no notifications.`} />
                  </div>
                ) : (
                  <p className="body-copy">Your plan and goal phases were removed from their app. They keep their own logs, and training done in your cycles stays in their history.</p>
                )}
                {err?.where === 'invite' && <Notice icon="warning" tone="bad" title="Couldn’t make the invite" style={{ marginTop: 14 }}>{err.msg}</Notice>}
                <Button size="card" variant="ghost" icon="userPlus" style={{ marginTop: 14 }} disabled={busy === 'invite'} onClick={newInvite}>Invite {first} to BLOC</Button>
              </>
            )}
          </div>
        </Section>

        {c.status !== 'unlinked' && (
          <Section i={4} title="Photo consent" sub={`Only ${first} can change this. You can see it, not edit it.`} slot={<Icon name="lock" size={16} className="t-acc" />}>
            <div className="card">
              <div className="row" style={{ minHeight: 44 }}>
                <span style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                  <span className="icon-tile"><Icon name="photo" size={18} /></span>
                  <span><b style={{ display: 'block', fontSize: 14.5 }}>Progress photos</b><small className="muted" style={{ fontSize: 12.5 }}>Read-only</small></span>
                </span>
                {linked && c.photoConsent
                  ? <Chip tone="good" icon="check">Allowed</Chip>
                  : <Chip tone="neutral" icon="close">{c.status === 'invited' ? 'Not chosen yet' : 'Not allowed'}</Chip>}
              </div>
              <p className="caption" style={{ marginTop: 12 }}>
                {linked
                  ? `${first} sets this in BLOC under Settings → Coaching. ${c.photoConsent ? 'Photos can be included in a cycle review.' : 'Photos are blocked from every cycle review.'}`
                  : c.status === 'invited'
                    ? `${first} chooses this when they link, on the consent screen in BLOC.`
                    : `Consent is given in BLOC. While ${first} isn’t on the app, photos stay off.`}
              </p>
            </div>
          </Section>
        )}

        <Section i={5} title="Private notes" sub={`Only you see these. They never reach ${first}’s app.`}>
          <div className="card">
            <Field label="Notes" htmlFor={`${id}-notes`}>
              <textarea id={`${id}-notes`} className="input" rows={5} maxLength={4000} value={notes} placeholder={`Anything worth remembering about ${first}.`} onChange={(e) => setNotes(e.target.value)} />
            </Field>
            {err?.where === 'notes' && <Notice icon="warning" tone="bad" title="Couldn’t save the notes" style={{ marginTop: 14 }}>{err.msg}</Notice>}
            <Button size="card" style={{ marginTop: 14 }} disabled={!notesChanged || busy === 'notes'} onClick={saveNotes}>Save notes</Button>
          </div>
        </Section>
      </div>

      <Sheet open={sheet === 'unlink'} onClose={() => setSheet(null)} title={`Unlink ${first}?`}>
        <p className="body-copy">It takes effect straight away, on both sides.</p>
        <div className="list" style={{ marginTop: 8 }}>
          <FactRow icon="userMinus" title={`${first} goes back to Solo`} sub="Your cycles and goal phases are removed from their app." />
          <FactRow icon="heart" title="They keep what’s theirs" sub="Weigh-ins, food, measurements, recipes and their food library." />
          <FactRow icon="train" title="Training history stays" sub="Sessions done in your cycles stay in their history." />
          <FactRow icon="lock" title="You lose access" sub={`You can no longer see ${first}’s data, and photo consent turns off.`} />
        </div>
        <Notice icon="warning" tone="bad" title="This can’t be undone" style={{ marginTop: 14 }}>To coach {first} again, you’d send a new invite.</Notice>
        {err?.where === 'unlink' && <Notice icon="warning" tone="bad" title="Couldn’t unlink" style={{ marginTop: 14 }}>{err.msg}</Notice>}
        <Button variant="danger" icon="userMinus" style={{ marginTop: 20 }} disabled={busy === 'unlink'} onClick={unlink}>Unlink {first}</Button>
      </Sheet>

      {sheet === 'invite-status' && bundle.invite && (
        <InviteStatusSheet
          open name={c.name} expiresAt={bundle.invite.expiresAt} now={repo.now()}
          onClose={() => setSheet(null)} onNewCode={newInvite} busy={busy === 'invite'} error={err?.where === 'invite' ? err.msg : null}
        />
      )}
      {invite && (
        <InviteSheet open name={c.name} code={invite.code} link={inviteLink(invite.code)} expiresAt={invite.expiresAt} onClose={() => setInvite(null)} onToast={toast.show} />
      )}
      <Toast msg={toast.msg} />
    </>
  );
}

