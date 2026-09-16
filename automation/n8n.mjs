import fs from 'node:fs';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dataRoot = path.join(root, 'data');
fs.mkdirSync(dataRoot, { recursive: true });
const configPath = path.join(dataRoot, 'automation-secrets.json');
if (!fs.existsSync(configPath)) fs.writeFileSync(configPath, JSON.stringify({ encryptionKey: randomBytes(32).toString('hex'), bridgeToken: randomBytes(32).toString('hex') }), { mode: 0o600, flag: 'wx' });
const secrets = JSON.parse(fs.readFileSync(configPath, 'utf8'));
const env = {
  ...process.env,
  N8N_USER_FOLDER: path.join(dataRoot, 'n8n'),
  N8N_ENCRYPTION_KEY: secrets.encryptionKey,
  N8N_HOST: 'localhost', N8N_PORT: '5678', N8N_LISTEN_ADDRESS: '127.0.0.1',
  N8N_PROTOCOL: 'http', N8N_EDITOR_BASE_URL: 'http://localhost:5678', WEBHOOK_URL: 'http://localhost:5678/',
  GENERIC_TIMEZONE: 'America/Sao_Paulo', TZ: 'America/Sao_Paulo',
  N8N_DIAGNOSTICS_ENABLED: 'false', N8N_PERSONALIZATION_ENABLED: 'false',
  N8N_BLOCK_ENV_ACCESS_IN_NODE: 'true', N8N_PYTHON_ENABLED: 'false',
  N8N_DEFAULT_BINARY_DATA_MODE: 'filesystem',
  EXECUTIONS_DATA_PRUNE: 'true', EXECUTIONS_DATA_MAX_AGE: '168', EXECUTIONS_DATA_PRUNE_MAX_COUNT: '1000',
  N8N_RUNNERS_ENABLED: 'true', N8N_RUNNERS_MODE: 'internal',
};
const args = process.argv.slice(2);
const child = spawn(process.execPath, [path.join(root, '.runtime/n8n/node_modules/n8n/bin/n8n'), ...(args.length ? args : ['start'])], { env, cwd: root, stdio: 'inherit', windowsHide: true });
child.on('error', error => { console.error(error.message); process.exitCode = 1; });
child.on('exit', code => { process.exitCode = code || 0; });
process.on('SIGINT', () => child.kill('SIGINT'));
process.on('SIGTERM', () => child.kill('SIGTERM'));
