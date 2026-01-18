#!/usr/bin/env node
/**
 * Initialize the database and import sources from feeds.json
 */

require('dotenv').config();
const path = require('path');
const fs = require('fs');
const db = require('../src/database');

console.log('Initializing database...');

// Initialize tables
db.initializeDatabase();

// Load feeds.json
const feedsPath = path.join(__dirname, '..', 'feeds.json');
const feedsConfig = JSON.parse(fs.readFileSync(feedsPath, 'utf8'));

// Import sources
const imported = db.importSourcesFromConfig(feedsConfig);
console.log(`Imported ${imported} new sources`);

// Show stats
const stats = db.getStats();
console.log('\nDatabase stats:');
console.log(`  Total sources: ${stats.totalSources}`);
console.log(`  Total items: ${stats.totalItems}`);
console.log(`  Unread items: ${stats.unreadItems}`);

console.log('\nDatabase initialized successfully!');
db.closeDatabase();
