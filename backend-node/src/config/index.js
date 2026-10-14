const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');

const configPaths = [
  ...(process.env.LOCALMINIDRAMA_CONFIG_PATH ? [process.env.LOCALMINIDRAMA_CONFIG_PATH] : []),
  path.join(process.cwd(), 'configs', 'config.yaml'),
  path.join(process.cwd(), 'config.yaml'),
  path.join(__dirname, '..', '..', 'configs', 'config.yaml'),
];

function loadConfig() {
  if (process.env.LOCALMINIDRAMA_CONFIG_PATH && !fs.existsSync(process.env.LOCALMINIDRAMA_CONFIG_PATH)) {
    throw new Error('Explicit LocalMiniDrama configuration does not exist');
  }
  let raw = null;
  for (const p of configPaths) {
    if (fs.existsSync(p)) {
      raw = fs.readFileSync(p, 'utf8');
      break;
    }
  }
  if (!raw) {
    throw new Error('Config file not found: configs/config.yaml');
  }
  const parsed = yaml.load(raw);
  if (!parsed?.app?.name) {
    throw new Error('Invalid config: missing app section');
  }
  return parsed;
}

module.exports = { loadConfig };
