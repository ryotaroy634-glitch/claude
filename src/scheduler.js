const cron = require('node-cron');
const collector = require('./collector');
const notifier = require('./notifier');
const db = require('./database');

let collectionJob = null;
let cleanupJob = null;
let isRunning = false;

// Run collection and notification cycle
async function runCycle() {
  if (isRunning) {
    console.log('Previous cycle still running, skipping...');
    return;
  }

  isRunning = true;
  console.log(`\n[${new Date().toISOString()}] Starting scheduled cycle...`);

  try {
    // Run collection
    const collectionResult = await collector.runCollectionCycle();

    // Run notification if there are new items
    if (collectionResult.unnotifiedItems && collectionResult.unnotifiedItems.length > 0) {
      console.log(`Sending notification for ${collectionResult.unnotifiedItems.length} new items...`);
      const notifyResult = await notifier.runNotificationCycle();
      console.log('Notification result:', notifyResult);
    } else {
      console.log('No new items to notify');
    }

    return collectionResult;
  } catch (error) {
    console.error('Cycle error:', error);
    return { status: 'error', error: error.message };
  } finally {
    isRunning = false;
  }
}

// Start the scheduler
function start(intervalMinutes = 10) {
  console.log(`Starting scheduler with ${intervalMinutes}-minute interval...`);

  // Validate interval
  if (intervalMinutes < 1 || intervalMinutes > 60) {
    console.warn(`Invalid interval ${intervalMinutes}, using default 10 minutes`);
    intervalMinutes = 10;
  }

  // Build cron expression
  let cronExpression;
  if (intervalMinutes === 1) {
    cronExpression = '* * * * *'; // Every minute
  } else if (60 % intervalMinutes === 0) {
    cronExpression = `*/${intervalMinutes} * * * *`; // Every N minutes
  } else {
    // For non-divisible intervals, use minutes list
    const minutes = [];
    for (let i = 0; i < 60; i += intervalMinutes) {
      minutes.push(i);
    }
    cronExpression = `${minutes.join(',')} * * * *`;
  }

  console.log(`Cron expression: ${cronExpression}`);

  // Schedule collection job
  collectionJob = cron.schedule(cronExpression, async () => {
    await runCycle();
  }, {
    timezone: process.env.TZ || 'UTC'
  });

  // Schedule daily cleanup job (at 3 AM)
  cleanupJob = cron.schedule('0 3 * * *', () => {
    console.log('Running daily cleanup...');
    const retentionDays = parseInt(process.env.RETENTION_DAYS || '90');
    const result = db.cleanupOldItems(retentionDays);
    console.log(`Cleaned up ${result.changes} old items`);
  }, {
    timezone: process.env.TZ || 'UTC'
  });

  console.log('Scheduler started');

  // Run initial collection
  console.log('Running initial collection...');
  runCycle().then(() => {
    console.log('Initial collection complete');
  });

  return { collectionJob, cleanupJob };
}

// Stop the scheduler
function stop() {
  if (collectionJob) {
    collectionJob.stop();
    collectionJob = null;
  }
  if (cleanupJob) {
    cleanupJob.stop();
    cleanupJob = null;
  }
  console.log('Scheduler stopped');
}

// Get scheduler status
function getStatus() {
  return {
    isRunning,
    collectionJobActive: collectionJob ? collectionJob.running : false,
    cleanupJobActive: cleanupJob ? cleanupJob.running : false
  };
}

// Manual trigger
async function triggerNow() {
  return await runCycle();
}

module.exports = {
  start,
  stop,
  getStatus,
  triggerNow,
  runCycle
};
