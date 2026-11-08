export const SITE_URL = 'https://tangoexplorer.com';
export const GITHUB_URL = 'https://github.com/rahimcetinel/tangoexplorer';
export const FEED_PATH = '/feed.xml';

function issueUrl(template: string, params: { title?: string; body?: string } = {}): string {
  const search = new URLSearchParams({ template });
  if (params.title) search.set('title', params.title);
  if (params.body) search.set('body', params.body);
  return `${GITHUB_URL}/issues/new?${search.toString()}`;
}

export const SUBMIT_EVENT_URL = issueUrl('event.yml', {
  title: 'Event submission: ',
  body: 'Event name:\nDates:\nCity / country:\nWebsite or Instagram:\nAnything else we should know:\n',
});

export function reportEventUrl(title: string, pageUrl: string): string {
  return issueUrl('correction.yml', {
    title: `Correction: ${title}`,
    body: `Page: ${pageUrl}\n\nWhat is wrong:\n\nCorrect details (dates, city, venue, link):\n`,
  });
}
