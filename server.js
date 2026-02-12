const express = require('express');
const cors = require('cors');
const Parser = require('rss-parser');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');

const app = express();
const parser = new Parser({ timeout: 10000, headers: { 'User-Agent': 'RSS Aggregator/2.0' } });
const PORT = process.env.PORT || 3000;
const DB_PATH = path.join(__dirname, 'data.sqlite');

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const SOURCE_DEFINITIONS = [
  { name: 'Wall Street Journal Tech', category: 'ニュースメディア', group: 'メディア', rssUrl: 'https://feeds.a.dj.com/rss/RSSWSJD.xml', siteUrl: 'https://www.wsj.com/news/technology' },
  { name: 'Bloomberg Technology', category: 'ニュースメディア', group: 'メディア', rssUrl: 'https://feeds.bloomberg.com/technology/news.rss', siteUrl: 'https://www.bloomberg.com/technology' },
  { name: 'Reuters Technology', category: 'ニュースメディア', group: 'メディア', rssUrl: null, siteUrl: 'https://www.reuters.com/technology/' },
  { name: 'Financial Times Technology', category: 'ニュースメディア', group: 'メディア', rssUrl: 'https://www.ft.com/technology?format=rss', siteUrl: 'https://www.ft.com/technology' },
  { name: 'New York Times Technology', category: 'ニュースメディア', group: 'メディア', rssUrl: 'https://rss.nytimes.com/services/xml/rss/nyt/Technology.xml', siteUrl: 'https://www.nytimes.com/section/technology' },
  { name: 'Washington Post Tech', category: 'ニュースメディア', group: 'メディア', rssUrl: 'https://feeds.washingtonpost.com/rss/business/technology', siteUrl: 'https://www.washingtonpost.com/business/technology/' },
  { name: 'Axios Technology', category: 'ニュースメディア', group: 'メディア', rssUrl: 'https://api.axios.com/feed/technology/', siteUrl: 'https://www.axios.com/technology' },
  { name: 'CNBC Tech', category: 'ニュースメディア', group: 'メディア', rssUrl: 'https://www.cnbc.com/id/19854910/device/rss/rss.html', siteUrl: 'https://www.cnbc.com/technology/' },
  { name: 'Yahoo News Japan IT', category: 'ニュースメディア', group: 'メディア', rssUrl: 'https://news.yahoo.co.jp/rss/categories/it.xml', siteUrl: 'https://news.yahoo.co.jp/categories/it' },
  { name: 'OpenAI', category: 'テック企業', group: '企業', rssUrl: null, siteUrl: 'https://openai.com/news/' },
  { name: 'Google', category: 'テック企業', group: '企業', rssUrl: 'https://blog.google/rss/', siteUrl: 'https://blog.google/' },
  { name: 'Meta', category: 'テック企業', group: '企業', rssUrl: null, siteUrl: 'https://about.fb.com/news/' },
  { name: 'Anthropic', category: 'テック企業', group: '企業', rssUrl: null, siteUrl: 'https://www.anthropic.com/news' },
  { name: 'Apple Newsroom', category: 'テック企業', group: '企業', rssUrl: null, siteUrl: 'https://www.apple.com/newsroom/' },
  { name: 'Amazon', category: 'テック企業', group: '企業', rssUrl: null, siteUrl: 'https://www.aboutamazon.com/news' },
  { name: 'Microsoft', category: 'テック企業', group: '企業', rssUrl: 'https://blogs.microsoft.com/feed/', siteUrl: 'https://news.microsoft.com/' },
  { name: 'Netflix TechBlog', category: 'テック企業', group: '企業', rssUrl: 'https://netflixtechblog.com/feed', siteUrl: 'https://netflixtechblog.com/' },
  { name: 'Uber Engineering', category: 'テック企業', group: '企業', rssUrl: null, siteUrl: 'https://www.uber.com/blog/engineering/' },
  { name: 'Airbnb Engineering', category: 'テック企業', group: '企業', rssUrl: null, siteUrl: 'https://airbnb.tech/' },
  { name: 'NVIDIA News', category: '半導体企業', group: '企業', rssUrl: null, siteUrl: 'https://nvidianews.nvidia.com/' },
  { name: 'AMD Newsroom', category: '半導体企業', group: '企業', rssUrl: null, siteUrl: 'https://www.amd.com/en/corporate/newsroom' },
  { name: 'Broadcom News', category: '半導体企業', group: '企業', rssUrl: null, siteUrl: 'https://www.broadcom.com/company/news' },
  { name: 'Intel Newsroom', category: '半導体企業', group: '企業', rssUrl: null, siteUrl: 'https://www.intel.com/content/www/us/en/newsroom/home.html' }
];

