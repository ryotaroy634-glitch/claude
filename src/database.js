const sqlite3 = require('better-sqlite3');
const path = require('path');
const crypto = require('crypto');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, '..', 'data', 'rss.db');

let db = null;

function getDb() {
  if (!db) {
    const fs = require('fs');
    const dir = path.dirname(DB_PATH);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    db = sqlite3(DB_PATH);
    db.pragma('journal_mode = WAL');
  }
  return db;
}

function initializeDatabase() {
  const db = getDb();

  // sources table
  db.exec(`
    CREATE TABLE IF NOT EXISTS sources (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      feed_url TEXT NOT NULL UNIQUE,
      site_url TEXT,
      category TEXT,
      icon TEXT,
      etag TEXT,
      last_modified TEXT,
      fetch_interval_minutes INTEGER DEFAULT 10,
      enabled INTEGER DEFAULT 1,
      last_fetched_at TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    )
  `);

  // items table
  db.exec(`
    CREATE TABLE IF NOT EXISTS items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      source_id INTEGER NOT NULL,
      guid TEXT NOT NULL,
      title TEXT NOT NULL,
      link TEXT NOT NULL,
      published_at TEXT,
      fetched_at TEXT DEFAULT (datetime('now')),
      first_seen_at TEXT DEFAULT (datetime('now')),
      summary TEXT,
      content TEXT,
      creator TEXT,
      raw TEXT,
      notified_at TEXT,
      read_at TEXT,
      FOREIGN KEY (source_id) REFERENCES sources(id),
      UNIQUE(source_id, guid)
    )
  `);

  // Create indexes
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_items_source_id ON items(source_id);
    CREATE INDEX IF NOT EXISTS idx_items_published_at ON items(published_at);
    CREATE INDEX IF NOT EXISTS idx_items_first_seen_at ON items(first_seen_at);
    CREATE INDEX IF NOT EXISTS idx_items_notified_at ON items(notified_at);
    CREATE INDEX IF NOT EXISTS idx_items_read_at ON items(read_at);
    CREATE INDEX IF NOT EXISTS idx_sources_enabled ON sources(enabled);
  `);

  console.log('Database initialized successfully');
  return db;
}

// Generate GUID from item data
function generateGuid(item) {
  if (item.guid) return item.guid;
  if (item.id) return item.id;
  if (item.link) return item.link;
  // Fallback: hash of title + published date
  const data = `${item.title || ''}|${item.pubDate || item.isoDate || ''}`;
  return crypto.createHash('sha256').update(data).digest('hex');
}

// Source operations
function getAllSources() {
  const db = getDb();
  return db.prepare('SELECT * FROM sources WHERE enabled = 1').all();
}

function getSourceById(id) {
  const db = getDb();
  return db.prepare('SELECT * FROM sources WHERE id = ?').get(id);
}

function getSourceByUrl(feedUrl) {
  const db = getDb();
  return db.prepare('SELECT * FROM sources WHERE feed_url = ?').get(feedUrl);
}

function createSource(source) {
  const db = getDb();
  const stmt = db.prepare(`
    INSERT INTO sources (name, feed_url, site_url, category, icon, fetch_interval_minutes, enabled)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  const result = stmt.run(
    source.name,
    source.feed_url,
    source.site_url || null,
    source.category || null,
    source.icon || null,
    source.fetch_interval_minutes || 10,
    source.enabled !== false ? 1 : 0
  );
  return result.lastInsertRowid;
}

function updateSourceFetchInfo(sourceId, etag, lastModified) {
  const db = getDb();
  const stmt = db.prepare(`
    UPDATE sources
    SET etag = ?, last_modified = ?, last_fetched_at = datetime('now'), updated_at = datetime('now')
    WHERE id = ?
  `);
  return stmt.run(etag, lastModified, sourceId);
}

function toggleSource(sourceId, enabled) {
  const db = getDb();
  const stmt = db.prepare(`
    UPDATE sources SET enabled = ?, updated_at = datetime('now') WHERE id = ?
  `);
  return stmt.run(enabled ? 1 : 0, sourceId);
}

function deleteSource(sourceId) {
  const db = getDb();
  db.prepare('DELETE FROM items WHERE source_id = ?').run(sourceId);
  return db.prepare('DELETE FROM sources WHERE id = ?').run(sourceId);
}

// Item operations
function getItemByGuid(sourceId, guid) {
  const db = getDb();
  return db.prepare('SELECT * FROM items WHERE source_id = ? AND guid = ?').get(sourceId, guid);
}

