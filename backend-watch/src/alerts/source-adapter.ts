export interface AlertSource {
  id: number | string;
  source_type: 'lgu' | 'institution';
  school_name: string;
  facebook_url: string | null;
  facebook_page_id?: string | null;
  website_url: string | null;
  rss_url: string | null;
  city: string | null;
  institution_id: string | null;
  is_active: boolean;
}

export interface RawPost {
  externalPostId: string | null;
  text: string;
  url: string | null;
  postedAt: string;
}

export interface SourceAdapter {
  fetchLatest(source: AlertSource): Promise<RawPost[]>;
}

export class FacebookGraphAdapter implements SourceAdapter {
  constructor(private readonly accessToken: string) {}

  async fetchLatest(source: AlertSource) {
    const pageId =
      source.facebook_page_id ??
      source.facebook_url
        ?.replace(/^https?:\/\/(?:www\.)?facebook\.com\//i, '')
        .split(/[/?#]/)[0];
    if (!pageId || pageId.startsWith('REPLACE_')) return [];
    const url = new URL(
      `https://graph.facebook.com/v21.0/${encodeURIComponent(pageId)}/posts`,
    );
    url.search = new URLSearchParams({
      fields: 'id,message,permalink_url,created_time',
      limit: '25',
      access_token: this.accessToken,
    }).toString();
    const response = await fetch(url, { signal: AbortSignal.timeout(12_000) });
    if (!response.ok)
      throw new Error(`Facebook Graph API returned HTTP ${response.status}.`);
    const body = (await response.json()) as {
      data?: {
        id?: string;
        message?: string;
        permalink_url?: string;
        created_time?: string;
      }[];
    };
    return (body.data ?? [])
      .filter((post) => post.message && post.created_time)
      .map((post) => ({
        externalPostId: post.id ?? null,
        text: post.message!,
        url: post.permalink_url ?? source.facebook_url,
        postedAt: post.created_time!,
      }));
  }
}

export class OfficialFeedAdapter implements SourceAdapter {
  async fetchLatest(source: AlertSource) {
    const feedUrls = [
      ...new Set(
        [source.rss_url, source.website_url].filter(
          (url): url is string => typeof url === 'string' && url.length > 0,
        ),
      ),
    ];
    if (!feedUrls.length) return [];
    let lastError: Error | null = null;
    for (const feedUrl of feedUrls) {
      try {
        const response = await fetch(feedUrl, {
          headers: {
            accept:
              'application/rss+xml, application/atom+xml, application/xml, text/xml',
          },
          signal: AbortSignal.timeout(12_000),
        });
        if (!response.ok)
          throw new Error(`Official feed returned HTTP ${response.status}.`);
        const contentType =
          response.headers.get('content-type')?.toLowerCase() ?? '';
        const xml = await response.text();
        if (
          !contentType.includes('xml') &&
          !contentType.includes('rss') &&
          !xml.trimStart().startsWith('<?xml') &&
          !xml.includes('<rss') &&
          !xml.includes('<feed')
        ) {
          throw new Error(
            'Configured website URL did not return an RSS or Atom feed.',
          );
        }

        return [...xml.matchAll(/<(item|entry)\b[\s\S]*?<\/\1>/gi)]
          .slice(0, 25)
          .map((match, index) => {
            const item = match[0];
            const title = xmlTag(item, 'title');
            const description =
              xmlTag(item, 'description') ??
              xmlTag(item, 'summary') ??
              xmlTag(item, 'content');
            const link =
              xmlTag(item, 'link') ??
              item.match(/<link[^>]+href=["']([^"']+)["']/i)?.[1] ??
              null;
            const postedAt =
              xmlTag(item, 'pubDate') ??
              xmlTag(item, 'published') ??
              xmlTag(item, 'updated');
            const text = [title, description].filter(Boolean).join('\n');
            const postedTime = postedAt ? Date.parse(postedAt) : Number.NaN;
            return {
              externalPostId:
                xmlTag(item, 'guid') ?? link ?? `${source.id}-${index}-${text}`,
              text: decodeXml(text).slice(0, 8000),
              url: link ? new URL(link, feedUrl).toString() : feedUrl,
              postedAt: Number.isFinite(postedTime)
                ? new Date(postedTime).toISOString()
                : new Date(0).toISOString(),
            };
          })
          .filter((post) => post.text.length > 0);
      } catch (error) {
        lastError =
          error instanceof Error
            ? error
            : new Error('Official feed unavailable.');
      }
    }
    throw lastError ?? new Error('No official feed URL is configured.');
  }
}

function xmlTag(xml: string, name: string) {
  const match = xml.match(
    new RegExp(`<${name}\\b[^>]*>([\\s\\S]*?)</${name}>`, 'i'),
  );
  return (
    match?.[1]?.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').trim() ?? null
  );
}

function decodeXml(value: string) {
  return value
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}
