#!/usr/bin/env node
/**
 * Manually run a collection cycle
 */

require('dotenv').config();
const db = require('../src/database');
const collector = require('../src/collector');
const notifier = require('../src/notifier');

async function main() {
  console.log('Starting manual collection...\n');

  // Initialize database
  db.initializeDatabase();

  // Check if sources exist
  const sources = db.getAllSources();
  if (sources.length === 0) {
    console.log('No sources found. Run `npm run init-db` first.');
    process.exit(1);
  }

  console.log(`Found ${sources.length} sources`);

  // Run collection
  const result = await collector.runCollectionCycle();

  // Check for notification flag
  const sendEmail = process.argv.includes('--notify');

  if (sendEmail && result.unnotifiedItems && result.unnotifiedItems.length > 0) {
    console.log('\nSending notification email...');
    const notifyResult = await notifier.runNotificationCycle();
    console.log('Notification result:', notifyResult);
  }

  // Show stats
  const stats = db.getStats();
  console.log('\nFinal stats:');
  console.log(`  Total items: ${stats.totalItems}`);
  console.log(`  Unread items: ${stats.unreadItems}`);
  console.log(`  Unnotified items: ${stats.unnotifiedItems}`);
  console.log(`  Items today: ${stats.itemsToday}`);

  db.closeDatabase();
  console.log('\nCollection complete!');
}

main().catch(error => {
  console.error('Error:', error);
  process.exit(1);
});