function sqlEscape(value) {
  return String(value || '').replace(/'/g, "''");
}

function runSql(sql, json = false) {
  const args = [DB_PATH];
  if (json) args.push('-json');
  args.push(sql);
  const out = execFileSync('sqlite3', args, { encoding: 'utf8' });
  return json ? JSON.parse(out || '[]') : out;
}

function initializeDb() {
  runSql(`
    CREATE TABLE IF NOT EXISTS sources (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE NOT NULL,
      category TEXT NOT NULL,
      source_group TEXT NOT NULL,
      rss_url TEXT,
      site_url TEXT NOT NULL,
      last_checked_at TEXT,
      is_rss_valid INTEGER DEFAULT 1
    );
    CREATE TABLE IF NOT EXISTS articles (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      source_id INTEGER NOT NULL,
      title TEXT NOT NULL,
      url TEXT NOT NULL,
      summary TEXT,
      published_at TEXT,
      hash TEXT UNIQUE NOT NULL,
      is_read INTEGER DEFAULT 0,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(source_id) REFERENCES sources(id)
    );
    CREATE TABLE IF NOT EXISTS fetch_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      source_id INTEGER,
      status TEXT NOT NULL,
      message TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_articles_published_at ON articles(published_at DESC);
    CREATE INDEX IF NOT EXISTS idx_articles_read ON articles(is_read);
  `);

  SOURCE_DEFINITIONS.forEach((s) => {
    runSql(`INSERT OR IGNORE INTO sources (name, category, source_group, rss_url, site_url) VALUES ('${sqlEscape(s.name)}', '${sqlEscape(s.category)}', '${sqlEscape(s.group)}', ${s.rssUrl ? `'${sqlEscape(s.rssUrl)}'` : 'NULL'}, '${sqlEscape(s.siteUrl)}');`);
  });
}

function createHash(url, title) {
  return crypto.createHash('sha256').update(`${url}|${title}`).digest('hex');
}

function delay(ms) { return new Promise((r) => setTimeout(r, ms)); }

async function withRetry(fn, sourceName, sourceId) {
  let lastError;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      runSql(`INSERT INTO fetch_logs (source_id, status, message) VALUES (${sourceId || 'NULL'}, 'error', '${sqlEscape(`${sourceName} attempt ${attempt}: ${error.message}`)}');`);
      if (attempt < 3) await delay(2 ** attempt * 500);
    }
  }
  throw lastError;
}

async function scrapeHtml(siteUrl) {
  const response = await fetch(siteUrl, { headers: { 'User-Agent': 'RSS Aggregator/2.0' } });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const html = await response.text();

  const articleRegex = /<a[^>]+href=["']([^"']+)["'][^>]*>(.*?)<\/a>/gims;
  const items = [];
  let match;
  while ((match = articleRegex.exec(html)) && items.length < 20) {
    const link = match[1];
    const text = match[2].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
    if (!text || text.length < 20) continue;
    const normalizedLink = link.startsWith('http') ? link : new URL(link, siteUrl).toString();
    if (!normalizedLink.startsWith('http')) continue;
    items.push({ title: text, link: normalizedLink, contentSnippet: 'HTMLスクレイピングで取得', isoDate: new Date().toISOString() });
  }

  if (!items.length) throw new Error('No articles found in HTML scraping');
  return items;
}

async function fetchSourceArticles(source) {
  const sourceId = source.id;
  const rssUrl = source.rss_url;
  const siteUrl = source.site_url;

  let rawItems = [];
  let usedFallback = false;

  if (rssUrl) {
    try {
      rawItems = await withRetry(() => parser.parseURL(rssUrl).then((f) => f.items || []), source.name, sourceId);
      runSql(`UPDATE sources SET is_rss_valid = 1, last_checked_at = datetime('now') WHERE id = ${sourceId};`);
    } catch (rssError) {
      usedFallback = true;
      rawItems = await withRetry(() => scrapeHtml(siteUrl), source.name, sourceId);
      runSql(`UPDATE sources SET is_rss_valid = 0, last_checked_at = datetime('now') WHERE id = ${sourceId};`);
    }
  } else {
    usedFallback = true;
    rawItems = await withRetry(() => scrapeHtml(siteUrl), source.name, sourceId);
    runSql(`UPDATE sources SET is_rss_valid = 0, last_checked_at = datetime('now') WHERE id = ${sourceId};`);
  }

  let inserted = 0;
  rawItems.slice(0, 30).forEach((item) => {
    const title = (item.title || '').trim();
    const url = (item.link || '').trim();
    if (!title || !url) return;
    const hash = createHash(url, title);
    const publishedAt = item.isoDate || item.pubDate || new Date().toISOString();
    const summary = (item.contentSnippet || item.content || '').replace(/<[^>]+>/g, '').slice(0, 500);

    const result = runSql(`INSERT OR IGNORE INTO articles (source_id, title, url, summary, published_at, hash) VALUES (${sourceId}, '${sqlEscape(title)}', '${sqlEscape(url)}', '${sqlEscape(summary)}', '${sqlEscape(publishedAt)}', '${hash}'); SELECT changes() as c;`);
    if (String(result).includes('1')) inserted += 1;
  });

  runSql(`INSERT INTO fetch_logs (source_id, status, message) VALUES (${sourceId}, 'success', '${sqlEscape(`Fetched ${inserted} new items${usedFallback ? ' (fallback)' : ''}`)}');`);
  return { source: source.name, inserted, usedFallback };
}

