require('dotenv').config();
const express = require('express');
const cors = require('cors');
const Parser = require('rss-parser');
const path = require('path');
const fs = require('fs');

// Import custom modules
const db = require('./src/database');
const scheduler = require('./src/scheduler');
const notifier = require('./src/notifier');

const app = express();
const parser = new Parser({
  timeout: 10000,
  headers: {
    'User-Agent': 'Tech News RSS Reader/1.0'
  }
});

const PORT = process.env.PORT || 3000;
const FETCH_INTERVAL = parseInt(process.env.FETCH_INTERVAL_MINUTES || '10');

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Initialize database
db.initializeDatabase();

// Load and import feeds configuration
function loadFeeds() {
  const feedsPath = path.join(__dirname, 'feeds.json');
  return JSON.parse(fs.readFileSync(feedsPath, 'utf8'));
}

// Import sources on startup
const feedsConfig = loadFeeds();
const imported = db.importSourcesFromConfig(feedsConfig);
if (imported > 0) {
  console.log(`Imported ${imported} new sources from feeds.json`);
}

// ===== Legacy API endpoints (for backward compatibility) =====

// Get all feed configurations
app.get('/api/feeds', (req, res) => {
  try {
    const feeds = loadFeeds();
    res.json(feeds);
  } catch (error) {
    res.status(500).json({ error: 'Failed to load feeds configuration' });
  }
});

// Fetch a single RSS feed (legacy)
app.get('/api/feed', async (req, res) => {
  const { url, name } = req.query;

  if (!url) {
    return res.status(400).json({ error: 'URL parameter is required' });
  }

  try {
    const feed = await parser.parseURL(url);
    res.json({
      name: name || feed.title,
      url: url,
      title: feed.title,
      description: feed.description,
      link: feed.link,
      items: feed.items.slice(0, 20).map(item => ({
        title: item.title,
        link: item.link,
        pubDate: item.pubDate || item.isoDate,
        content: item.contentSnippet || item.content || '',
        creator: item.creator || item.author || ''
      }))
    });
  } catch (error) {
    console.error(`Failed to fetch feed ${url}:`, error.message);
    res.status(500).json({
      error: 'Failed to fetch feed',
      url: url,
      message: error.message
    });
  }
});

// ===== New API endpoints =====

// Get items from database (with pagination)
app.get('/api/items', (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit || '100'), 500);
    const offset = parseInt(req.query.offset || '0');
    const sourceId = req.query.source_id;
    const search = req.query.search;

    let items;
    if (search) {
      items = db.searchItems(search, limit);
    } else if (sourceId) {
      items = db.getItemsBySource(parseInt(sourceId), limit);
    } else {
      items = db.getLatestItems(limit, offset);
    }

    res.json({
      items,
      count: items.length,
      offset,
      limit
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to get items', message: error.message });
  }
});

// Get all items (timeline view with source info)
app.get('/api/all-feeds', async (req, res) => {
  try {
    // Get items from database
    const items = db.getLatestItems(200);
    const sources = db.getAllSources();

    // Group by source for the feed structure
    const feedsMap = new Map();
    for (const item of items) {
      if (!feedsMap.has(item.source_id)) {
        feedsMap.set(item.source_id, {
          name: item.source_name,
          category: item.category,
          icon: item.source_icon,
          items: []
        });
      }
      feedsMap.get(item.source_id).items.push({
        id: item.id,
        title: item.title,
        link: item.link,
        pubDate: item.published_at,
        content: item.summary || item.content || '',
        creator: item.creator || '',
        source: item.source_name,
        sourceIcon: item.source_icon,
        category: item.category,
        read: item.read_at !== null
      });
    }

    const feeds = Array.from(feedsMap.values()).map(f => ({
      ...f,
      success: true
    }));

    res.json({
      feeds,
      errors: [],
      fetchedAt: new Date().toISOString(),
      stats: db.getStats()
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch feeds', message: error.message });
  }
});

// Get sources
app.get('/api/sources', (req, res) => {
  try {
    const sources = db.getAllSources();
    res.json({ sources });
  } catch (error) {
    res.status(500).json({ error: 'Failed to get sources', message: error.message });
  }
});

// Add a new source
app.post('/api/sources', (req, res) => {
  try {
    const { name, feed_url, site_url, category, icon } = req.body;
    if (!name || !feed_url) {
      return res.status(400).json({ error: 'name and feed_url are required' });
    }

    const id = db.createSource({
      name,
      feed_url,
      site_url,
      category,
      icon
    });

    res.json({ success: true, id });
  } catch (error) {
    res.status(500).json({ error: 'Failed to create source', message: error.message });
  }
});

// Toggle source enabled/disabled
app.patch('/api/sources/:id', (req, res) => {
  try {
    const { id } = req.params;
    const { enabled } = req.body;

    db.toggleSource(parseInt(id), enabled);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to update source', message: error.message });
  }
});

// Delete a source
app.delete('/api/sources/:id', (req, res) => {
  try {
    const { id } = req.params;
    db.deleteSource(parseInt(id));
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete source', message: error.message });
  }
});

// Mark item as read
app.post('/api/items/:id/read', (req, res) => {
  try {
    const { id } = req.params;
    db.markItemAsRead(parseInt(id));
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to mark as read', message: error.message });
  }
});

// Mark all items as read
app.post('/api/items/read-all', (req, res) => {
  try {
    db.markAllAsRead();
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to mark all as read', message: error.message });
  }
});

// Get stats
app.get('/api/stats', (req, res) => {
  try {
    const stats = db.getStats();
    const schedulerStatus = scheduler.getStatus();
    res.json({ ...stats, scheduler: schedulerStatus });
  } catch (error) {
    res.status(500).json({ error: 'Failed to get stats', message: error.message });
  }
});

// Trigger manual collection
app.post('/api/collect', async (req, res) => {
  try {
    const result = await scheduler.triggerNow();
    res.json({ success: true, result });
  } catch (error) {
    res.status(500).json({ error: 'Failed to trigger collection', message: error.message });
  }
});

// Get email configuration status
app.get('/api/email/status', async (req, res) => {
  try {
    const status = await notifier.verifyEmailConfig();
    res.json(status);
  } catch (error) {
    res.status(500).json({ error: 'Failed to check email status', message: error.message });
  }
});

// Send test email
app.post('/api/email/test', async (req, res) => {
  try {
    const testItems = [{
      id: 0,
      title: 'Test Email from RSS Reader',
      link: 'http://localhost:3000',
      published_at: new Date().toISOString(),
      summary: 'This is a test email to verify your email configuration is working correctly.',
      source_name: 'RSS Reader',
      source_icon: '📧',
      category: 'Test'
    }];

    const result = await notifier.sendNotificationEmail(testItems);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: 'Failed to send test email', message: error.message });
  }
});

// Serve the main page
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Start server
app.listen(PORT, () => {
  console.log(`Tech News RSS Reader running at http://localhost:${PORT}`);
  console.log(`Fetch interval: ${FETCH_INTERVAL} minutes`);

  // Start the scheduler
  scheduler.start(FETCH_INTERVAL);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down...');
  scheduler.stop();
  db.closeDatabase();
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('SIGINT received, shutting down...');
  scheduler.stop();
  db.closeDatabase();
  process.exit(0);
});
