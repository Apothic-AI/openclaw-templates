const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const repoRoot = path.resolve(__dirname, '..');
const cliPath = path.join(repoRoot, 'bin', 'openclaw-templates.js');

function makeTempHome(t) {
  const tempHome = fs.mkdtempSync(path.join(os.tmpdir(), 'openclaw-templates-test-'));
  t.after(() => {
    fs.rmSync(tempHome, { recursive: true, force: true });
  });
  return tempHome;
}

function writeOpenclawConfig(homeDir, config, openclawDir = path.join(homeDir, '.openclaw')) {
  fs.mkdirSync(openclawDir, { recursive: true });
  fs.writeFileSync(path.join(openclawDir, 'openclaw.json'), `${JSON.stringify(config, null, 2)}\n`, 'utf8');
}

function createDefaultConfig(homeDir) {
  return {
    agents: {
      defaults: {
        workspace: path.join(homeDir, '.openclaw', 'workspace'),
      },
      list: [
        { id: 'main' },
        {
          id: 'alpha-id',
          name: 'alpha-name',
          workspace: path.join(homeDir, '.openclaw', 'workspace-alpha'),
        },
        {
          id: 'beta-id',
          name: 'beta-name',
          workspace: path.join(homeDir, '.openclaw', 'workspace-beta'),
        },
      ],
    },
  };
}

function runCli(homeDir, args, expectedCode = 0) {
  const result = spawnSync(process.execPath, [cliPath, ...args], {
    cwd: repoRoot,
    env: {
      ...process.env,
      HOME: homeDir,
      USERPROFILE: homeDir,
    },
    encoding: 'utf8',
  });

  assert.equal(
    result.status,
    expectedCode,
    [
      `Expected exit code ${expectedCode}, got ${result.status}`,
      `Command: node ${path.relative(repoRoot, cliPath)} ${args.join(' ')}`,
      `stdout:\n${result.stdout}`,
      `stderr:\n${result.stderr}`,
    ].join('\n\n'),
  );

  return result;
}

test('help output includes all commands and build flags', () => {
  const result = spawnSync(process.execPath, [cliPath, '--help'], {
    cwd: repoRoot,
    encoding: 'utf8',
  });

  assert.equal(result.status, 0);
  assert.match(result.stdout, /openclaw-templates \[--openclaw-dir <path>\] \[--templates <path>\] init \[--force\]/);
  assert.match(result.stdout, /openclaw-templates \[--openclaw-dir <path>\] \[--templates <path>\] pull-agents/);
  assert.match(result.stdout, /openclaw-templates \[--openclaw-dir <path>\] \[--templates <path>\] doctor/);
  assert.match(
    result.stdout,
    /openclaw-templates \[--openclaw-dir <path>\] \[--templates <path>\] build \[workspace\] \[--overwrite\] \[--wipe\] \[--force\]/,
  );
});

test('doctor fails when config file is missing', (t) => {
  const homeDir = makeTempHome(t);
  const result = runCli(homeDir, ['doctor'], 1);
  assert.match(result.stderr, /Config file not found/);
});

test('init creates .openclaw-templates with .includes and one directory per agent id', (t) => {
  const homeDir = makeTempHome(t);
  writeOpenclawConfig(homeDir, createDefaultConfig(homeDir));

  runCli(homeDir, ['init']);

  const includesDir = path.join(homeDir, '.openclaw-templates', '.includes');
  assert.ok(fs.existsSync(includesDir));
  assert.ok(fs.existsSync(path.join(includesDir, 'AGENTS', 'HEADER.md')));

  assert.ok(fs.existsSync(path.join(homeDir, '.openclaw-templates', 'main', 'AGENTS.md')));
  assert.ok(fs.existsSync(path.join(homeDir, '.openclaw-templates', 'alpha-id', 'AGENTS.md')));
  assert.ok(fs.existsSync(path.join(homeDir, '.openclaw-templates', 'beta-id', 'AGENTS.md')));
});

