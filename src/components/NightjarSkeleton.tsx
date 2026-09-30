type Props = {
  variant?: 'page' | 'cards' | 'profile' | 'list';
  count?: number;
  label?: string;
};

export default function NightjarSkeleton({ variant = 'cards', count = 4, label = 'Loading Nightjar' }: Props) {
  return <div className={'nj-skeleton nj-skeleton-' + variant} role="status" aria-live="polite" aria-label={label}>
    <span className="sr-only">{label}</span>
    {variant === 'page' && <div className="nj-skeleton-heading"><span/><span/></div>}
    <div className="nj-skeleton-grid">
      {Array.from({ length: count }).map((_, index) => <div className="nj-skeleton-card" key={index}>
        <span className="nj-skeleton-media"/>
        <span className="nj-skeleton-line wide"/>
        <span className="nj-skeleton-line"/>
        <span className="nj-skeleton-line short"/>
      </div>)}
    </div>
  </div>;
}
