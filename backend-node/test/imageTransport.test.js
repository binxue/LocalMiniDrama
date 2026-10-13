const { test } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { postJSONWithTimeout } = require('../src/services/aiClient');
async function server(handler, action) {
  const service = http.createServer(handler);
  await new Promise(resolve => service.listen(0, '127.0.0.1', resolve));
  try { await action('http://127.0.0.1:' + service.address().port + '/images'); }
  finally { service.closeAllConnections(); await new Promise(resolve => service.close(resolve)); }
}
test('complete upload and HTTP request ID survive transport telemetry without secrets', async () => {
  await server((req, res) => { req.resume(); req.on('end', () => { res.setHeader('x-request-id', 'local-test-only'); res.end('{}'); }); }, async url => {
    const output = await postJSONWithTimeout(url, { Authorization: 'Bearer test-secret' }, { image: 'test-only' }, 1000);
    assert.equal(output.statusCode, 200);
    assert.equal(output.transport.request_id, 'local-test-only');
    assert.equal(output.transport.response_bytes, 2);
    assert.equal(typeof output.transport.phases.upload_flushed, 'number');
    assert.equal(JSON.stringify(output.transport).includes('test-secret'), false);
  });
});
test('reset before headers is retained without inventing a cloud acceptance ID', async () => {
  await server(req => { req.resume(); req.on('end', () => req.socket.destroy()); }, async url => {
    await assert.rejects(postJSONWithTimeout(url, {}, {}, 1000), error => {
      assert.equal(error.code, 'ECONNRESET');
      assert.equal(typeof error.transport.phases.upload_flushed, 'number');
      assert.equal(error.transport.request_id, undefined);
      assert.equal(error.transport.status_code, undefined);
      return true;
    });
  });
});
test('reset after headers preserves response status, ID and partial byte count', async () => {
  await server((req, res) => { req.resume(); res.writeHead(200, { 'x-request-id': 'partial-test', 'Content-Length': 100 }); res.write('partial'); setTimeout(() => res.destroy(), 15); }, async url => {
    await assert.rejects(postJSONWithTimeout(url, {}, {}, 1000), error => {
      assert.equal(error.transport.status_code, 200);
      assert.equal(error.transport.request_id, 'partial-test');
      assert.equal(error.transport.response_bytes, 7);
      return true;
    });
  });
});
