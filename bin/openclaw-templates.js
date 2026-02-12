#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { Command } = require('commander');
const markdownIncludeModulePath = require.resolve('markdown-include');

const OPENCLAW_DIR_ENV = 'OCLAWTPL_OPENCLAW';
const TEMPLATES_DIR_ENV = 'OCLAWTPL_TEMPLATES';

function printUsage() {
  console.log('Usage:');
  console.log('  openclaw-templates [--openclaw-dir <path>] [--templates <path>] init [--force]');
  console.log('  openclaw-templates [--openclaw-dir <path>] [--templates <path>] pull-agents');
  console.log('  openclaw-templates [--openclaw-dir <path>] [--templates <path>] doctor');
  console.log(
    '  openclaw-templates [--openclaw-dir <path>] [--templates <path>] build [workspace] [--overwrite] [--wipe] [--force]',
  );
}

function normalizeOptionalPath(pathOption, homeDir) {
  if (typeof pathOption !== 'string' || pathOption.trim() === '') {
    return undefined;
  }

  const trimmed = pathOption.trim();
  if (trimmed === '~') {
    return homeDir;
  }
  if (/^~[\\/]/.test(trimmed)) {
    return path.resolve(path.join(homeDir, trimmed.slice(2)));
  }

  return path.resolve(trimmed);
}

function resolvePathOption(pathOption, envVarName, defaultPath, homeDir) {
  const explicitPath = normalizeOptionalPath(pathOption, homeDir);
  if (explicitPath) {
    return explicitPath;
  }

  const envPath = normalizeOptionalPath(process.env[envVarName], homeDir);
  if (envPath) {
    return envPath;
  }

  return defaultPath;
}

function resolveOpenclawDir(openclawDirOption, homeDir) {
  return resolvePathOption(openclawDirOption, OPENCLAW_DIR_ENV, path.join(homeDir, '.openclaw'), homeDir);
}

function resolveTemplateDir(templateDirOption, homeDir) {
  return resolvePathOption(templateDirOption, TEMPLATES_DIR_ENV, path.join(homeDir, '.openclaw-templates'), homeDir);
}

function getInitPaths(openclawDirOption, templateDirOption) {
  const homeDir = os.homedir();
  const openclawDir = resolveOpenclawDir(openclawDirOption, homeDir);
  const targetDir = resolveTemplateDir(templateDirOption, homeDir);
  const templatesRoot = path.resolve(__dirname, '..', 'templates');
  return {
    homeDir,
    openclawDir,
    targetDir,
    openclawConfigPath: path.join(openclawDir, 'openclaw.json'),
    templatesRoot,
    baseTemplatesDir: path.join(templatesRoot, '.base'),
    includesTemplatesDir: path.join(templatesRoot, '.includes'),
  };
}

function normalizeWorkspace(workspace) {
  return workspace.replace(/[\\/]+$/, '');
}

function toAbsoluteWorkspace(workspace, openclawDir) {
  if (path.isAbsolute(workspace)) {
    return workspace;
  }

  return path.resolve(path.join(openclawDir, workspace));
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

  return parsed;
}

function getAgentId(agent) {
  return typeof agent.id === 'string' && agent.id.trim() !== '' ? agent.id.trim() : undefined;
}

