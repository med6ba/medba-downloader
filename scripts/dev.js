const { spawn } = require('child_process');
const path = require('path');

const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const rootDir = path.resolve(__dirname, '..');

const children = [
  startProcess('server', ['run', 'dev', '--prefix', path.join(rootDir, 'server')]),
  startProcess('client', ['run', 'dev', '--prefix', path.join(rootDir, 'client')])
];

let isShuttingDown = false;

function startProcess(name, args) {
  const child = spawn(npmCmd, args, {
    cwd: rootDir,
    stdio: 'inherit',
    env: process.env
  });

  child.on('error', (error) => {
    console.error(`[dev] Failed to start ${name}: ${error.message}`);
    shutdown(1);
  });

  child.on('exit', (code, signal) => {
    if (isShuttingDown) {
      return;
    }

    const exitCode = typeof code === 'number' ? code : 1;
    console.error(
      `[dev] ${name} exited${signal ? ` (signal: ${signal})` : ''} with code ${exitCode}. Stopping all processes.`
    );
    shutdown(exitCode);
  });

  return child;
}

function shutdown(exitCode) {
  if (isShuttingDown) {
    return;
  }

  isShuttingDown = true;

  for (const child of children) {
    if (child && !child.killed) {
      child.kill('SIGTERM');
    }
  }

  setTimeout(() => {
    for (const child of children) {
      if (child && !child.killed) {
        child.kill('SIGKILL');
      }
    }
    process.exit(exitCode);
  }, 1200).unref();
}

process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));