function createItem(item) {
  const db = getDb();
  const stmt = db.prepare(`
    INSERT OR IGNORE INTO items (source_id, guid, title, link, published_at, summary, content, creator, raw)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const result = stmt.run(
    item.source_id,
    item.guid,
    item.title,
    item.link,
    item.published_at || null,
    item.summary || null,
    item.content || null,
    item.creator || null,
    item.raw || null
  );
  return result.changes > 0 ? result.lastInsertRowid : null;
}

function createItems(items) {
  const db = getDb();
  const stmt = db.prepare(`
    INSERT OR IGNORE INTO items (source_id, guid, title, link, published_at, summary, content, creator, raw)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const insertMany = db.transaction((items) => {
    const insertedIds = [];
    for (const item of items) {
      const result = stmt.run(
        item.source_id,
        item.guid,
        item.title,
        item.link,
        item.published_at || null,
        item.summary || null,
        item.content || null,
        item.creator || null,
        item.raw || null
      );
      if (result.changes > 0) {
        insertedIds.push(result.lastInsertRowid);
      }
    }
    return insertedIds;
  });

  return insertMany(items);
}

function getLatestItems(limit = 100, offset = 0) {
  const db = getDb();
  return db.prepare(`
    SELECT i.*, s.name as source_name, s.icon as source_icon, s.category
    FROM items i
    JOIN sources s ON i.source_id = s.id
    ORDER BY i.published_at DESC NULLS LAST, i.first_seen_at DESC
    LIMIT ? OFFSET ?
  `).all(limit, offset);
}

function getItemsBySource(sourceId, limit = 50) {
  const db = getDb();
  return db.prepare(`
    SELECT i.*, s.name as source_name, s.icon as source_icon, s.category
    FROM items i
    JOIN sources s ON i.source_id = s.id
    WHERE i.source_id = ?
    ORDER BY i.published_at DESC NULLS LAST
    LIMIT ?
  `).all(sourceId, limit);
}

function searchItems(keyword, limit = 50) {
  const db = getDb();
  return db.prepare(`
    SELECT i.*, s.name as source_name, s.icon as source_icon, s.category
    FROM items i
    JOIN sources s ON i.source_id = s.id
    WHERE i.title LIKE ? OR i.summary LIKE ?
    ORDER BY i.published_at DESC NULLS LAST
    LIMIT ?
  `).all(`%${keyword}%`, `%${keyword}%`, limit);
}

function getUnnotifiedItems() {
  const db = getDb();
  return db.prepare(`
    SELECT i.*, s.name as source_name, s.icon as source_icon, s.category
    FROM items i
    JOIN sources s ON i.source_id = s.id
    WHERE i.notified_at IS NULL
    ORDER BY i.first_seen_at ASC
  `).all();
}

function markItemsAsNotified(itemIds) {
  if (!itemIds || itemIds.length === 0) return;
  const db = getDb();
  const placeholders = itemIds.map(() => '?').join(',');
  const stmt = db.prepare(`
    UPDATE items SET notified_at = datetime('now') WHERE id IN (${placeholders})
  `);
  return stmt.run(...itemIds);
}

function markItemAsRead(itemId) {
  const db = getDb();
  const stmt = db.prepare(`
    UPDATE items SET read_at = datetime('now') WHERE id = ?
  `);
  return stmt.run(itemId);
}

function markAllAsRead() {
  const db = getDb();
  return db.prepare(`
    UPDATE items SET read_at = datetime('now') WHERE read_at IS NULL
  `).run();
}

function getUnreadCount() {
  const db = getDb();
  return db.prepare('SELECT COUNT(*) as count FROM items WHERE read_at IS NULL').get().count;
}

function cleanupOldItems(retentionDays = 90) {
  const db = getDb();
  const stmt = db.prepare(`
    DELETE FROM items
    WHERE first_seen_at < datetime('now', '-' || ? || ' days')
  `);
  return stmt.run(retentionDays);
}

function getStats() {
  const db = getDb();
  const stats = {};
  stats.totalSources = db.prepare('SELECT COUNT(*) as count FROM sources WHERE enabled = 1').get().count;
  stats.totalItems = db.prepare('SELECT COUNT(*) as count FROM items').get().count;
  stats.unreadItems = db.prepare('SELECT COUNT(*) as count FROM items WHERE read_at IS NULL').get().count;
  stats.unnotifiedItems = db.prepare('SELECT COUNT(*) as count FROM items WHERE notified_at IS NULL').get().count;
  stats.itemsToday = db.prepare(`
    SELECT COUNT(*) as count FROM items WHERE first_seen_at >= datetime('now', '-1 day')
  `).get().count;
  return stats;
}

// Import sources from feeds.json
function importSourcesFromConfig(feedsConfig) {
  const db = getDb();
  const insertStmt = db.prepare(`
    INSERT OR IGNORE INTO sources (name, feed_url, site_url, category, icon, fetch_interval_minutes, enabled)
    VALUES (?, ?, ?, ?, ?, 10, 1)
  `);

  let imported = 0;
  for (const category of feedsConfig.categories) {
    for (const feed of category.feeds) {
      const result = insertStmt.run(
        feed.name,
        feed.url,
        null,
        category.name,
        feed.icon
      );
      if (result.changes > 0) imported++;
    }
  }
  return imported;
}

function closeDatabase() {
  if (db) {
    db.close();
    db = null;
  }
}

module.exports = {
  initializeDatabase,
  getDb,
  generateGuid,
  // Sources
  getAllSources,
  getSourceById,
  getSourceByUrl,
  createSource,
  updateSourceFetchInfo,
  toggleSource,
  deleteSource,
  importSourcesFromConfig,
  // Items
  getItemByGuid,
  createItem,
  createItems,
  getLatestItems,
  getItemsBySource,
  searchItems,
  getUnnotifiedItems,
  markItemsAsNotified,
  markItemAsRead,
  markAllAsRead,
  getUnreadCount,
  cleanupOldItems,
  getStats,
  closeDatabase
};
