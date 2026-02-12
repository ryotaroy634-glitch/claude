const express = require('express');
const cors = require('cors');
const Parser = require('rss-parser');
const path = require('path');
const fs = require('fs');

const app = express();
const parser = new Parser({
  timeout: 10000,
  headers: {
    'User-Agent': 'Homecoming Reminder App/1.0'
  }
});

const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.static(path.join(__dirname, 'public')));

// Load feeds configuration
function loadFeeds() {
  const feedsPath = path.join(__dirname, 'feeds.json');
  return JSON.parse(fs.readFileSync(feedsPath, 'utf8'));
}

// Get all feed configurations
app.get('/api/feeds', (req, res) => {
  try {
    const feeds = loadFeeds();
    res.json(feeds);
  } catch (error) {
    res.status(500).json({ error: 'Failed to load feeds configuration' });
  }
});

// Fetch a single RSS feed
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

// Fetch all feeds
app.get('/api/all-feeds', async (req, res) => {
  try {
    const feedsConfig = loadFeeds();
    const results = [];
    const errors = [];

    const allFeeds = feedsConfig.categories.flatMap(category =>
      category.feeds.map(feed => ({ ...feed, category: category.name }))
    );

    const fetchPromises = allFeeds.map(async (feedConfig) => {
      try {
        const feed = await parser.parseURL(feedConfig.url);
        return {
          success: true,
          name: feedConfig.name,
          category: feedConfig.category,
          icon: feedConfig.icon,
          url: feedConfig.url,
          title: feed.title,
          link: feed.link,
          items: feed.items.slice(0, 10).map(item => ({
            title: item.title,
            link: item.link,
            pubDate: item.pubDate || item.isoDate,
            content: item.contentSnippet || item.content || '',
            creator: item.creator || item.author || '',
            source: feedConfig.name,
            sourceIcon: feedConfig.icon,
            category: feedConfig.category
          }))
        };
      } catch (error) {
        return {
          success: false,
          name: feedConfig.name,
          category: feedConfig.category,
          url: feedConfig.url,
          error: error.message
        };
      }
    });

    const feedResults = await Promise.allSettled(fetchPromises);

    feedResults.forEach(result => {
      if (result.status === 'fulfilled') {
        if (result.value.success) {
          results.push(result.value);
        } else {
          errors.push(result.value);
        }
      }
    });

    res.json({
      feeds: results,
      errors: errors,
      fetchedAt: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch feeds', message: error.message });
  }
});

// Serve the main page
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Homecoming Reminder App running at http://localhost:${PORT}`);
});