function getAgentEntries(openclawConfigPath, openclawDir) {
  const parsed = parseOpenclawConfig(openclawConfigPath);
  const list = parsed.agents.list;
  const defaultsWorkspace =
    parsed &&
    parsed.agents &&
    parsed.agents.defaults &&
    typeof parsed.agents.defaults.workspace === 'string'
      ? parsed.agents.defaults.workspace
      : path.join(openclawDir, 'workspace');
  const entries = [];
  const seenWorkspaces = new Set();
  const seenIds = new Set();
  const workspaceToAgentId = new Map();

  for (const agent of list) {
    if (!agent || typeof agent !== 'object') {
      continue;
    }

    const agentId = getAgentId(agent);
    if (!agentId) {
      continue;
    }

    const rawWorkspace =
      typeof agent.workspace === 'string' && agent.workspace.trim() !== ''
        ? agent.workspace
        : agentId === 'main'
          ? defaultsWorkspace
          : undefined;
    if (typeof rawWorkspace !== 'string' || rawWorkspace.trim() === '') {
      continue;
    }

    const normalizedWorkspace = normalizeWorkspace(rawWorkspace);
    const absoluteWorkspace = toAbsoluteWorkspace(normalizedWorkspace, openclawDir);
    if (seenIds.has(agentId)) {
      console.error(`Duplicate agent id in ${openclawConfigPath}: ${agentId}`);
      process.exit(1);
    }
    if (workspaceToAgentId.has(absoluteWorkspace)) {
      console.error(
        `Duplicate workspace in ${openclawConfigPath}: ${absoluteWorkspace} (agents: ${workspaceToAgentId.get(absoluteWorkspace)}, ${agentId})`,
      );
      process.exit(1);
    }

    seenWorkspaces.add(absoluteWorkspace);
    seenIds.add(agentId);
    workspaceToAgentId.set(absoluteWorkspace, agentId);
    entries.push({
      name: agentId,
      id: agentId,
      workspace: absoluteWorkspace,
    });
  }

  const absoluteDefaultsWorkspace = toAbsoluteWorkspace(normalizeWorkspace(defaultsWorkspace), openclawDir);
  if (!seenWorkspaces.has(absoluteDefaultsWorkspace) && !seenIds.has('main')) {
    seenWorkspaces.add(absoluteDefaultsWorkspace);
    seenIds.add('main');
    entries.push({
      name: 'main',
      id: 'main',
      workspace: absoluteDefaultsWorkspace,
    });
  }

  if (entries.length === 0) {
    console.error(`No valid agent workspaces found in ${openclawConfigPath}`);
    process.exit(1);
  }

  return entries;
}

