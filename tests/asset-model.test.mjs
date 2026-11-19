import test from 'node:test';
import assert from 'node:assert/strict';
import {
  pickCoverAsset, makeAssetPath, assetFolder, reorderUpdates, validateAssetMeta,
  coverSyncPlan, defaultRoleFor, nextSortOrder, storagePublicUrl,
} from '../public/js/site/asset-model.js';

const PID = '11111111-2222-4333-8444-555555555555';
const SB = 'https://x.supabase.co';
const A = (id, role, so) => ({ id, role, sort_order: so, media_kind: 'image', bucket: 'portfolio-images', storage_path: `assets/${PID}/${id}.png` });

test('cover follows role priority, then list order', () => {
  assert.equal(pickCoverAsset([A('a', 'gallery', 0), A('b', 'logo', 1), A('c', 'logo', 2)]).id, 'b');
  assert.equal(pickCoverAsset([A('a', 'gallery', 0), A('b', 'cover', 1)]).id, 'b');
  assert.equal(pickCoverAsset([]), null);
});
test('paths are confined to the case folder', () => {
  assert.equal(makeAssetPath(PID, PID, 'png'), `assets/${PID}/${PID}.png`);
  assert.throws(() => assetFolder('../x'));
  assert.throws(() => makeAssetPath(PID, PID, '../p'));
});
test('reorder renumbers and ignores edges', () => {
  const l = [A('a', 'cover', 0), A('b', 'gallery', 1), A('c', 'gallery', 2)];
  assert.deepEqual(reorderUpdates(l, 'b', -1), [{ id: 'b', sort_order: 0 }, { id: 'a', sort_order: 1 }]);
  assert.deepEqual(reorderUpdates(l, 'a', -1), []);
  assert.deepEqual(reorderUpdates(l, 'c', 1), []);
  assert.deepEqual(reorderUpdates([A('a', 'cover', 5), A('b', 'gallery', 9)], 'b', -1),
    [{ id: 'b', sort_order: 0 }, { id: 'a', sort_order: 1 }]);
});
test('defaults', () => {
  assert.equal(defaultRoleFor([]), 'cover');
  assert.equal(defaultRoleFor([A('a', 'cover', 0)]), 'gallery');
  assert.equal(nextSortOrder([]), 0);
  assert.equal(nextSortOrder([A('a', 'cover', 3)]), 4);
});
test('metadata validation', () => {
  assert.ok(validateAssetMeta({ role: 'edited_video' }).errors.role);
  assert.ok(validateAssetMeta({ role: 'logo', alt_text: 'x'.repeat(301) }).errors.alt_text);
  assert.deepEqual(validateAssetMeta({ role: 'logo', alt_text: ' hi ', caption: '' }).errors, {});
});
test('cover sync never overwrites a hand-entered cover', () => {
  const base = { assets: [A('a', 'cover', 0)], supabaseUrl: SB, bucket: 'portfolio-images', projectId: PID };
  const own = storagePublicUrl(SB, 'portfolio-images', `assets/${PID}/a.png`);
  assert.deepEqual(coverSyncPlan({ ...base, currentUrl: 'https://other/x.png' }), { change: false });
  assert.deepEqual(coverSyncPlan({ ...base, currentUrl: own }), { change: false });
  assert.deepEqual(coverSyncPlan({ ...base, currentUrl: null }), { change: true, url: own });
  assert.deepEqual(coverSyncPlan({ ...base, currentUrl: own, assets: [] }), { change: true, url: null });
  assert.deepEqual(coverSyncPlan({ ...base, currentUrl: null, assets: [] }), { change: false });
});

import { validateVideoFile, makeVideoPath, pickVideoAsset, VIDEO_MAX_BYTES } from '../public/js/site/asset-model.js';
test('video validation and paths', () => {
  assert.equal(validateVideoFile({ type: 'video/mp4', size: 1000 }), null);
  assert.ok(validateVideoFile({ type: 'video/webm', size: 1000 }));
  assert.ok(validateVideoFile({ type: 'video/mp4', size: VIDEO_MAX_BYTES + 1 }));
  assert.ok(validateVideoFile({ type: 'video/mp4', size: 0 }));
  assert.equal(makeVideoPath(PID, PID), `videos/${PID}/${PID}.mp4`);
  assert.throws(() => makeVideoPath('../x', PID));
  assert.equal(pickVideoAsset([A('a', 'cover', 0), { id: 'v', media_kind: 'video', role: 'edited_video' }]).id, 'v');
  assert.equal(pickVideoAsset([A('a', 'cover', 0)]), null);
});
