const { spawn, execSync } = require('child_process');
const path = require('path');

// ================== CONFIG ==================
const WSL_DISTRO = 'Ubuntu';
const SERVER_DIR = '~/crypto-server';         // inside WSL
const ELECTRON_DIR = __dirname;               // current folder (electron_app)
const HARDHAT_DIR = path.resolve(__dirname, '..', 'hardhat');
// ============================================

// ANSI colours
const C = {
  cyan: '\x1b[36m',
  magenta: '\x1b[35m',
  yellow: '\x1b[33m',
  green: '\x1b[32m',
  reset: '\x1b[0m',
};

// Helper to spawn a process with labelled output
function startProcess(label, color, command, args, cwd, useShell = false) {
  console.log(`${color}[${label}] Starting...${C.reset}`);
  const proc = spawn(command, args, {
    cwd,
    shell: useShell,
  });
  proc.stdout.on('data', (data) => {
    process.stdout.write(`${color}[${label}]${C.reset} ${data}`);
  });
  proc.stderr.on('data', (data) => {
    process.stderr.write(`${color}[${label}]${C.reset} ${data}`);
  });
  proc.on('error', (err) => {
    console.error(`${color}[${label}] SPAWN ERROR: ${err.message}${C.reset}`);
  });
  proc.on('close', (code) => {
    console.log(`${color}[${label}] exited with code ${code}${C.reset}`);
  });
  return proc;
}

// Kill any process on port 5000 inside WSL
function killPort5000() {
  return new Promise((resolve) => {
    console.log('🔪 Killing anything on port 5000 in WSL...');
    const kill = spawn('wsl', [
      '-d', WSL_DISTRO,
      '--', 'bash', '-c',
      'fuser -k 5000/tcp || true'
    ]);
    kill.on('close', resolve);
  });
}

// Run deployment synchronously (waits until finished)
function deployContract() {
  console.log(`\n${C.yellow}[Hardhat] Deploying contract...${C.reset}\n`);
  try {
    execSync('npx hardhat run scripts/deploy.js --network sepolia', {
      cwd: HARDHAT_DIR,
      stdio: 'inherit',   // show all output as-is
      shell: true
    });
    console.log(`${C.green}[Hardhat] Deployment complete.${C.reset}\n`);
  } catch (err) {
    console.error(`${C.yellow}[Hardhat] Deployment failed: ${err.message}${C.reset}`);
  }
}

async function main() {
  console.log('🚀 Starting DApp environment (sequential order)\n');

  // Step 0: Free port
  await killPort5000();

  // Step 1: Deploy contract (waits here until done)
  deployContract();

  // Step 2: Start Electron app (background, with label)
  startProcess(
    'Electron',
    C.magenta,
    'npm',
    ['start'],
    ELECTRON_DIR,
    true   // npm.cmd needs shell
  );

  // Step 3: Start TB-PRE server (last – its logs stay visible)
  startProcess(
    'TB-PRE',
    C.cyan,
    'wsl',
    [
      '-d', WSL_DISTRO,
      '--', 'bash', '-c',
      `cd ${SERVER_DIR} && source venv/bin/activate && python a.py`
    ],
    undefined,
    false  // wsl.exe doesn't need shell
  );

  console.log('✅ All services launched. Server output above.\n');
}

main().catch(console.error);