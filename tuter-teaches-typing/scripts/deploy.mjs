// `pnpm deploy`: installs the app with `now-sdk install`, passing through any
// extra arguments (e.g. --reinstall, --auth <alias>).
//
// now-sdk normally uses the default login saved with `now-sdk auth`. When this
// machine has none, the install is retried once against the dev instance in
// .env (GLIDE_ORIGIN and AUTH_TOKEN, the login `pnpm dev` already uses),
// through now-sdk's environment-variable (CI) mode. That login is only handed
// to the child process: it is never saved or printed.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const cli = path.join(rootDir, 'node_modules', '@servicenow', 'sdk', 'bin', 'index.js');
const args = ['install', ...process.argv.slice(2)];
const NO_DEFAULT_LOGIN = 'Default Credential has not been set';

// Runs now-sdk, echoing its output, and resolves with {code, output}.
function nowSdk(env) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [cli, ...args], { cwd: rootDir, env });
    let output = '';
    [
      [child.stdout, process.stdout],
      [child.stderr, process.stderr],
    ].forEach(([from, to]) => {
      from.on('data', (chunk) => {
        output += chunk;
        to.write(chunk);
      });
    });
    child.on('close', (code) => resolve({ code: code ?? 1, output }));
  });
}

// The dev instance login from .env, as now-sdk CI variables, or null.
function envLogin() {
  const file = path.join(rootDir, '.env');
  if (!fs.existsSync(file)) return null;
  const vars = {};
  fs.readFileSync(file, 'utf8').split(/\r?\n/).forEach((line) => {
    const match = /^([A-Z_]+)=(.*)$/.exec(line);
    if (match) vars[match[1]] = match[2].trim();
  });
  const basic = /^Basic\s+(\S+)$/.exec(vars.AUTH_TOKEN || '');
  if (!vars.GLIDE_ORIGIN || !basic) return null;
  const pair = Buffer.from(basic[1], 'base64').toString('utf8');
  const colon = pair.indexOf(':');
  if (colon < 1) return null;
  return {
    instance: vars.GLIDE_ORIGIN,
    env: {
      SN_SDK_NODE_ENV: 'SN_SDK_CI_INSTALL',
      SN_SDK_AUTH_TYPE: 'basic',
      SN_SDK_INSTANCE_URL: vars.GLIDE_ORIGIN,
      SN_SDK_USER: pair.slice(0, colon),
      SN_SDK_USER_PWD: pair.slice(colon + 1),
    },
  };
}

let result = await nowSdk(process.env);
if (result.code !== 0 && result.output.includes(NO_DEFAULT_LOGIN)) {
  const login = envLogin();
  if (login) {
    console.log(
      `\nNo default now-sdk login on this machine; deploying to ${login.instance} with the login in .env.\n`,
    );
    result = await nowSdk({ ...process.env, ...login.env });
  }
}
process.exit(result.code);
