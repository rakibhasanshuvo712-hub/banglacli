import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

export interface ProjectContext {
  framework: string;
  language: string;
  packageManager: string;
  hasTypeScript: boolean;
  hasTailwind: boolean;
  scripts: Record<string, string>;
  dependencies: string[];
  gitBranch: string | null;
  gitDirty: boolean;
  keyDirectories: string[];
  summary: string;
}

/**
 * Intelligent Project Context Detector (Pre-Flight Analyzer)
 * 
 * Inspects workspace manifests, dependencies, frameworks, package managers,
 * and git status to provide instant ambient intelligence to the agent.
 */
export function detectProjectContext(rootDir: string = process.cwd()): ProjectContext {
  let framework = 'Generic / Standalone';
  let language = 'JavaScript';
  let packageManager = 'npm';
  let hasTypeScript = false;
  let hasTailwind = false;
  const scripts: Record<string, string> = {};
  const dependencies: string[] = [];
  let gitBranch: string | null = null;
  let gitDirty = false;
  const keyDirectories: string[] = [];

  // 1. Detect Package Manager by Lockfile
  if (fs.existsSync(path.join(rootDir, 'bun.lockb')) || fs.existsSync(path.join(rootDir, 'bun.lock'))) {
    packageManager = 'bun';
  } else if (fs.existsSync(path.join(rootDir, 'pnpm-lock.yaml'))) {
    packageManager = 'pnpm';
  } else if (fs.existsSync(path.join(rootDir, 'yarn.lock'))) {
    packageManager = 'yarn';
  } else if (fs.existsSync(path.join(rootDir, 'package-lock.json'))) {
    packageManager = 'npm';
  }

  // 2. TypeScript Detection
  if (
    fs.existsSync(path.join(rootDir, 'tsconfig.json')) ||
    fs.existsSync(path.join(rootDir, 'tsconfig.base.json'))
  ) {
    hasTypeScript = true;
    language = 'TypeScript';
  }

  // 3. Node.js / JavaScript / TypeScript Ecosystem
  const pkgPath = path.join(rootDir, 'package.json');
  if (fs.existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
      if (pkg.scripts) {
        Object.assign(scripts, pkg.scripts);
      }
      const allDeps = {
        ...(pkg.dependencies || {}),
        ...(pkg.devDependencies || {}),
      };
      dependencies.push(...Object.keys(allDeps));

      if (allDeps['tailwindcss'] || allDeps['@tailwindcss/postcss']) {
        hasTailwind = true;
      }

      if (allDeps['next']) {
        const isAppRouter = fs.existsSync(path.join(rootDir, 'app')) || fs.existsSync(path.join(rootDir, 'src/app'));
        framework = isAppRouter ? 'Next.js (App Router)' : 'Next.js (Pages Router)';
      } else if (allDeps['@remix-run/react']) {
        framework = 'Remix';
      } else if (allDeps['@astrojs/starlight'] || allDeps['astro']) {
        framework = 'Astro';
      } else if (allDeps['nuxt']) {
        framework = 'Nuxt';
      } else if (allDeps['svelte'] || allDeps['@sveltejs/kit']) {
        framework = 'SvelteKit';
      } else if (allDeps['vite']) {
        if (allDeps['react']) framework = 'Vite (React)';
        else if (allDeps['vue']) framework = 'Vite (Vue)';
        else framework = 'Vite';
      } else if (allDeps['express']) {
        framework = 'Express.js API Server';
      } else if (allDeps['@nestjs/core']) {
        framework = 'NestJS';
      } else if (allDeps['react']) {
        framework = 'React SPA';
      }
    } catch {}
  }

  // 4. Python Ecosystem
  if (fs.existsSync(path.join(rootDir, 'requirements.txt')) || fs.existsSync(path.join(rootDir, 'pyproject.toml'))) {
    language = 'Python';
    packageManager = 'pip';
    if (fs.existsSync(path.join(rootDir, 'requirements.txt'))) {
      try {
        const reqs = fs.readFileSync(path.join(rootDir, 'requirements.txt'), 'utf8');
        if (reqs.includes('fastapi')) framework = 'FastAPI';
        else if (reqs.includes('django')) framework = 'Django';
        else if (reqs.includes('flask')) framework = 'Flask';
      } catch {}
    }
  }

  // 5. Rust / Go
  if (fs.existsSync(path.join(rootDir, 'Cargo.toml'))) {
    language = 'Rust';
    packageManager = 'cargo';
    framework = 'Cargo Rust Workspace';
  } else if (fs.existsSync(path.join(rootDir, 'go.mod'))) {
    language = 'Go';
    packageManager = 'go';
    framework = 'Go Module';
  }

  // 6. Key Directories
  const candidateDirs = ['src', 'app', 'pages', 'components', 'lib', 'server', 'api', 'tests', 'public'];
  for (const dir of candidateDirs) {
    if (fs.existsSync(path.join(rootDir, dir))) {
      keyDirectories.push(dir);
    }
  }

  // 7. Git State
  try {
    const branch = execSync('git rev-parse --abbrev-ref HEAD 2>/dev/null || git branch --show-current', {
      cwd: rootDir,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
    if (branch) gitBranch = branch;

    const status = execSync('git status --porcelain', {
      cwd: rootDir,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
    gitDirty = status.length > 0;
  } catch {}

  // 8. Markdown Summary for System Prompt Injection
  const summaryLines: string[] = [
    `### 📁 DETECTED WORKSPACE ENVIRONMENT:`,
    `- Framework / Stack: ${framework} (${language}${hasTypeScript ? ', TypeScript' : ''}${hasTailwind ? ', Tailwind CSS' : ''})`,
    `- Package Manager: ${packageManager}`,
  ];

  if (Object.keys(scripts).length > 0) {
    const keyScriptNames = ['dev', 'build', 'test', 'start', 'lint'].filter((k) => scripts[k]);
    if (keyScriptNames.length > 0) {
      summaryLines.push(
        `- Key Scripts: ${keyScriptNames.map((k) => `"${packageManager} run ${k}" (${scripts[k]})`).join(', ')}`
      );
    }
  }

  if (keyDirectories.length > 0) {
    summaryLines.push(`- Key Directories: ${keyDirectories.join(', ')}`);
  }

  if (gitBranch) {
    summaryLines.push(`- Git Status: branch "${gitBranch}" (${gitDirty ? 'uncommitted changes' : 'clean'})`);
  }

  return {
    framework,
    language,
    packageManager,
    hasTypeScript,
    hasTailwind,
    scripts,
    dependencies,
    gitBranch,
    gitDirty,
    keyDirectories,
    summary: summaryLines.join('\n'),
  };
}