async function refreshAllSources() {
  const sources = runSql('SELECT * FROM sources ORDER BY id;', true);
  const results = [];
  for (const source of sources) {
    try {
      const result = await fetchSourceArticles(source);
      results.push({ ...result, success: true });
    } catch (error) {
      runSql(`INSERT INTO fetch_logs (source_id, status, message) VALUES (${source.id}, 'error', '${sqlEscape(error.message)}');`);
      results.push({ source: source.name, success: false, error: error.message });
    }
  }
  return results;
}

function isPacificActiveWindow() {
  const now = new Date();
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Los_Angeles', hour: '2-digit', hour12: false }).formatToParts(now);
  const hour = Number(parts.find((p) => p.type === 'hour').value);
  return hour >= 5 && hour < 22;
}

function startScheduler() {
  setInterval(async () => {
    if (!isPacificActiveWindow()) return;
    await refreshAllSources();
  }, 30 * 60 * 1000);
}

app.get('/api/sources', (req, res) => {
  const sources = runSql('SELECT id, name, category, source_group as sourceGroup, rss_url as rssUrl, site_url as siteUrl, last_checked_at as lastCheckedAt, is_rss_valid as isRssValid FROM sources ORDER BY category, name;', true);
  res.json({ sources });
});

app.get('/api/articles', (req, res) => {
  const page = Number(req.query.page || 1);
  const pageSize = Math.min(Number(req.query.pageSize || 20), 100);
  const offset = (page - 1) * pageSize;

  const filters = [];
  if (req.query.category) filters.push(`s.category = '${sqlEscape(req.query.category)}'`);
  if (req.query.sourceId) filters.push(`a.source_id = ${Number(req.query.sourceId)}`);
  if (req.query.sourceGroup) filters.push(`s.source_group = '${sqlEscape(req.query.sourceGroup)}'`);
  if (req.query.read === 'true') filters.push('a.is_read = 1');
  if (req.query.read === 'false') filters.push('a.is_read = 0');

  const where = filters.length ? `WHERE ${filters.join(' AND ')}` : '';

  const articles = runSql(`
    SELECT a.id, a.title, a.url, a.summary, a.published_at as publishedAt, a.is_read as isRead,
           s.name as sourceName, s.category, s.source_group as sourceGroup
    FROM articles a
    JOIN sources s ON s.id = a.source_id
    ${where}
    ORDER BY datetime(a.published_at) DESC, a.id DESC
    LIMIT ${pageSize} OFFSET ${offset};
  `, true);

  const countResult = runSql(`SELECT COUNT(*) as total FROM articles a JOIN sources s ON s.id = a.source_id ${where};`, true);
  const total = countResult[0]?.total || 0;

  res.json({ page, pageSize, total, articles });
});

app.post('/api/refresh', async (req, res) => {
  const results = await refreshAllSources();
  res.json({ refreshedAt: new Date().toISOString(), results });
});

app.patch('/api/articles/:id/read', (req, res) => {
  const id = Number(req.params.id);
  const isRead = req.body.isRead === false ? 0 : 1;
  runSql(`UPDATE articles SET is_read = ${isRead} WHERE id = ${id};`);
  res.json({ id, isRead: Boolean(isRead) });
});

app.get('/api/logs', (req, res) => {
  const logs = runSql('SELECT id, source_id as sourceId, status, message, created_at as createdAt FROM fetch_logs ORDER BY id DESC LIMIT 200;', true);
  res.json({ logs });
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

initializeDb();
startScheduler();

app.listen(PORT, () => {
  console.log(`RSS Aggregator running at http://localhost:${PORT}`);
});