test('init requires --force to recreate an existing target directory', (t) => {
  const homeDir = makeTempHome(t);
  writeOpenclawConfig(homeDir, createDefaultConfig(homeDir));

  runCli(homeDir, ['init']);

  const marker = path.join(homeDir, '.openclaw-templates', 'alpha-id', 'marker.txt');
  fs.writeFileSync(marker, 'remove me', 'utf8');

  const secondInit = runCli(homeDir, ['init'], 1);
  assert.match(secondInit.stderr, /Directory already exists/);

  runCli(homeDir, ['init', '--force']);
  assert.equal(fs.existsSync(marker), false);
});

test('doctor passes with valid config and templates', (t) => {
  const homeDir = makeTempHome(t);
  writeOpenclawConfig(homeDir, createDefaultConfig(homeDir));

  const result = runCli(homeDir, ['doctor']);
  assert.match(result.stdout, /Doctor checks passed/);
  assert.match(result.stdout, /Entrypoint templates \(.base\):/);
});

test('pull-agents fails if init has not been run', (t) => {
  const homeDir = makeTempHome(t);
  writeOpenclawConfig(homeDir, createDefaultConfig(homeDir));

  const result = runCli(homeDir, ['pull-agents'], 1);
  assert.match(result.stderr, /Run `openclaw-templates init` first/);
});

test('pull-agents adds template directories for new agents without overwriting existing agents', (t) => {
  const homeDir = makeTempHome(t);
  const config = createDefaultConfig(homeDir);
  writeOpenclawConfig(homeDir, config);

  runCli(homeDir, ['init']);

  const alphaAgentsTemplate = path.join(homeDir, '.openclaw-templates', 'alpha-id', 'AGENTS.md');
  fs.writeFileSync(alphaAgentsTemplate, 'custom alpha template\n', 'utf8');

  config.agents.list.push({
    id: 'gamma-id',
    workspace: path.join(homeDir, '.openclaw', 'workspace-gamma'),
  });
  writeOpenclawConfig(homeDir, config);

  const updateResult = runCli(homeDir, ['pull-agents']);
  assert.match(updateResult.stdout, /added 1 agent template directory/);

  assert.ok(fs.existsSync(path.join(homeDir, '.openclaw-templates', 'gamma-id', 'AGENTS.md')));
  assert.equal(fs.readFileSync(alphaAgentsTemplate, 'utf8'), 'custom alpha template\n');
});

test('doctor fails on duplicate agent ids in config', (t) => {
  const homeDir = makeTempHome(t);
  writeOpenclawConfig(homeDir, {
    agents: {
      defaults: {
        workspace: path.join(homeDir, '.openclaw', 'workspace'),
      },
      list: [
        { id: 'dup-id', workspace: path.join(homeDir, '.openclaw', 'workspace-a') },
        { id: 'dup-id', workspace: path.join(homeDir, '.openclaw', 'workspace-b') },
      ],
    },
  });

  const result = runCli(homeDir, ['doctor'], 1);
  assert.match(result.stderr, /Duplicate agent id/);
});

test('doctor fails on duplicate workspaces in config', (t) => {
  const homeDir = makeTempHome(t);
  const duplicateWorkspace = path.join(homeDir, '.openclaw', 'shared-workspace');

  writeOpenclawConfig(homeDir, {
    agents: {
      defaults: {
        workspace: path.join(homeDir, '.openclaw', 'workspace'),
      },
      list: [
        { id: 'first-id', workspace: duplicateWorkspace },
        { id: 'second-id', workspace: duplicateWorkspace },
      ],
    },
  });

  const result = runCli(homeDir, ['doctor'], 1);
  assert.match(result.stderr, /Duplicate workspace/);
});

test('build fails if init has not been run', (t) => {
  const homeDir = makeTempHome(t);
  writeOpenclawConfig(homeDir, createDefaultConfig(homeDir));

  const result = runCli(homeDir, ['build'], 1);
  assert.match(result.stderr, /Run `openclaw-templates init` first/);
});

