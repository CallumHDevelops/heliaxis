/**
 * What each platform lets us measure. The single source of truth for the Insights screens: a metric a
 * platform does not provide is shown as "Not available from {platform}", never replaced by a stand-in.
 * (docs/social-monitoring/08-insights.md §1-§2.) Meta renames metrics from time to time: when it does,
 * the new name is a new entry and the chart shows a break, never a joined line.
 */
export type MetricKey = 'followers' | 'views' | 'reach_unique' | 'post_engagements' | 'likes' | 'comments' | 'shares';
export type Availability = { platform: 'facebook' | 'instagram'; metric: MetricKey; apiName: string | null; available: boolean; reason?: string };

export const CATALOGUE: Availability[] = [
  { platform: 'facebook', metric: 'followers', apiName: 'followers_count', available: true },
  { platform: 'facebook', metric: 'views', apiName: 'page_media_view', available: true },
  { platform: 'facebook', metric: 'reach_unique', apiName: 'page_total_media_view_unique', available: true },
  { platform: 'facebook', metric: 'post_engagements', apiName: 'page_post_engagements', available: true },
  { platform: 'facebook', metric: 'likes', apiName: 'reactions.summary.total_count', available: true },
  { platform: 'facebook', metric: 'comments', apiName: 'comments.summary.total_count', available: true },
  { platform: 'facebook', metric: 'shares', apiName: 'shares.count', available: true },
  { platform: 'instagram', metric: 'followers', apiName: 'followers_count', available: true },
  { platform: 'instagram', metric: 'likes', apiName: 'like_count', available: true },
  { platform: 'instagram', metric: 'comments', apiName: 'comments_count', available: true },
  { platform: 'instagram', metric: 'views', apiName: null, available: false, reason: 'Needs the Instagram insights permission, which the connection was not given' },
  { platform: 'instagram', metric: 'reach_unique', apiName: null, available: false, reason: 'Needs the Instagram insights permission, which the connection was not given' },
  { platform: 'instagram', metric: 'shares', apiName: null, available: false, reason: 'Needs the Instagram insights permission, which the connection was not given' },
];

export const METRIC_LABEL: Record<MetricKey, string> = {
  followers: 'Followers',
  views: 'Views',
  reach_unique: 'People reached',
  post_engagements: 'Post engagements',
  likes: 'Likes and reactions',
  comments: 'Comments',
  shares: 'Shares',
};

export const apiNameFor = (platform: string, metric: MetricKey) => CATALOGUE.find((c) => c.platform === platform && c.metric === metric)?.apiName ?? null;
