const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { postJSONWithTimeout } = require('../src/services/aiClient');

function serverFor(handler) {
  const s = http.createServer(handler);
  return new Promise(resolve => s.listen(0, '127.0.0.1', () => resolve(s)));
}

for (const [code, body] of [[200, { data: [{ url: 'https://x/img.jpg' }] }], [400, { error: { code: 'BadRequest', message: 'bad input' }, request_id: 'req-400' }], [429, { error: { code: 'RateLimit', message: 'slow down' }, request_id: 'req-429' }], [500, { error: { code: 'Internal', message: 'broken' }, request_id: 'req-500' }]]) {
  test(`captures HTTP ${code} response`, async () => {
    const s = await serverFor((req, res) => { res.setHeader('x-request-id', `header-${code}`); res.writeHead(code, { 'content-type': 'application/json' }); res.end(JSON.stringify(body)); });
    const out = await postJSONWithTimeout(`http://127.0.0.1:${s.address().port}/v1/images/generations`, { Authorization: 'Bearer redacted' }, { model: 'mock', image: ['data:image/jpeg;base64,AA'] }, 1000);
    assert.equal(out.statusCode, code); assert.ok(out.durationMs >= 0); assert.equal(out.headers['x-request-id'], `header-${code}`); assert.match(out.raw, code === 200 ? /img/ : /request_id/); s.close();
  });
}

test('captures timeout without retry', async () => {
  const s = await serverFor(() => {});
  await assert.rejects(() => postJSONWithTimeout(`http://127.0.0.1:${s.address().port}`, {}, {}, 20), e => e.code === 'IMAGE_HTTP_TIMEOUT' && e.kind === 'timeout');
  s.close();
});

test('captures connection interruption', async () => {
  const s = await serverFor(req => req.socket.destroy());
  await assert.rejects(() => postJSONWithTimeout(`http://127.0.0.1:${s.address().port}`, {}, {}, 1000), e => e.kind === 'connection');
  s.close();
});
