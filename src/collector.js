const Parser = require('rss-parser');
const db = require('./database');

const parser = new Parser({
  timeout: 10000,
  headers: {
    'User-Agent': 'Tech News RSS Reader/1.0'
  },
  customFields: {
    item: ['content:encoded', 'dc:creator']
  }
});

// Fetch a single feed with conditional GET support
async function fetchFeed(source) {
  const headers = {
    'User-Agent': 'Tech News RSS Reader/1.0'
  };

  // Add conditional headers if available
  if (source.etag) {
    headers['If-None-Match'] = source.etag;
  }
  if (source.last_modified) {
    headers['If-Modified-Since'] = source.last_modified;
  }

  try {
    // Use fetch for conditional GET
    const response = await fetch(source.feed_url, {
      headers,
      signal: AbortSignal.timeout(10000)
    });

    // 304 Not Modified - no new content
    if (response.status === 304) {
      console.log(`[${source.name}] No changes (304)`);
      return { source, status: 'not_modified', items: [] };
    }

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    // Get new etag and last-modified headers
    const newEtag = response.headers.get('etag');
    const newLastModified = response.headers.get('last-modified');

    // Parse the feed content
    const feedText = await response.text();
    const feed = await parser.parseString(feedText);

    // Update source fetch info
    db.updateSourceFetchInfo(source.id, newEtag, newLastModified);

    // Process items
    const items = feed.items.map(item => ({
      source_id: source.id,
      guid: db.generateGuid(item),
      title: item.title || 'Untitled',
      link: item.link || '',
      published_at: item.isoDate || item.pubDate || null,
      summary: item.contentSnippet || '',
      content: item['content:encoded'] || item.content || '',
      creator: item['dc:creator'] || item.creator || item.author || '',
      raw: JSON.stringify(item)
    }));

    return {
      source,
      status: 'success',
      items,
      feedTitle: feed.title
    };
  } catch (error) {
    console.error(`[${source.name}] Fetch error:`, error.message);
    return {
      source,
      status: 'error',
      error: error.message,
      items: []
    };
  }
}

// Collect feeds from all sources
async function collectAllFeeds() {
  const sources = db.getAllSources();
  console.log(`\n=== Starting collection for ${sources.length} sources ===`);

  const results = {
    startTime: new Date().toISOString(),
    totalSources: sources.length,
    successful: 0,
    notModified: 0,
    failed: 0,
    newItems: [],
    errors: []
  };

  // Fetch all feeds in parallel with concurrency limit
  const CONCURRENCY_LIMIT = 5;
  const chunks = [];
  for (let i = 0; i < sources.length; i += CONCURRENCY_LIMIT) {
    chunks.push(sources.slice(i, i + CONCURRENCY_LIMIT));
  }

  for (const chunk of chunks) {
    const fetchPromises = chunk.map(source => fetchFeed(source));
    const chunkResults = await Promise.allSettled(fetchPromises);

    for (const result of chunkResults) {
      if (result.status === 'fulfilled') {
        const feedResult = result.value;

        if (feedResult.status === 'success') {
          results.successful++;

          // Insert items and track new ones
          if (feedResult.items.length > 0) {
            const insertedIds = db.createItems(feedResult.items);
            if (insertedIds.length > 0) {
              console.log(`[${feedResult.source.name}] +${insertedIds.length} new items`);
              // Get the newly inserted items with full data
              for (const item of feedResult.items) {
                const existingItem = db.getItemByGuid(feedResult.source.id, item.guid);
                if (existingItem && insertedIds.includes(existingItem.id)) {
                  results.newItems.push({
                    ...existingItem,
                    source_name: feedResult.source.name,
                    source_icon: feedResult.source.icon,
                    category: feedResult.source.category
                  });
                }
              }
            }
          }
        } else if (feedResult.status === 'not_modified') {
          results.notModified++;
        } else {
          results.failed++;
          results.errors.push({
            source: feedResult.source.name,
            error: feedResult.error
          });
        }
      } else {
        results.failed++;
        results.errors.push({
          source: 'Unknown',
          error: result.reason?.message || 'Unknown error'
        });
      }
    }
  }

  results.endTime = new Date().toISOString();
  console.log(`\n=== Collection complete ===`);
  console.log(`Successful: ${results.successful}, Not Modified: ${results.notModified}, Failed: ${results.failed}`);
  console.log(`New items: ${results.newItems.length}`);

  return results;
}

// Run a single collection cycle
async function runCollectionCycle() {
  try {
    const results = await collectAllFeeds();

    // Get unnotified items for email notification
    const unnotifiedItems = db.getUnnotifiedItems();

    return {
      ...results,
      unnotifiedItems
    };
  } catch (error) {
    console.error('Collection cycle error:', error);
    return {
      status: 'error',
      error: error.message
    };
  }
}

module.exports = {
  fetchFeed,
  collectAllFeeds,
  runCollectionCycle
};
