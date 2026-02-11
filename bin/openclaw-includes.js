#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

function printUsage() {
  console.log('Usage: openclaw-includes init [--force]');
}

function initCommand(force) {
  const homeDir = os.homedir();
  const targetDir = path.join(homeDir, '.openclaw-includes');
  const templatesDir = path.resolve(__dirname, '..', 'templates');

  if (!fs.existsSync(templatesDir)) {
    console.error(`Templates directory not found: ${templatesDir}`);
    process.exit(1);
  }

  if (fs.existsSync(targetDir)) {
    if (!force) {
      console.error(`Directory already exists: ${targetDir}`);
      console.error('Use --force to overwrite it.');
      process.exit(1);
    }

    fs.rmSync(targetDir, { recursive: true, force: true });
  }

  fs.mkdirSync(targetDir, { recursive: true });
  fs.cpSync(templatesDir, targetDir, { recursive: true });

  console.log(`Initialized ${targetDir}`);
}

function main() {
  const args = process.argv.slice(2);
  const command = args[0];

  if (!command || command === '--help' || command === '-h') {
    printUsage();
    process.exit(command ? 0 : 1);
  }

  if (command !== 'init') {
    console.error(`Unknown command: ${command}`);
    printUsage();
    process.exit(1);
  }

  const validFlags = new Set(['--force']);
  const flags = args.slice(1);

  for (const flag of flags) {
    if (!validFlags.has(flag)) {
      console.error(`Unknown option: ${flag}`);
      printUsage();
      process.exit(1);
    }
  }

  initCommand(flags.includes('--force'));
}

main();
