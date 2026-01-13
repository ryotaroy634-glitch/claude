export interface FeedItem {
  title: string;
  link: string;
  pubDate: string;
  content: string;
  contentSnippet: string;
  guid: string;
}

export interface Feed {
  id: string;
  url: string;
  title: string;
  description: string;
  items: FeedItem[];
  lastUpdated: string;
}

export interface FeedSource {
  id: string;
  url: string;
  title: string;
}