test('build recursively copies files and compiles markdown with includes', (t) => {
  const homeDir = makeTempHome(t);
  writeOpenclawConfig(homeDir, createDefaultConfig(homeDir));
  runCli(homeDir, ['init']);

  const alphaTemplatesDir = path.join(homeDir, '.openclaw-templates', 'alpha-id');
  fs.mkdirSync(path.join(alphaTemplatesDir, 'nested', 'assets'), { recursive: true });
  fs.writeFileSync(path.join(alphaTemplatesDir, 'nested', 'assets', 'info.txt'), 'asset text', 'utf8');
  fs.writeFileSync(path.join(alphaTemplatesDir, 'PLAIN.md'), '# Plain\nNo includes here.\n', 'utf8');

  runCli(homeDir, ['build', 'alpha-id']);

  const alphaWorkspace = path.join(homeDir, '.openclaw', 'workspace-alpha');
  assert.ok(fs.existsSync(path.join(alphaWorkspace, 'nested', 'assets', 'info.txt')));
  assert.ok(fs.existsSync(path.join(alphaWorkspace, 'PLAIN.md')));

  const builtAgents = fs.readFileSync(path.join(alphaWorkspace, 'AGENTS.md'), 'utf8');
  assert.doesNotMatch(builtAgents, /^#include\s/m);

  const betaWorkspace = path.join(homeDir, '.openclaw', 'workspace-beta');
  assert.equal(fs.existsSync(path.join(betaWorkspace, 'AGENTS.md')), false);
});

test('build does not overwrite non-include files by default', (t) => {
  const homeDir = makeTempHome(t);
  writeOpenclawConfig(homeDir, createDefaultConfig(homeDir));
  runCli(homeDir, ['init']);

  const alphaTemplatesDir = path.join(homeDir, '.openclaw-templates', 'alpha-id');
  fs.writeFileSync(path.join(alphaTemplatesDir, 'NO_INCLUDE.md'), 'template md', 'utf8');
  fs.mkdirSync(path.join(alphaTemplatesDir, 'assets'), { recursive: true });
  fs.writeFileSync(path.join(alphaTemplatesDir, 'assets', 'info.txt'), 'template text', 'utf8');

  const alphaWorkspace = path.join(homeDir, '.openclaw', 'workspace-alpha');
  fs.mkdirSync(path.join(alphaWorkspace, 'assets'), { recursive: true });
  fs.writeFileSync(path.join(alphaWorkspace, 'NO_INCLUDE.md'), 'existing md', 'utf8');
  fs.writeFileSync(path.join(alphaWorkspace, 'assets', 'info.txt'), 'existing text', 'utf8');

  runCli(homeDir, ['build', 'alpha-id']);

  assert.equal(fs.readFileSync(path.join(alphaWorkspace, 'NO_INCLUDE.md'), 'utf8'), 'existing md');
  assert.equal(fs.readFileSync(path.join(alphaWorkspace, 'assets', 'info.txt'), 'utf8'), 'existing text');
});

test('build --overwrite overwrites non-include markdown and non-markdown files', (t) => {
  const homeDir = makeTempHome(t);
  writeOpenclawConfig(homeDir, createDefaultConfig(homeDir));
  runCli(homeDir, ['init']);

  const alphaTemplatesDir = path.join(homeDir, '.openclaw-templates', 'alpha-id');
  fs.writeFileSync(path.join(alphaTemplatesDir, 'NO_INCLUDE.md'), 'template md', 'utf8');
  fs.mkdirSync(path.join(alphaTemplatesDir, 'assets'), { recursive: true });
  fs.writeFileSync(path.join(alphaTemplatesDir, 'assets', 'info.txt'), 'template text', 'utf8');

  const alphaWorkspace = path.join(homeDir, '.openclaw', 'workspace-alpha');
  fs.mkdirSync(path.join(alphaWorkspace, 'assets'), { recursive: true });
  fs.writeFileSync(path.join(alphaWorkspace, 'NO_INCLUDE.md'), 'existing md', 'utf8');
  fs.writeFileSync(path.join(alphaWorkspace, 'assets', 'info.txt'), 'existing text', 'utf8');

  runCli(homeDir, ['build', 'alpha-id', '--overwrite']);

  assert.equal(fs.readFileSync(path.join(alphaWorkspace, 'NO_INCLUDE.md'), 'utf8'), 'template md');
  assert.equal(fs.readFileSync(path.join(alphaWorkspace, 'assets', 'info.txt'), 'utf8'), 'template text');
});

test('build --wipe clears workspace before writing output', (t) => {
  const homeDir = makeTempHome(t);
  writeOpenclawConfig(homeDir, createDefaultConfig(homeDir));
  runCli(homeDir, ['init']);

  const alphaWorkspace = path.join(homeDir, '.openclaw', 'workspace-alpha');
  fs.mkdirSync(path.join(alphaWorkspace, 'old', 'nested'), { recursive: true });
  fs.writeFileSync(path.join(alphaWorkspace, 'old', 'nested', 'legacy.txt'), 'legacy', 'utf8');

  runCli(homeDir, ['build', 'alpha-id', '--wipe']);

  assert.equal(fs.existsSync(path.join(alphaWorkspace, 'old', 'nested', 'legacy.txt')), false);
  assert.ok(fs.existsSync(path.join(alphaWorkspace, 'AGENTS.md')));
});

test('build --wipe preserves workspace .git directory', (t) => {
  const homeDir = makeTempHome(t);
  writeOpenclawConfig(homeDir, createDefaultConfig(homeDir));
  runCli(homeDir, ['init']);

  const alphaWorkspace = path.join(homeDir, '.openclaw', 'workspace-alpha');
  const gitDir = path.join(alphaWorkspace, '.git');
  fs.mkdirSync(gitDir, { recursive: true });
  fs.writeFileSync(path.join(gitDir, 'HEAD'), 'ref: refs/heads/main\n', 'utf8');
  fs.writeFileSync(path.join(alphaWorkspace, 'legacy.txt'), 'legacy', 'utf8');

  runCli(homeDir, ['build', 'alpha-id', '--wipe']);

  assert.ok(fs.existsSync(path.join(gitDir, 'HEAD')));
  assert.equal(fs.existsSync(path.join(alphaWorkspace, 'legacy.txt')), false);
});

test('build never writes into workspace .git paths', (t) => {
  const homeDir = makeTempHome(t);
  writeOpenclawConfig(homeDir, createDefaultConfig(homeDir));
  runCli(homeDir, ['init']);

  const alphaTemplatesDir = path.join(homeDir, '.openclaw-templates', 'alpha-id');
  fs.mkdirSync(path.join(alphaTemplatesDir, '.git'), { recursive: true });
  fs.writeFileSync(path.join(alphaTemplatesDir, '.git', 'HEAD'), 'template head\n', 'utf8');
  fs.mkdirSync(path.join(alphaTemplatesDir, 'nested', '.git'), { recursive: true });
  fs.writeFileSync(path.join(alphaTemplatesDir, 'nested', '.git', 'config'), 'template nested git\n', 'utf8');

  const alphaWorkspace = path.join(homeDir, '.openclaw', 'workspace-alpha');
  fs.mkdirSync(path.join(alphaWorkspace, '.git'), { recursive: true });
  fs.writeFileSync(path.join(alphaWorkspace, '.git', 'HEAD'), 'workspace head\n', 'utf8');

  runCli(homeDir, ['build', 'alpha-id', '--overwrite']);

  assert.equal(fs.readFileSync(path.join(alphaWorkspace, '.git', 'HEAD'), 'utf8'), 'workspace head\n');
  assert.equal(fs.existsSync(path.join(alphaWorkspace, 'nested', '.git', 'config')), false);
});

test('build selector supports only agent id or exact workspace path', (t) => {
  const homeDir = makeTempHome(t);
  const config = createDefaultConfig(homeDir);
  writeOpenclawConfig(homeDir, config);
  runCli(homeDir, ['init']);

  runCli(homeDir, ['build', 'alpha-id']);
  assert.ok(fs.existsSync(path.join(homeDir, '.openclaw', 'workspace-alpha', 'AGENTS.md')));
  assert.equal(fs.existsSync(path.join(homeDir, '.openclaw', 'workspace-beta', 'AGENTS.md')), false);

  runCli(homeDir, ['build', config.agents.defaults.workspace]);
  assert.ok(fs.existsSync(path.join(homeDir, '.openclaw', 'workspace', 'AGENTS.md')));

  const byName = runCli(homeDir, ['build', 'alpha-name'], 1);
  assert.match(byName.stderr, /not found/);
});

test('build workspace-path selector blocks targets outside ~/.openclaw unless --force is supplied', (t) => {
  const homeDir = makeTempHome(t);
  const outsideWorkspace = fs.mkdtempSync(path.join(os.tmpdir(), 'openclaw-templates-outside-'));
  t.after(() => {
    fs.rmSync(outsideWorkspace, { recursive: true, force: true });
  });

  writeOpenclawConfig(homeDir, {
    agents: {
      defaults: {
        workspace: path.join(homeDir, '.openclaw', 'workspace'),
      },
      list: [
        { id: 'main' },
        { id: 'external-id', workspace: outsideWorkspace },
      ],
    },
  });

  runCli(homeDir, ['init']);

  const blocked = runCli(homeDir, ['build', outsideWorkspace], 1);
  assert.match(blocked.stderr, /Refusing to target workspace outside/);
  assert.match(blocked.stderr, /Use --force/);
  assert.equal(fs.existsSync(path.join(outsideWorkspace, 'AGENTS.md')), false);

  runCli(homeDir, ['build', outsideWorkspace, '--force']);
  assert.ok(fs.existsSync(path.join(outsideWorkspace, 'AGENTS.md')));
});

test('commands use HOME override and write only into the temp home', (t) => {
  const homeDir = makeTempHome(t);
  writeOpenclawConfig(homeDir, createDefaultConfig(homeDir));

  const result = runCli(homeDir, ['init']);
  const targetDir = path.join(homeDir, '.openclaw-templates');
  assert.ok(fs.existsSync(targetDir));
  assert.match(result.stdout, new RegExp(targetDir.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\\\$&')));
});

test('global --openclaw-dir overrides default config and workspace root', (t) => {
  const homeDir = makeTempHome(t);
  const customOpenclawDir = path.join(homeDir, 'custom-openclaw');
  const customConfig = {
    agents: {
      defaults: {
        workspace: 'workspace',
      },
      list: [
        { id: 'main' },
        { id: 'alpha-id', workspace: 'workspace-alpha' },
      ],
    },
  };
  writeOpenclawConfig(homeDir, customConfig, customOpenclawDir);

  runCli(homeDir, ['--openclaw-dir', customOpenclawDir, 'doctor']);
  runCli(homeDir, ['--openclaw-dir', customOpenclawDir, 'init']);
  runCli(homeDir, ['--openclaw-dir', customOpenclawDir, 'build', 'alpha-id']);

  assert.ok(fs.existsSync(path.join(customOpenclawDir, 'workspace-alpha', 'AGENTS.md')));
  assert.equal(fs.existsSync(path.join(homeDir, '.openclaw', 'workspace-alpha', 'AGENTS.md')), false);
});

test('global --templates overrides default templates directory', (t) => {
  const homeDir = makeTempHome(t);
  writeOpenclawConfig(homeDir, createDefaultConfig(homeDir));
  const customTemplateDir = path.join(homeDir, 'custom-templates');

  runCli(homeDir, ['--templates', customTemplateDir, 'init']);
  assert.ok(fs.existsSync(path.join(customTemplateDir, '.includes', 'AGENTS', 'HEADER.md')));
  assert.ok(fs.existsSync(path.join(customTemplateDir, 'alpha-id', 'AGENTS.md')));
  assert.equal(fs.existsSync(path.join(homeDir, '.openclaw-templates')), false);

  const buildWithoutTemplate = runCli(homeDir, ['build', 'alpha-id'], 1);
  assert.match(buildWithoutTemplate.stderr, /Run `openclaw-templates init` first/);

  runCli(homeDir, ['--templates', customTemplateDir, 'build', 'alpha-id']);
  assert.ok(fs.existsSync(path.join(homeDir, '.openclaw', 'workspace-alpha', 'AGENTS.md')));
});
