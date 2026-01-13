import { Feed, FeedItem } from '../types';

const CORS_PROXY = 'https://api.allorigins.win/raw?url=';

export async function fetchFeed(url: string): Promise<Feed> {
  const response = await fetch(CORS_PROXY + encodeURIComponent(url));

  if (!response.ok) {
    throw new Error(`Failed to fetch feed: ${response.statusText}`);
  }

  const text = await response.text();
  return parseFeed(url, text);
}

function parseFeed(url: string, xml: string): Feed {
  const parser = new DOMParser();
  const doc = parser.parseFromString(xml, 'text/xml');

  const parseError = doc.querySelector('parsererror');
  if (parseError) {
    throw new Error('Invalid RSS feed format');
  }

  // Check if it's RSS or Atom
  const isAtom = doc.querySelector('feed') !== null;

  if (isAtom) {
    return parseAtomFeed(url, doc);
  }

  return parseRssFeed(url, doc);
}

function parseRssFeed(url: string, doc: Document): Feed {
  const channel = doc.querySelector('channel');

  const title = channel?.querySelector('title')?.textContent || 'Unknown Feed';
  const description = channel?.querySelector('description')?.textContent || '';

  const items: FeedItem[] = [];
  const itemElements = doc.querySelectorAll('item');

  itemElements.forEach((item) => {
    const itemTitle = item.querySelector('title')?.textContent || 'No title';
    const link = item.querySelector('link')?.textContent || '';
    const pubDate = item.querySelector('pubDate')?.textContent || '';
    const content = item.querySelector('content\\:encoded')?.textContent ||
                   item.querySelector('description')?.textContent || '';
    const guid = item.querySelector('guid')?.textContent || link;

    items.push({
      title: itemTitle,
      link,
      pubDate,
      content,
      contentSnippet: stripHtml(content).slice(0, 200),
      guid,
    });
  });

  return {
    id: generateId(),
    url,
    title,
    description,
    items,
    lastUpdated: new Date().toISOString(),
  };
}

function parseAtomFeed(url: string, doc: Document): Feed {
  const feed = doc.querySelector('feed');

  const title = feed?.querySelector('title')?.textContent || 'Unknown Feed';
  const description = feed?.querySelector('subtitle')?.textContent || '';

  const items: FeedItem[] = [];
  const entryElements = doc.querySelectorAll('entry');

  entryElements.forEach((entry) => {
    const itemTitle = entry.querySelector('title')?.textContent || 'No title';
    const linkEl = entry.querySelector('link[href]');
    const link = linkEl?.getAttribute('href') || '';
    const pubDate = entry.querySelector('published')?.textContent ||
                   entry.querySelector('updated')?.textContent || '';
    const content = entry.querySelector('content')?.textContent ||
                   entry.querySelector('summary')?.textContent || '';
    const guid = entry.querySelector('id')?.textContent || link;

    items.push({
      title: itemTitle,
      link,
      pubDate,
      content,
      contentSnippet: stripHtml(content).slice(0, 200),
      guid,
    });
  });

  return {
    id: generateId(),
    url,
    title,
    description,
    items,
    lastUpdated: new Date().toISOString(),
  };
}

function stripHtml(html: string): string {
  const tmp = document.createElement('div');
  tmp.innerHTML = html;
  return tmp.textContent || tmp.innerText || '';
}

function generateId(): string {
  return Math.random().toString(36).substring(2, 9);
}
