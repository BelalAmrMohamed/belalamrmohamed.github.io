import test from 'node:test';
import assert from 'node:assert/strict';
import { validatePreviewPath, validateFilePath, parseDependencies, validateVariantDraft, orderFiles } from '../public/js/site/component-model.js';

test('preview path must be an .html file under /previews/', () => {
  assert.equal(validatePreviewPath('').value, null);
  assert.equal(validatePreviewPath('/previews/a/index.html').ok, true);
  for (const bad of ['https://evil.test/x.html', '//evil.test/p.html', '/previews/../admin.html', '/other/a.html', '/previews/a.js', 'javascript:alert(1)']) {
    assert.equal(validatePreviewPath(bad).ok, false, bad);
  }
});
test('file paths are relative and traversal-free', () => {
  assert.equal(validateFilePath('src/Button.tsx').ok, true);
  for (const bad of ['', '/etc/passwd', '../x.ts', 'a/../b.ts', 'a b.ts', 'x'.repeat(201)]) assert.equal(validateFilePath(bad).ok, false, bad);
});
test('dependencies: exact versions on the allowlist only', () => {
  assert.deepEqual(parseDependencies('react@18.3.1, tailwindcss@3.4.17').value, { react: '18.3.1', tailwindcss: '3.4.17' });
  assert.equal(parseDependencies('lodash@4.17.21').ok, false);
  assert.equal(parseDependencies('react@^18').ok, false);
});
test('variant draft needs exactly one entry file and unique paths', () => {
  const f = (path, is_entry) => ({ path, source: 'x', is_entry });
  assert.deepEqual(validateVariantDraft({ preview: '', depsText: '', files: [f('a.tsx', true)] }), []);
  assert.ok(validateVariantDraft({ preview: '', depsText: '', files: [f('a.tsx', false)] }).length);
  assert.ok(validateVariantDraft({ preview: '', depsText: '', files: [f('a.tsx', true), f('a.tsx', false)] }).length);
  assert.ok(validateVariantDraft({ preview: '', depsText: '', files: [] }).length);
});
test('orderFiles puts the entry first', () => {
  assert.equal(orderFiles([{ path: 'b', sort_order: 0 }, { path: 'a', sort_order: 1, is_entry: true }])[0].path, 'a');
});
