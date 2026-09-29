/**
 * Brand marks, from bloc-brand-rebuild (BLOC) and bloc-coach-1-rebuild-dune-italic
 * (Coach). Paths are the supplied outlines; fills read brand tokens so the
 * light-mode swaps in the READMEs apply (accent #2fb98a → #1b9e75,
 * neutral #3b4063 → #aab6c8, ink #F2F2F2 → #161826).
 */
const MARK = (
  <>
    <rect x="10" y="70.7" width="60" height="29.3" rx="7" fill="var(--brand-neutral)" />
    <rect x="22" y="35.3" width="60" height="29.3" rx="7" fill="var(--brand-neutral)" />
    <rect x="34" y="0" width="60" height="29.3" rx="7" fill="var(--brand-accent)" />
  </>
);
const BLOC_TYPE = (
  <>
    <path d="M0 100V0H47.2Q71.6 0 71.6 24.3V33Q71.6 38 68.7 41.4L63.6 47.5L69.7 52.6Q74.5 56.5 74.5 64.2V75.7Q74.5 100 50.1 100ZM20.9 81.2H49.3Q53.6 81.2 53.6 76.8V62.3Q53.6 58 49.3 58H20.9ZM20.9 39.1H46.4Q50.7 39.1 50.7 34.8V23.2Q50.7 18.8 46.4 18.8H20.9Z" fill="var(--brand-ink)" />
    <path d="M102.5 100V0H123.4V81.2H166.6V100Z" fill="var(--brand-ink)" />
    <path d="M188.5 75.7V24.3Q188.5 0 212.8 0H245.9Q270.2 0 270.2 24.3V75.7Q270.2 100 245.9 100H212.8Q188.5 100 188.5 75.7ZM209.3 76.8Q209.3 81.2 213.7 81.2H245Q249.3 81.2 249.3 76.8V23.2Q249.3 18.8 245 18.8H213.7Q209.3 18.8 209.3 23.2Z" fill="var(--brand-ink)" />
    <path d="M299.1 75.7V24.3Q299.1 0 323.4 0H362.1L371.8 7.5V18.8H324.3Q319.9 18.8 319.9 23.2V76.8Q319.9 81.2 324.3 81.2H371.8V92.5L362.1 100H323.4Q299.1 100 299.1 75.7Z" fill="var(--brand-ink)" />
  </>
);
const COACH_ITALIC = (
  <g transform="translate(0 122) scale(0.4200)">
    <g transform="skewX(-12)" fill="none" stroke="var(--brand-accent)" strokeWidth="6">
      <path d="M84.9 81.4A47 47 0 1 1 84.9 18.6" />
      <circle cx="177.9" cy="50" r="47" />
      <path d="M270.9 100L313.9 3L356.9 100M288.2 68H339.7" strokeLinejoin="round" />
      <path d="M484.9 81.4A47 47 0 1 1 484.9 18.6" />
      <path d="M530.9 0V100M598.9 0V100M530.9 50H598.9" />
    </g>
  </g>
);

export function BlocMark({ size = 32 }: { size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 116 116" role="img" aria-label="BLOC"><g transform="translate(8 8)">{MARK}</g></svg>;
}

export function BlocLogo({ height = 28 }: { height?: number }) {
  return (
    <svg height={height} viewBox="0 0 555.8 148" role="img" aria-label="BLOC">
      <g transform="translate(24 24)"><g>{MARK}</g><g transform="translate(136 0)">{BLOC_TYPE}</g></g>
    </svg>
  );
}

/** BLOC Coach lock-up: mark + BLOC + COACH in Dune hairline italic. */
/**
 * `fill`: the artwork spans its container's full width, edge to edge (the
 * padding is cropped to the artwork's measured bounds, 34 24 501.8 164), e.g. the sign-in screen, where the
 * logo is as wide as the buttons below it.
 */
export function CoachLogo({ height = 40, fill }: { height?: number; fill?: boolean }) {
  return (
    <svg {...(fill ? { width: '100%', style: { display: 'block', height: 'auto' } } : { height })}
      viewBox={fill ? '34 24 501.8 164' : '0 0 559.8 212'} role="img" aria-label="BLOC Coach">
      <g transform="translate(24 24)">
        <g transform="translate(0 32)">{MARK}</g>
        <g transform="translate(140 0)">{BLOC_TYPE}{COACH_ITALIC}</g>
      </g>
    </svg>
  );
}

export function CoachMark({ size = 32 }: { size?: number }) {
  return <BlocMark size={size} />;
}
