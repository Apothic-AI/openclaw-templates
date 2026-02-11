#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

function printUsage() {
  console.log('Usage:');
  console.log('  openclaw-includes init [--force]');
  console.log('  openclaw-includes doctor');
}

function getInitPaths() {
  const homeDir = os.homedir();
  return {
    homeDir,
    targetDir: path.join(homeDir, '.openclaw-includes'),
    openclawConfigPath: path.join(homeDir, '.openclaw', 'openclaw.json'),
    templatesRoot: path.resolve(__dirname, '..', 'templates'),
    baseTemplatesDir: path.join(path.resolve(__dirname, '..', 'templates'), '.base'),
  };
}

function parseOpenclawConfig(openclawConfigPath) {
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

  return list;
}

function getAgentNames(openclawConfigPath) {
  const list = parseOpenclawConfig(openclawConfigPath);
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

function getIncludeTemplateFiles(templatesRoot) {
  if (!fs.existsSync(templatesRoot)) {
    console.error(`Templates directory not found: ${templatesRoot}`);
    process.exit(1);
  }

  const includeTemplateFiles = fs
    .readdirSync(templatesRoot, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.md'))
    .map((entry) => entry.name);

  if (includeTemplateFiles.length === 0) {
    console.error(`No include template files found in ${templatesRoot}`);
    process.exit(1);
  }

  return includeTemplateFiles;
}

function assertBaseTemplatesDir(baseTemplatesDir) {
  if (!fs.existsSync(baseTemplatesDir)) {
    console.error(`Base templates directory not found: ${baseTemplatesDir}`);
    process.exit(1);
  }
}

function initCommand(force) {
  const { targetDir, openclawConfigPath, templatesRoot, baseTemplatesDir } = getInitPaths();
  const agentNames = getAgentNames(openclawConfigPath);
  const includeTemplateFiles = getIncludeTemplateFiles(templatesRoot);
  assertBaseTemplatesDir(baseTemplatesDir);

  if (fs.existsSync(targetDir)) {
    if (!force) {
      console.error(`Directory already exists: ${targetDir}`);
      console.error('Use --force to overwrite it.');
      process.exit(1);
    }

    fs.rmSync(targetDir, { recursive: true, force: true });
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

function doctorCommand() {
  const { openclawConfigPath, templatesRoot, baseTemplatesDir } = getInitPaths();
  const list = parseOpenclawConfig(openclawConfigPath);
  const agentNames = getAgentNames(openclawConfigPath);
  const includeTemplateFiles = getIncludeTemplateFiles(templatesRoot);
  assertBaseTemplatesDir(baseTemplatesDir);

  const invalidWorkspaceCount = list.filter(
    (agent) => !agent || typeof agent.workspace !== 'string' || agent.workspace.trim() === '',
  ).length;

  console.log('Doctor checks passed');
  console.log(`Config: ${openclawConfigPath}`);
  console.log(`Agents found: ${agentNames.length}`);
  console.log(`Include templates: ${includeTemplateFiles.length}`);
  if (invalidWorkspaceCount > 0) {
    console.log(`Skipped invalid workspace entries: ${invalidWorkspaceCount}`);
  }
}

function main() {
  const args = process.argv.slice(2);
  const command = args[0];

  if (!command || command === '--help' || command === '-h') {
    printUsage();
    process.exit(command ? 0 : 1);
  }

  if (command !== 'init' && command !== 'doctor') {
    console.error(`Unknown command: ${command}`);
    printUsage();
    process.exit(1);
  }

  const flags = args.slice(1);
  const validFlags = command === 'init' ? new Set(['--force']) : new Set();

  for (const flag of flags) {
    if (!validFlags.has(flag)) {
      console.error(`Unknown option: ${flag}`);
      printUsage();
      process.exit(1);
    }
  }

  if (command === 'doctor') {
    doctorCommand();
    return;
  }

  initCommand(flags.includes('--force'));
}

main();
