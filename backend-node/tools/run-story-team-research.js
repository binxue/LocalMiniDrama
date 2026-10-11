// Isolated research runner. Requires an external Runtime DB with a DeepSeek config.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const Database = require('better-sqlite3');
const { generateStoryTeam } = require('../src/services/storyTeamService');

const runtime = process.env.RESEARCH_RUNTIME_DIR;
if (!runtime || path.resolve(runtime) === path.resolve(__dirname, '..')) {
  throw new Error('Explicit external RESEARCH_RUNTIME_DIR required');
}
const out = path.join(runtime, 'research', 'story-team');
fs.mkdirSync(out, { recursive: true });
const premise = fs.readFileSync(process.env.RESEARCH_INPUT, 'utf8').trim();
const db = new Database(path.join(runtime, 'data', 'drama.db'));
const log = { info() {}, warn() {}, error() {} };

generateStoryTeam(db, log, { premise, episode_count: 3, model: 'deepseek-flash' })
  .then((result) => {
    fs.writeFileSync(path.join(out, 'input.json'), JSON.stringify({ premise, hash: crypto.createHash('sha256').update(premise).digest('hex') }, null, 2));
    fs.writeFileSync(path.join(out, 'team-result.json'), JSON.stringify(result, null, 2));
    fs.writeFileSync(path.join(out, 'team-final-three.txt'), result.final.episodes.map((e) => `第${e.episode}集 ${e.title}\n\n${e.content}`).join('\n\n════════════════\n\n'));
    console.log(JSON.stringify({ roles: result.audit.map((x) => x.role), episodes: result.final.episodes.length, accepted: result.review.accepted }, null, 2));
  })
  .catch((err) => {
    fs.writeFileSync(path.join(out, 'team-failure.json'), JSON.stringify({ error: err.message }, null, 2));
    console.error(err.message);
    process.exitCode = 1;
  })
  .finally(() => db.close());
