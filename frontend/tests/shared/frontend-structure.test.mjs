import assert from 'node:assert/strict';
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const layers = ['components', 'hooks', 'lib', 'store', 'tests'];
const files = (directory) =>
  readdirSync(directory, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory()
      ? files(path.join(directory, entry.name))
      : [path.join(directory, entry.name)],
  );
const appFiles = files(path.join(root, 'app'));
const sections = new Set(
  appFiles.flatMap((file) =>
    path
      .relative(path.join(root, 'app'), path.dirname(file))
      .split(path.sep)
      .filter((part) => part && !part.startsWith('(') && !part.startsWith('[')),
  ),
);
const sourceFiles = () =>
  layers.flatMap((layer) =>
    existsSync(path.join(root, layer)) ? files(path.join(root, layer)) : [],
  );
const resolveLocal = (file, specifier) => {
  const base = specifier.startsWith('@/')
    ? path.join(root, specifier.slice(2))
    : path.resolve(path.dirname(file), specifier);
  return ['', '.ts', '.tsx', '.js', '.mjs', '.json', '/index.ts', '/index.tsx']
    .map((extension) => base + extension)
    .find((candidate) => existsSync(candidate));
};
const owner = (file) => {
  const [layer, section] = path.relative(root, file).split(path.sep);
  return layers.includes(layer) ? section : undefined;
};

test('legacy routes, helpers, assets and landing anchors are removed', () => {
  for (const target of [
    'app/jovenes',
    'components/jovenes',
    'hooks/useRegistroCiudadano.ts',
    'lib/public-registro-api.ts',
    'lib/public-eventos-api.ts',
    'lib/registro-errors.ts',
    'public/images/candidata-hero.jpg',
    'public/images/candidata-vision.jpg',
    'public/images/team-candidata.jpg',
    ...Array.from({ length: 5 }, (_, i) => `public/images/galeria-${i + 1}.jpg`),
    ...Array.from({ length: 4 }, (_, i) => `public/images/team-${i + 1}.jpg`),
  ]) {
    assert.equal(existsSync(path.join(root, target)), false, target);
  }
  for (const file of [...appFiles, ...sourceFiles()].filter((file) =>
    /\.[cm]?[jt]sx?$/.test(file),
  )) {
    if (file.endsWith('frontend-structure.test.mjs')) continue;
    assert.doesNotMatch(
      readFileSync(file, 'utf8'),
      /['"]\/jovenes(?:[#/'"]|$)|['"]\/#(?:propuestas|eventos|galeria|voces|sumate)/,
      path.relative(root, file),
    );
  }
});

test('root redirects into the existing guarded platform flow', () => {
  const source = readFileSync(path.join(root, 'app/page.tsx'), 'utf8');
  assert.match(source, /import\s*\{\s*redirect\s*\}\s*from\s*['"]next\/navigation['"]/);
  assert.match(source, /redirect\(['"]\/admin['"]\)/);
  assert.doesNotMatch(source, /components\/public|LandingPage|HeroSection/);
});

test('layer groups match literal app sections without empty or legacy folders', () => {
  for (const layer of layers) {
    const directory = path.join(root, layer);
    assert.ok(existsSync(directory), layer);
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      assert.ok(entry.isDirectory(), `${layer}/${entry.name} must be grouped`);
      assert.ok(
        entry.name === 'shared' ||
          (layer === 'components' && entry.name === 'ui') ||
          sections.has(entry.name),
        `${layer}/${entry.name} has no matching route section`,
      );
      assert.ok(files(path.join(directory, entry.name)).length, `${layer}/${entry.name} is empty`);
    }
  }
  for (const legacy of ['stores', 'test']) {
    assert.equal(existsSync(path.join(root, legacy)), false, legacy);
  }
  for (const file of [...appFiles, ...sourceFiles()]) {
    if (/\.test\.[cm]?[jt]sx?$/.test(file)) {
      assert.ok(file.startsWith(path.join(root, 'tests') + path.sep), file);
    }
  }
});

test('local imports resolve and sections never depend on another section', () => {
  const sources = [...appFiles, ...sourceFiles()].filter((file) => /\.[cm]?[jt]sx?$/.test(file));
  for (const file of sources) {
    if (file.endsWith('frontend-structure.test.mjs')) continue;
    const source = readFileSync(file, 'utf8');
    for (const match of source.matchAll(/['"]((?:@\/|\.\.?\/)[^'"\n]+)['"]/g)) {
      const target = resolveLocal(file, match[1]);
      assert.ok(target, `${path.relative(root, file)}: unresolved ${match[1]}`);
      const from = owner(file);
      const to = owner(target);
      if (!from || !to || ['shared', 'ui'].includes(to)) continue;
      assert.equal(from, to, `${path.relative(root, file)} -> ${path.relative(root, target)}`);
    }
  }
});
