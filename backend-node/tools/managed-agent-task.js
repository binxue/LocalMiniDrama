// Ordinary terminal client. All cloud execution and credentials remain in the backend.
const fs = require('fs');
async function main() {
  const [command, argument] = process.argv.slice(2);
  const base = process.env.LOCALMINIDRAMA_URL || 'http://127.0.0.1:5688';
  let url = '/api/v1/managed-agent/tasks';
  const options = {};
  if (command === 'create') {
    if (!argument) throw new Error('create requires a JSON request file');
    const body = JSON.parse(fs.readFileSync(argument, 'utf8').replace(/^\uFEFF/, ''));
    options.method = 'POST'; options.headers = { 'Content-Type': 'application/json' }; options.body = JSON.stringify(body);
  } else if (command === 'get' || command === 'refresh') {
    if (!argument) throw new Error('task id required');
    url += '/' + encodeURIComponent(argument);
    if (command === 'refresh') { url += '/refresh'; options.method = 'POST'; }
  } else if (command === 'agents') url = '/api/v1/managed-agent/agents';
  else if (command !== 'list') throw new Error('Use create <request.json> | get <task_id> | refresh <task_id> | list | agents');
  const res = await fetch(base + url, options);
  const text = await res.text();
  process.stdout.write(text + '\n');
  if (!res.ok) process.exitCode = 1;
}
main().catch(err => { console.error(JSON.stringify({ error: err.message, cause: err.cause?.code || null, address: err.cause?.address || null, port: err.cause?.port || null })); process.exitCode = 1; });
