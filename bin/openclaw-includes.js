#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const markdownIncludeModulePath = require.resolve('markdown-include');

function printUsage() {
  console.log('Usage:');
  console.log('  openclaw-includes init [--force]');
  console.log('  openclaw-includes doctor');
  console.log('  openclaw-includes build [--overwrite]');
}

function getInitPaths() {
  const homeDir = os.homedir();
  const templatesRoot = path.resolve(__dirname, '..', 'templates');
  return {
    homeDir,
    targetDir: path.join(homeDir, '.openclaw-includes'),
    openclawConfigPath: path.join(homeDir, '.openclaw', 'openclaw.json'),
    templatesRoot,
    baseTemplatesDir: path.join(templatesRoot, '.base'),
    includesTemplatesDir: path.join(templatesRoot, '.includes'),
  };
}

function normalizeWorkspace(workspace) {
  return workspace.replace(/[\\/]+$/, '');
}

function toAbsoluteWorkspace(workspace, homeDir) {
  if (path.isAbsolute(workspace)) {
    return workspace;
  }

  return path.resolve(path.join(homeDir, '.openclaw'), workspace);
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

function getAgentEntries(openclawConfigPath, homeDir) {
  const list = parseOpenclawConfig(openclawConfigPath);
  const allWorkspaces = list
    .map((agent) => (agent ? agent.workspace : undefined))
    .concat(path.join(homeDir, '.openclaw', 'workspace'));
  const entries = [];
  const seenWorkspaces = new Set();

  for (const workspace of allWorkspaces) {
    if (typeof workspace !== 'string' || workspace.trim() === '') {
      continue;
    }

    const normalizedWorkspace = normalizeWorkspace(workspace);
    const dirName = path.basename(normalizedWorkspace);
    const absoluteWorkspace = toAbsoluteWorkspace(normalizedWorkspace, homeDir);
    if (dirName && dirName !== '.' && dirName !== path.sep) {
      if (!seenWorkspaces.has(absoluteWorkspace)) {
        seenWorkspaces.add(absoluteWorkspace);
        entries.push({
          name: dirName,
          workspace: absoluteWorkspace,
        });
      }
    }
  }

  if (entries.length === 0) {
    console.error(`No valid agent workspaces found in ${openclawConfigPath}`);
    process.exit(1);
  }

  return entries;
}

function getAgentNames(openclawConfigPath, homeDir) {
  const entries = getAgentEntries(openclawConfigPath, homeDir);
  return [...new Set(entries.map((entry) => entry.name))];
}

function getEntrypointTemplateFiles(baseTemplatesDir) {
  if (!fs.existsSync(baseTemplatesDir)) {
    console.error(`Base templates directory not found: ${baseTemplatesDir}`);
    process.exit(1);
  }

  const entrypointTemplateFiles = fs
    .readdirSync(baseTemplatesDir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.md'))
    .map((entry) => entry.name);

  if (entrypointTemplateFiles.length === 0) {
    console.error(`No entrypoint template files found in ${baseTemplatesDir}`);
    process.exit(1);
  }

  return entrypointTemplateFiles;
}

function assertIncludesTemplatesDir(includesTemplatesDir) {
  if (!fs.existsSync(includesTemplatesDir)) {
    console.error(`Includes templates directory not found: ${includesTemplatesDir}`);
    process.exit(1);
  }
}

function initCommand(force) {
  const { homeDir, targetDir, baseTemplatesDir, includesTemplatesDir, openclawConfigPath } = getInitPaths();
  const agentNames = getAgentNames(openclawConfigPath, homeDir);
  const entrypointTemplateFiles = getEntrypointTemplateFiles(baseTemplatesDir);
  assertIncludesTemplatesDir(includesTemplatesDir);

  if (fs.existsSync(targetDir)) {
    if (!force) {
      console.error(`Directory already exists: ${targetDir}`);
      console.error('Use --force to overwrite it.');
      process.exit(1);
    }

    fs.rmSync(targetDir, { recursive: true, force: true });
  }

  fs.mkdirSync(targetDir, { recursive: true });
  fs.cpSync(includesTemplatesDir, path.join(targetDir, '.includes'), { recursive: true });

  for (const agentName of agentNames) {
    const agentTargetDir = path.join(targetDir, agentName);
    fs.mkdirSync(agentTargetDir, { recursive: true });

    for (const fileName of entrypointTemplateFiles) {
      fs.copyFileSync(path.join(baseTemplatesDir, fileName), path.join(agentTargetDir, fileName));
    }
  }

  console.log(`Initialized ${targetDir}`);
}

function compileMarkdownFile(sourceFilePath) {
  const sourceDir = path.dirname(sourceFilePath);
  const sourceFileName = path.basename(sourceFilePath);
  const previousCwd = process.cwd();

  try {
    process.chdir(sourceDir);
    delete require.cache[markdownIncludeModulePath];
    const markdownInclude = require('markdown-include');
    markdownInclude.processFile(sourceFileName);
    const compiled = markdownInclude.build[sourceFileName] && markdownInclude.build[sourceFileName].parsedData;

    if (typeof compiled !== 'string') {
      throw new Error('missing compiled output');
    }

    return compiled;
  } finally {
    process.chdir(previousCwd);
  }
}

function hasActiveIncludeTags(sourceFilePath) {
  const rawData = fs.readFileSync(sourceFilePath, 'utf8');
  const markdownInclude = require('markdown-include');
  return markdownInclude.findIncludeTags(rawData).length > 0;
}

function listFilesRecursive(rootDir) {
  const files = [];

  function walk(currentDir, relativeDir) {
    const entries = fs.readdirSync(currentDir, { withFileTypes: true });
    for (const entry of entries) {
      const absolutePath = path.join(currentDir, entry.name);
      const relativePath = relativeDir ? path.join(relativeDir, entry.name) : entry.name;

      if (entry.isDirectory()) {
        walk(absolutePath, relativePath);
      } else if (entry.isFile()) {
        files.push({
          absolutePath,
          relativePath,
        });
      }
    }
  }

  walk(rootDir, '');
  return files;
}

function buildCommand(allowNonIncludeOverwrite) {
  const { homeDir, targetDir, openclawConfigPath } = getInitPaths();
  const agentEntries = getAgentEntries(openclawConfigPath, homeDir);
  const includesDir = path.join(targetDir, '.includes');

  if (!fs.existsSync(targetDir)) {
    console.error(`Includes directory not found: ${targetDir}`);
    console.error('Run `openclaw-includes init` first.');
    process.exit(1);
  }

  if (!fs.existsSync(includesDir) || !fs.statSync(includesDir).isDirectory()) {
    console.error(`Shared includes directory not found: ${includesDir}`);
    console.error('Run `openclaw-includes init --force` to regenerate templates.');
    process.exit(1);
  }

  let totalFiles = 0;
  let skippedFiles = 0;

  for (const entry of agentEntries) {
    const agentTemplatesDir = path.join(targetDir, entry.name);
    if (!fs.existsSync(agentTemplatesDir) || !fs.statSync(agentTemplatesDir).isDirectory()) {
      console.error(`Template directory not found for agent ${entry.name}: ${agentTemplatesDir}`);
      console.error('Run `openclaw-includes init --force` to regenerate templates.');
      process.exit(1);
    }

    const templateFiles = listFilesRecursive(agentTemplatesDir);
    if (templateFiles.length === 0) {
      console.error(`No template files found in ${agentTemplatesDir}`);
      process.exit(1);
    }

    fs.mkdirSync(entry.workspace, { recursive: true });

    for (const file of templateFiles) {
      const destinationPath = path.join(entry.workspace, file.relativePath);
      fs.mkdirSync(path.dirname(destinationPath), { recursive: true });

      if (file.relativePath.endsWith('.md')) {
        const hasIncludes = hasActiveIncludeTags(file.absolutePath);
        if (hasIncludes) {
          let compiled;
          try {
            compiled = compileMarkdownFile(file.absolutePath);
          } catch (error) {
            console.error(`Failed to compile ${file.absolutePath}: ${error.message}`);
            process.exit(1);
          }
          fs.writeFileSync(destinationPath, compiled, 'utf8');
          totalFiles += 1;
        } else if (!fs.existsSync(destinationPath) || allowNonIncludeOverwrite) {
          fs.copyFileSync(file.absolutePath, destinationPath);
          totalFiles += 1;
        } else {
          skippedFiles += 1;
        }
      } else {
        if (!fs.existsSync(destinationPath) || allowNonIncludeOverwrite) {
          fs.copyFileSync(file.absolutePath, destinationPath);
          totalFiles += 1;
        } else {
          skippedFiles += 1;
        }
      }
    }
  }

  console.log(`Built ${totalFiles} files across ${agentEntries.length} workspace(s); skipped ${skippedFiles}.`);
}

function doctorCommand() {
  const { homeDir, openclawConfigPath, baseTemplatesDir, includesTemplatesDir } = getInitPaths();
  const list = parseOpenclawConfig(openclawConfigPath);
  const agentNames = getAgentNames(openclawConfigPath, homeDir);
  const entrypointTemplateFiles = getEntrypointTemplateFiles(baseTemplatesDir);
  assertIncludesTemplatesDir(includesTemplatesDir);

  const invalidWorkspaceCount = list.filter(
    (agent) => !agent || typeof agent.workspace !== 'string' || agent.workspace.trim() === '',
  ).length;

  console.log('Doctor checks passed');
  console.log(`Config: ${openclawConfigPath}`);
  console.log(`Agents found: ${agentNames.length}`);
  console.log(`Entrypoint templates (.base): ${entrypointTemplateFiles.length}`);
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

  if (command !== 'init' && command !== 'doctor' && command !== 'build') {
    console.error(`Unknown command: ${command}`);
    printUsage();
    process.exit(1);
  }

  const flags = args.slice(1);
  let validFlags = new Set();
  if (command === 'init') {
    validFlags = new Set(['--force']);
  }
  if (command === 'build') {
    validFlags = new Set(['--overwrite']);
  }

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

  if (command === 'build') {
    buildCommand(flags.includes('--overwrite'));
    return;
  }

  initCommand(flags.includes('--force'));
}

main();
