#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

function printUsage() {
  console.log('Usage: openclaw-includes init [--force]');
}

function getAgentNames(openclawConfigPath) {
  if (!fs.existsSync(openclawConfigPath)) {
    console.error(`Config file not found: ${openclawConfigPath}`);
    process.exit(1);
  }

  let parsed;
  try {
    parsed = JSON.parse(fs.readFileSync(openclawConfigPath, 'utf8'));
  } catch (error) {
    console.error(`Failed to parse JSON in ${openclawConfigPath}: ${error.message}`);
    process.exit(1);
  }

  const list = parsed && parsed.agents && parsed.agents.list;
  if (!Array.isArray(list)) {
    console.error(`Invalid config format in ${openclawConfigPath}: expected .agents.list array`);
    process.exit(1);
  }

  const agentNames = new Set();
  for (const agent of list) {
    if (!agent || typeof agent.workspace !== 'string' || agent.workspace.trim() === '') {
      continue;
    }

    const normalizedWorkspace = agent.workspace.replace(/[\\/]+$/, '');
    const dirName = path.basename(normalizedWorkspace);
    if (dirName && dirName !== '.' && dirName !== path.sep) {
      agentNames.add(dirName);
    }
  }

  if (agentNames.size === 0) {
    console.error(`No valid agent workspaces found in ${openclawConfigPath}`);
    process.exit(1);
  }

  return [...agentNames];
}

function initCommand(force) {
  const homeDir = os.homedir();
  const targetDir = path.join(homeDir, '.openclaw-includes');
  const openclawConfigPath = path.join(homeDir, '.openclaw', 'openclaw.json');
  const templatesRoot = path.resolve(__dirname, '..', 'templates');
  const baseTemplatesDir = path.join(templatesRoot, '.base');

  if (!fs.existsSync(templatesRoot)) {
    console.error(`Templates directory not found: ${templatesRoot}`);
    process.exit(1);
  }

  if (!fs.existsSync(baseTemplatesDir)) {
    console.error(`Base templates directory not found: ${baseTemplatesDir}`);
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

  const agentNames = getAgentNames(openclawConfigPath);
  const includeTemplateFiles = fs
    .readdirSync(templatesRoot, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.md'))
    .map((entry) => entry.name);

  if (includeTemplateFiles.length === 0) {
    console.error(`No include template files found in ${templatesRoot}`);
    process.exit(1);
  }

  fs.mkdirSync(targetDir, { recursive: true });
  fs.cpSync(baseTemplatesDir, path.join(targetDir, '.base'), { recursive: true });

  for (const agentName of agentNames) {
    const agentTargetDir = path.join(targetDir, agentName);
    fs.mkdirSync(agentTargetDir, { recursive: true });

    for (const fileName of includeTemplateFiles) {
      fs.copyFileSync(path.join(templatesRoot, fileName), path.join(agentTargetDir, fileName));
    }
  }

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
