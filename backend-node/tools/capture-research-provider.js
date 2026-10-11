// Optional research evidence capture. Never records credentials or headers.
// Usage: RESEARCH_CAPTURE_DIR=<isolated directory> node -r ./tools/capture-research-provider.js src/server.js
const fs = require('node:fs');
const path = require('node:path');
const https = require('node:https');
const out = process.env.RESEARCH_CAPTURE_DIR;
if (out) {
  fs.mkdirSync(out, { recursive: true });
  const original = https.request;
  let count = 0;
  https.request = function (options, callback) {
    const host = typeof options === 'string' ? new URL(options).hostname : options.hostname || options.host;
    if (host !== 'api.deepseek.com') return original.apply(this, arguments);
    const id = `${Date.now()}-${++count}`;
    const started = Date.now();
    let body = '';
    const req = original.call(this, options, response => {
      const chunks = [];
      response.on('data', chunk => chunks.push(chunk));
      response.on('end', () => {
        fs.writeFileSync(path.join(out, `${id}-response.sse`), Buffer.concat(chunks));
        fs.writeFileSync(path.join(out, `${id}-result.json`), JSON.stringify({ status: response.statusCode, elapsed_ms: Date.now() - started }));
      });
      if (callback) callback(response);
    });
    const write = req.write.bind(req);
    req.write = function (chunk, ...args) { body += chunk.toString(); return write(chunk, ...args); };
    req.on('finish', () => fs.writeFileSync(path.join(out, `${id}-request.json`), body));
    req.on('error', error => fs.writeFileSync(path.join(out, `${id}-error.json`), JSON.stringify({ error: error.code || 'REQUEST_FAILED', elapsed_ms: Date.now() - started })));
    return req;
  };
}