function getAgentNames(openclawConfigPath, openclawDir) {
  return getAgentEntries(openclawConfigPath, openclawDir).map((entry) => entry.name);
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

function initCommand(force, openclawDirOption, templateDirOption) {
  const { openclawDir, targetDir, baseTemplatesDir, includesTemplatesDir, openclawConfigPath } =
    getInitPaths(openclawDirOption, templateDirOption);
  const agentNames = getAgentNames(openclawConfigPath, openclawDir);
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

function updateCommand(openclawDirOption, templateDirOption) {
  const { openclawDir, targetDir, baseTemplatesDir, includesTemplatesDir, openclawConfigPath } =
    getInitPaths(openclawDirOption, templateDirOption);
  const agentNames = getAgentNames(openclawConfigPath, openclawDir);
  const entrypointTemplateFiles = getEntrypointTemplateFiles(baseTemplatesDir);
  assertIncludesTemplatesDir(includesTemplatesDir);

  if (!fs.existsSync(targetDir) || !fs.statSync(targetDir).isDirectory()) {
    console.error(`Templates directory not found: ${targetDir}`);
    console.error('Run `openclaw-templates init` first.');
    process.exit(1);
  }

  const targetIncludesDir = path.join(targetDir, '.includes');
  if (!fs.existsSync(targetIncludesDir)) {
    fs.cpSync(includesTemplatesDir, targetIncludesDir, { recursive: true });
  }

  let addedAgents = 0;
  for (const agentName of agentNames) {
    const agentTargetDir = path.join(targetDir, agentName);

    if (fs.existsSync(agentTargetDir)) {
      if (!fs.statSync(agentTargetDir).isDirectory()) {
        console.error(`Agent template path exists but is not a directory: ${agentTargetDir}`);
        process.exit(1);
      }
      continue;
    }

    fs.mkdirSync(agentTargetDir, { recursive: true });
    for (const fileName of entrypointTemplateFiles) {
      fs.copyFileSync(path.join(baseTemplatesDir, fileName), path.join(agentTargetDir, fileName));
    }
    addedAgents += 1;
  }

  console.log(`Updated ${targetDir}; added ${addedAgents} agent template director${addedAgents === 1 ? 'y' : 'ies'}.`);
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
    const entries = fs
      .readdirSync(currentDir, { withFileTypes: true })
      .sort((a, b) => a.name.localeCompare(b.name));
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

function clearDirectoryContents(dirPath) {
  if (!fs.existsSync(dirPath)) {
    return;
  }

  if (!fs.statSync(dirPath).isDirectory()) {
    console.error(`Workspace path is not a directory: ${dirPath}`);
    process.exit(1);
  }

  const entries = fs.readdirSync(dirPath);
  for (const entry of entries) {
    if (entry === '.git') {
      continue;
    }
    fs.rmSync(path.join(dirPath, entry), { recursive: true, force: true });
  }
}

function pathTouchesGitMetadata(relativePath) {
  const normalized = relativePath.replace(/\\/g, '/');
  const segments = normalized.split('/').filter(Boolean);
  return segments.includes('.git');
}

function isChildPath(parentDir, childDir) {
  const resolvedParent = path.resolve(parentDir);
  const resolvedChild = path.resolve(childDir);
  const relativePath = path.relative(resolvedParent, resolvedChild);
  return relativePath !== '' && !relativePath.startsWith('..') && !path.isAbsolute(relativePath);
}

function selectBuildTargets(
  agentEntries,
  workspaceArg,
  openclawDir,
  allowExternalWorkspacePath,
  openclawConfigPath,
) {
  if (!workspaceArg) {
    return agentEntries;
  }

  const normalizedArg = normalizeWorkspace(workspaceArg);
  const isWorkspacePathSelector =
    path.isAbsolute(workspaceArg) ||
    workspaceArg.includes('/') ||
    workspaceArg.includes('\\\\') ||
    workspaceArg.startsWith('.');
  const exactWorkspaceMatches = agentEntries.filter((entry) => normalizeWorkspace(entry.workspace) === normalizedArg);
  if (exactWorkspaceMatches.length > 0) {
    if (isWorkspacePathSelector && !allowExternalWorkspacePath) {
      const openclawRoot = openclawDir;
      for (const entry of exactWorkspaceMatches) {
        if (!isChildPath(openclawRoot, entry.workspace)) {
          console.error(`Refusing to target workspace outside ${openclawRoot}: ${entry.workspace}`);
          console.error(`Use --force to allow building to workspace paths outside ${openclawRoot}.`);
          process.exit(1);
        }
      }
    }
    return exactWorkspaceMatches;
  }

  const nameMatches = agentEntries.filter((entry) => entry.id === normalizedArg);
  if (nameMatches.length === 1) {
    return nameMatches;
  }

  if (nameMatches.length > 1) {
    console.error(`Agent id is ambiguous: ${workspaceArg}.`);
    console.error(`Use an exact workspace path from ${openclawConfigPath}.`);
    process.exit(1);
  }

  console.error(`Agent id or workspace path not found in ${openclawConfigPath}: ${workspaceArg}`);
  process.exit(1);
}

function buildCommand(
  allowNonIncludeOverwrite,
  wipeWorkspaces,
  workspaceArg,
  allowExternalWorkspacePath,
  openclawDirOption,
  templateDirOption,
) {
  const { openclawDir, targetDir, openclawConfigPath } = getInitPaths(openclawDirOption, templateDirOption);
  const agentEntries = selectBuildTargets(
    getAgentEntries(openclawConfigPath, openclawDir),
    workspaceArg,
    openclawDir,
    allowExternalWorkspacePath,
    openclawConfigPath,
  );
  const includesDir = path.join(targetDir, '.includes');

  if (!fs.existsSync(targetDir)) {
    console.error(`Includes directory not found: ${targetDir}`);
    console.error('Run `openclaw-templates init` first.');
    process.exit(1);
  }

  if (!fs.existsSync(includesDir) || !fs.statSync(includesDir).isDirectory()) {
    console.error(`Shared includes directory not found: ${includesDir}`);
    console.error('Run `openclaw-templates init --force` to regenerate templates.');
    process.exit(1);
  }

  let totalFiles = 0;
  let skippedFiles = 0;

  for (const entry of agentEntries) {
    const agentTemplatesDir = path.join(targetDir, entry.name);
    if (!fs.existsSync(agentTemplatesDir) || !fs.statSync(agentTemplatesDir).isDirectory()) {
      console.error(`Template directory not found for agent ${entry.name}: ${agentTemplatesDir}`);
      console.error('Run `openclaw-templates init --force` to regenerate templates.');
      process.exit(1);
    }

    const templateFiles = listFilesRecursive(agentTemplatesDir);
    if (templateFiles.length === 0) {
      console.error(`No template files found in ${agentTemplatesDir}`);
      process.exit(1);
    }

    fs.mkdirSync(entry.workspace, { recursive: true });
    if (wipeWorkspaces) {
      clearDirectoryContents(entry.workspace);
    }

    for (const file of templateFiles) {
      if (pathTouchesGitMetadata(file.relativePath)) {
        skippedFiles += 1;
        continue;
      }

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

function doctorCommand(openclawDirOption, templateDirOption) {
  const { openclawDir, openclawConfigPath, baseTemplatesDir, includesTemplatesDir } = getInitPaths(
    openclawDirOption,
    templateDirOption,
  );
  const parsed = parseOpenclawConfig(openclawConfigPath);
  const list = parsed.agents.list;
  const agentNames = getAgentNames(openclawConfigPath, openclawDir);
  const entrypointTemplateFiles = getEntrypointTemplateFiles(baseTemplatesDir);
  assertIncludesTemplatesDir(includesTemplatesDir);

  const invalidWorkspaceCount = list.filter((agent) => {
    if (!agent || typeof agent !== 'object') {
      return true;
    }
    const hasExplicitWorkspace = typeof agent.workspace === 'string' && agent.workspace.trim() !== '';
    if (hasExplicitWorkspace) {
      return false;
    }
    return getAgentId(agent) !== 'main';
  }).length;

  console.log('Doctor checks passed');
  console.log(`Config: ${openclawConfigPath}`);
  console.log(`Agents found: ${agentNames.length}`);
  console.log(`Entrypoint templates (.base): ${entrypointTemplateFiles.length}`);
  if (invalidWorkspaceCount > 0) {
    console.log(`Skipped invalid workspace entries: ${invalidWorkspaceCount}`);
  }
}

function buildProgram() {
  const program = new Command();
  program.name('openclaw-templates');
  program.showHelpAfterError();
  program.option(
    '--openclaw-dir <path>',
    `Path to OpenClaw directory (default: ~/.openclaw, env: ${OPENCLAW_DIR_ENV})`,
  );
  program.option(
    '--templates <path>',
    `Path to templates directory (default: ~/.openclaw-templates, env: ${TEMPLATES_DIR_ENV})`,
  );

  program
    .command('init')
    .option('--force', 'Overwrite existing template directory')
    .action(function action(options) {
      const { openclawDir, templates } = this.optsWithGlobals();
      initCommand(Boolean(options.force), openclawDir, templates);
    });

  program.command('pull-agents').action(function action() {
    const { openclawDir, templates } = this.optsWithGlobals();
    updateCommand(openclawDir, templates);
  });

  program.command('doctor').action(function action() {
    const { openclawDir, templates } = this.optsWithGlobals();
    doctorCommand(openclawDir, templates);
  });

  program
    .command('build')
    .argument('[workspace]')
    .option('--overwrite', 'Overwrite non-include target files if they already exist')
    .option('--wipe', 'Delete workspace contents before building')
    .option('--force', 'Allow explicit workspace paths outside ~/.openclaw')
    .action(function action(workspace, options) {
      const { openclawDir, templates } = this.optsWithGlobals();
      buildCommand(
        Boolean(options.overwrite),
        Boolean(options.wipe),
        workspace,
        Boolean(options.force),
        openclawDir,
        templates,
      );
    });

  return program;
}

function main() {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    printUsage();
    process.exit(1);
  }

  if (args.length === 1 && (args[0] === '--help' || args[0] === '-h')) {
    printUsage();
    process.exit(0);
  }

  const program = buildProgram();
  program.parse(process.argv);
}

main();
