#!/usr/bin/env node
/**
 * OSK backend preflight checker.
 * Verifies Node version, env file, required env vars, and TCP-reachability of
 * MongoDB and Redis. Hard failures exit 1; service checks only warn (the shell
 * runs without them). Zero dependencies.
 */
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import net from 'node:net';

const REQUIRED_NODE_MAJOR = 22;
const ENV_FILE = '.env';
const REQUIRED_ENV = ['MONGODB_URI', 'REDIS_URL', 'JWT_ACCESS_SECRET', 'JWT_REFRESH_SECRET'];

const ok = (m) => console.log(`  \x1b[32m✓\x1b[0m ${m}`);
const warn = (m) => console.log(`  \x1b[33m!\x1b[0m ${m}`);
const fail = (m) => console.log(`  \x1b[31m✗\x1b[0m ${m}`);

let hardFailures = 0;

console.log('\nOSK backend — preflight\n');

// 1. Node version
const major = Number(process.versions.node.split('.')[0]);
if (major >= REQUIRED_NODE_MAJOR) ok(`Node ${process.versions.node}`);
else {
  fail(`Node ${process.versions.node} — OSK requires Node ${REQUIRED_NODE_MAJOR}+`);
  hardFailures++;
}

// 2. Env file + parse
const env = { ...process.env };
const envPath = resolve(process.cwd(), ENV_FILE);
if (existsSync(envPath)) {
  ok(`${ENV_FILE} present`);
  for (const line of readFileSync(envPath, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq > 0) env[trimmed.slice(0, eq).trim()] ||= trimmed.slice(eq + 1).trim();
  }
} else {
  fail(`${ENV_FILE} missing — run: cp .env.example ${ENV_FILE}`);
  hardFailures++;
}

// 3. Required env vars
for (const key of REQUIRED_ENV) {
  if (env[key]) ok(`${key} set`);
  else {
    fail(`${key} is required but not set`);
    hardFailures++;
  }
}

// 4. Service reachability (warn-only — the shell tolerates absence)
function ping(label, host, port) {
  return new Promise((res) => {
    const socket = net.createConnection({ host, port });
    const done = (up) => {
      socket.destroy();
      (up ? ok : warn)(`${label} ${up ? 'reachable' : `not reachable on ${host}:${port}`}`);
      res();
    };
    socket.setTimeout(1500);
    socket.once('connect', () => done(true));
    socket.once('timeout', () => done(false));
    socket.once('error', () => done(false));
  });
}

function hostPort(url, fallbackPort) {
  try {
    const u = new URL(url);
    return [u.hostname || '127.0.0.1', Number(u.port) || fallbackPort];
  } catch {
    return ['127.0.0.1', fallbackPort];
  }
}

const [mHost, mPort] = hostPort(env.MONGODB_URI ?? '', 27017);
const [rHost, rPort] = hostPort(env.REDIS_URL ?? '', 6379);
await ping('MongoDB', mHost, mPort);
await ping('Redis', rHost, rPort);

console.log('');
if (hardFailures > 0) {
  console.error(`Preflight failed with ${hardFailures} issue(s). Fix the above and retry.\n`);
  process.exit(1);
}
console.log('Preflight passed.\n');
