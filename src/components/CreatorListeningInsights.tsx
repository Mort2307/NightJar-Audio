import { BarChart3, Headphones, RefreshCw, Trophy } from 'lucide-react';
import './creator-listening-insights.css';

type ReleaseInsight = {
  id: string;
  title?: string;
  status?: string;
  listenCount?: number;
};

type Props = {
  releases: ReleaseInsight[];
  verifiedMinutes?: number;
  loading?: boolean;
  onRefresh: () => void;
};

const safeListens = (value: unknown) => {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? Math.max(0, Math.floor(parsed)) : 0;
};

export default function CreatorListeningInsights({ releases, verifiedMinutes = 0, loading = false, onRefresh }: Props) {
  const published = releases
    .filter((release) => release.status === 'released')
    .map((release) => ({
      id: release.id,
      title: release.title?.trim() || 'Untitled release',
      listens: safeListens(release.listenCount),
    }))
    .sort((a, b) => b.listens - a.listens || a.title.localeCompare(b.title));
  const top = published.slice(0, 8);
  const total = published.reduce((sum, release) => sum + release.listens, 0);
  const maximum = Math.max(1, ...top.map((release) => release.listens));
  const leader = top[0]?.listens ? top[0] : null;

  return <section className="nj-listening-insights" aria-label="Verified audience and release performance">
    <div className="nj-listening-insights-head">
      <div>
        <span className="mini-label"><BarChart3 size={14}/> YOUR AUDIENCE · LIVE RECORDS</span>
        <h2>Which recordings connect?</h2>
        <p>See your most-listened-to published work. Figures come from verified playback, not Play-button clicks.</p>
      </div>
      <button className="secondary-button" type="button" onClick={onRefresh} disabled={loading} aria-label="Refresh creator listening statistics">
        <RefreshCw size={15} className={loading ? 'nj-insights-spin' : undefined}/> Refresh
      </button>
    </div>
    <div className="nj-listening-insights-summary">
      <div><small>Qualified listens</small><strong>{loading ? '…' : total.toLocaleString('en-GB')}</strong><span>All published releases</span></div>
      <div><small>Verified listening time</small><strong>{loading ? '…' : Number(verifiedMinutes || 0).toLocaleString('en-GB', { maximumFractionDigits: 1 })}<em> min</em></strong><span>Real playback progress</span></div>
      <div><small>Top recording</small><strong className="nj-insights-leader">{leader?.title ?? 'Not established yet'}</strong><span>{leader ? leader.listens.toLocaleString('en-GB') + ' qualified listens' : 'Starts with your first verified listens'}</span></div>
    </div>
    {top.length ? <>
      <div className="nj-listening-plot-head">
        <h3><Headphones size={16}/> Listens by audio</h3>
        <span>{published.length > 8 ? 'Top 8 released audios' : 'Your published audios'}</span>
      </div>
      <div className="nj-listening-plot-scroll" role="region" aria-label="Scrollable column chart of qualified listens by recording" tabIndex={0}>
        <div className="nj-listening-plot" role="list">
          {top.map((release, index) => <div className="nj-listening-column" role="listitem" key={release.id} aria-label={release.title + ': ' + release.listens + ' qualified listens'}>
            <div className="nj-listening-column-plot">
              <span className="nj-listening-column-count">{release.listens.toLocaleString('en-GB')}</span>
              <span className={index === 0 && release.listens > 0 ? 'nj-listening-column-bar leading' : 'nj-listening-column-bar'} style={{ height: release.listens > 0 ? Math.max(3, Math.round(release.listens / maximum * 140)) + 'px' : '0px' }} aria-hidden="true" />
            </div>
            <span className="nj-listening-column-title" title={release.title}>{release.title}</span>
          </div>)}
        </div>
      </div>
      <p className="nj-listening-insights-foot"><Trophy size={14}/> Ordered by qualified listens. Scroll sideways to see more titles on mobile.</p>
    </> : <div className="nj-listening-insights-empty">
      <Headphones size={24}/>
      <strong>Publish your first recording to begin.</strong>
      <p>This chart will populate using real NightJar audience data. No sample listening figures are inserted into live accounts.</p>
    </div>}
    <p className="nj-listening-insights-fine">A qualified listen requires meaningful playback progress. Repeat listens from the same account are rate-limited; administrative and credited-contributor previews do not increase these counters. Counters begin when qualified-listen tracking is enabled.</p>
  </section>;
}
