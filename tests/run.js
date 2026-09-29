// Runs every test file that exists, in order; stops at the first failure. Usage: npm test
const { spawnSync } = require('child_process'), fs = require('fs'), path = require('path');
for (const f of ['merge.test.js', 'stats.test.js', 'progress.test.js', 'schedule.test.js', 'core.test.js', 'goals.test.js', 'alerts.test.js', 'backend.test.js', 'theme.test.js', 'smoke.js', 'smoke-workout.js', 'smoke-progress.js', 'smoke-schedule.js', 'smoke-core.js', 'smoke-goals.js', 'smoke-alerts.js', 'smoke-theme.js']) {
  const p = path.join(__dirname, f);
  if (!fs.existsSync(p)) continue;
  console.log('▶ ' + f);
  const r = spawnSync(process.execPath, [p], { stdio: 'inherit' });
  if (r.status !== 0) process.exit(r.status || 1);
}
console.log('All tests passed');
