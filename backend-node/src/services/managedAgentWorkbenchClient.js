// Thin adapter for the already deployed Ark Managed Agents and installed CLI.
// No raw endpoints/signing, mock reviews, or automatic write retries.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawn } = require('node:child_process');
const { hash } = require('./managedAgentReviewEvidence');
const { tokenEstimate, unknown: unknownPrice } = require('./modelPricingCatalog');

function parseAgentJson(text) {
  let raw = String(text || '').trim();
  const fence = String.fromCharCode(96).repeat(3);
  if (raw.startsWith(fence) && raw.endsWith(fence)) raw = raw.slice(3, -3).replace(/^json\s*/i, '').trim();
  return JSON.parse(raw);
}
function redact(text) {
  return String(text).replace(/Bearer\s+[^\s"']+/gi, 'Bearer [REDACTED]')
    .replace(/((?:api[_-]?key|secret[_-]?(?:access[_-]?)?key|access[_-]?key|token)\s*["']?\s*[:=]\s*["']?)[^\s"',}]+/gi, '$1[REDACTED]');
}
class ManagedAgentWorkbenchClient {
  constructor({ root, cliEntry, profile = 'platform_cn-beijing_default', onExecution = () => {} }) {
    this.root = root;
    this.cliEntry = cliEntry || process.env.LOCALMINIDRAMA_ARKCLI_ENTRY
      || path.join(process.env.APPDATA || '', 'npm/node_modules/@volcengine/ark-cli/scripts/run.js');
    this.profile = profile;
    this.onExecution = onExecution;
  }
  async command(args, evidenceName) {
    if (!fs.existsSync(this.cliEntry)) throw new Error('Installed arkcli entry is unavailable');
    const result = await new Promise(resolve => {
      const child = spawn(process.execPath, [this.cliEntry, ...args, '--profile', this.profile, '--format', 'json'],
        { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
      let stdout = '', stderr = '', failure = null;
      const timer = setTimeout(() => { failure = 'CLI_TIMEOUT'; child.kill(); }, 120000);
      child.stdout.on('data', data => { stdout += data; if (stdout.length > 16 * 1024 * 1024) { failure = 'CLI_OUTPUT_LIMIT'; child.kill(); } });
      child.stderr.on('data', data => { stderr += data; });
      child.on('error', error => { failure = error.code || 'CLI_START_FAILED'; });
      child.on('close', code => { clearTimeout(timer); resolve({ code, stdout, stderr, failure }); });
    });
    fs.mkdirSync(this.root, { recursive: true });
    fs.writeFileSync(path.join(this.root, evidenceName + '.json'), JSON.stringify({
      at: new Date().toISOString(), exit_code: result.code, failure: result.failure,
      stdout: redact(result.stdout), stderr: redact(result.stderr),
    }, null, 2), { flag: 'wx', mode: 0o600 });
    if (result.failure || result.code !== 0) {
      let remoteMessage = '';
      try { remoteMessage = redact(JSON.parse(result.stderr.slice(result.stderr.indexOf('{'))).error?.message || '').slice(0, 900); } catch (_) {}
      const error = new Error('Managed Agent CLI failed: ' + (result.failure || 'EXIT_' + result.code)
        + (remoteMessage ? '; ' + remoteMessage : '') + '; evidence: ' + evidenceName);
      error.code = /SSO STS|refresh_token.*invalid|STS.*续期失败/i.test(remoteMessage) ? 'AUTH_EXPIRED' : (result.failure || 'CLI_FAILED');
      error.evidence = evidenceName;
      throw error;
    }
    return JSON.parse(result.stdout);
  }
  async run({ agentId, agentName, environmentId, stage, input, images = [] }) {
    const execution = {
      execution_id: 'exec-' + crypto.randomUUID(), agent_id: agentId, agent_name: agentName,
      stage, input_hash: hash(JSON.stringify(input)), session_id: null, submit_event_id: null,
      result_event_id: null, execution_status: 'PENDING', started_at: new Date().toISOString(),
      media: images.map(file => ({ filename: path.basename(file), sha256: hash(fs.readFileSync(file)) })),
      estimated_cost_cny: null, actual_cost_cny: null, billing_status: 'PENDING_SETTLEMENT',
    };
    const prefix = execution.execution_id;
    const persist = () => this.onExecution({ ...execution });
    persist();
    try {
      const auth = await this.command(['auth', 'status'], prefix + '-auth');
      if (!auth.logged_in || auth.active_profile?.type !== 'platform') throw new Error('Authenticated Platform profile required');
      const agent = await this.command(['agent', 'agent', 'get', agentId], prefix + '-agent');
      const definition = agent.Result || agent;
      if (definition.Id !== agentId || definition.Name !== agentName) throw new Error('Agent identity mismatch');
      execution.model = definition.Model;
      execution.execution_status = 'UNKNOWN';
      persist();
      const created = await this.command(['agent', 'session', 'create', '--agent-id', agentId,
        '--environment-id', environmentId, '--title', 'LocalMiniDrama ' + stage + ' ' + execution.execution_id], prefix + '-create');
      const session = created.Result || created.data || created;
      execution.session_id = session.Id || session.id || session.SessionId;
      if (!execution.session_id) throw new Error('Session create response lacks real session id');
      persist();
      const prompt = input.instructions + '\nReturn only JSON. Echo these exact binding fields: '
        + JSON.stringify({ execution_id: execution.execution_id, input_hash: execution.input_hash })
        + '\nApproved input: ' + JSON.stringify(input.context);
      const promptFile = path.join(this.root, prefix + '-prompt.txt');
      fs.writeFileSync(promptFile, prompt, { flag: 'wx', mode: 0o600 });
      const sendArgs = ['agent', 'session', 'events', 'send', execution.session_id,
        '--type', 'user.message', '--text', prompt];
      for (const file of images) sendArgs.push('--image', '@' + file);
      execution.submitted_at = new Date().toISOString();
      persist(); // Unknown is durable before send, including file uploads.
      const receipt = await this.command(sendArgs, prefix + '-send');
      const submitted = (receipt.data || []).find(event => event.type === 'user.message' && event.id);
      if (!submitted) throw new Error('Real submission cursor missing; do not resend');
      const attachments = (submitted.content || []).filter(item => item.type === 'image' && item.source?.file_id);
      const actualText = (submitted.content || []).filter(item => item.type === 'text').map(item => item.text).join('');
      if (actualText !== prompt || attachments.length !== images.length) throw new Error('Actual submitted content/attachments mismatch');
      execution.submit_event_id = submitted.id;
      execution.file_ids = attachments.map(item => item.source.file_id);
      execution.execution_status = 'RUNNING';
      persist();
      return await this.collect(execution, prefix);
    } catch (error) {
      execution.error = { code: error.code || 'AGENT_EXECUTION_FAILED', message: error.message, evidence: error.evidence || null };
      if (execution.remote_completed) execution.execution_status = 'INVALID_RESPONSE';
      else if (execution.execution_status === 'RUNNING') execution.execution_status = 'UNKNOWN';
      else if (execution.execution_status === 'PENDING') {
        execution.execution_status = 'FAILED';
        execution.billing_status = 'NOT_SUBMITTED';
      }
      persist();
      throw error;
    }
  }
  async collect(execution, prefix = execution.execution_id + '-resume-' + Date.now()) {
    if (!execution.session_id || !execution.submit_event_id) throw new Error('Existing remote session and submission cursor required');
    if (execution.error) {
      execution.previous_errors = [...(execution.previous_errors || []), execution.error];
      delete execution.error;
    }
    execution.execution_status = 'RUNNING';
    const persist = () => this.onExecution({ ...execution });
    persist();
    try {
      const events = new Map();
      let cursor = execution.submit_event_id;
      const deadline = Date.now() + 240000;
      let pageIndex = 0, idle = false;
      while (Date.now() < deadline) {
        const page = await this.command(['agent', 'session', 'events', 'list', execution.session_id,
          '--after', cursor, '--order', 'asc', '--limit', '100'], prefix + '-events-' + pageIndex++);
        if (!Array.isArray(page.data)) throw new Error('Event response schema is invalid');
        for (const event of page.data) {
          if (!event.id) continue;
          // Current CLI/server may include the cursor event and earlier status
          // events from the same timestamp. The exact submitted message is not
          // a concurrent turn; another user message still fails closed.
          if (event.id === execution.submit_event_id) continue;
          events.set(event.id, event);
          cursor = event.id;
          if (event.type === 'user.message') throw new Error('Concurrent turn: ambiguous Agent response');
          if (['session.error', 'session.status_failed', 'session.status_terminated', 'session.requires_action'].includes(event.type)) throw new Error('Agent remote failure: ' + event.type);
          if (event.type === 'session.status_idle') idle = true;
        }
        if (idle && !page.next_page) break;
        if (!page.next_page) await new Promise(resolve => setTimeout(resolve, 2000));
      }
      if (!idle) throw new Error('Agent result timeout; retain session/cursor and do not resend');
      const all = [...events.values()];
      const messages = all.filter(event => event.type === 'agent.message');
      const message = messages.at(-1);
      if (!message) throw new Error('Current Agent response missing');
      execution.result_event_id = message.id;
      const usage = all.filter(event => event.type === 'span.model_request_end' && event.model_usage).map(event => event.model_usage);
      execution.token_usage = usage.reduce((total, value) => ({
        input_tokens: total.input_tokens + (Number(value.input_tokens) || 0),
        output_tokens: total.output_tokens + (Number(value.output_tokens) || 0),
        cache_read_input_tokens: total.cache_read_input_tokens + (Number(value.cache_read_input_tokens) || 0),
      }), { input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 0 });
      // The Agent definition currently exposes an endpoint ID, not a billable
      // foundation model. Keep usage evidence, but do not invent a price.
      const priced = unknownPrice(execution.model, 'AGENT_FOUNDATION_MODEL_UNRESOLVED');
      execution.estimated_cost_cny = priced.estimated_cost_cny;
      execution.pricing_status = priced.pricing_status;
      execution.pricing_version = priced.pricing_version;
      execution.pricing_unknown_reason = priced.unknown_reason;
      execution.remote_completed = true;
      persist();
      const result = parseAgentJson((message.content || []).filter(item => item.type === 'text').map(item => item.text).join(''));
      if (result.execution_id !== execution.execution_id || result.input_hash !== execution.input_hash) throw new Error('Agent returned stale/unbound JSON');
      execution.execution_status = 'COMPLETED';
      execution.completed_at = new Date().toISOString();
      execution.result = result;
      persist();
      return { execution, result };
    } catch (error) {
      execution.error = { code: error.code || 'AGENT_EXECUTION_FAILED', message: error.message, evidence: error.evidence || null };
      if (execution.remote_completed) execution.execution_status = 'INVALID_RESPONSE';
      else if (execution.execution_status === 'RUNNING') execution.execution_status = 'UNKNOWN';
      persist();
      throw error;
    }
  }
}
module.exports = { ManagedAgentWorkbenchClient, parseAgentJson, redact };
