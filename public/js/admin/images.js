// Supabase Storage helpers for project images.

import { client, config, call } from './api.js';
import { IMAGE_BUCKET, makeImagePath, storagePathFromUrl } from './validators.js';
import { newId } from './dom.js';

export function publicUrlFor(path) {
  return client.storage.from(IMAGE_BUCKET).getPublicUrl(path).data.publicUrl;
}

/** Uploads a validated File and returns its public URL (+ object path). */
export async function uploadProjectImage(file) {
  const path = makeImagePath(file, newId());
  const { error } = await call(() =>
    client.storage.from(IMAGE_BUCKET).upload(path, file, {
      contentType: file.type,
      cacheControl: '31536000',
      upsert: false,
    }));
  if (error) {
    const message = /exceeded|too large|413/i.test(error.message || '')
      ? 'The file is larger than the 5 MB limit.'
      : /mime|not supported|invalid/i.test(error.message || '')
        ? 'That file type is not allowed.'
        : error.message || 'Upload failed.';
    throw new Error(message);
  }
  return { path, url: publicUrlFor(path) };
}

export async function removeObjects(paths) {
  if (!paths.length) return;
  const { error } = await call(() => client.storage.from(IMAGE_BUCKET).remove(paths));
  if (error) console.warn('Could not remove unused image(s)', error.message);
}

/**
 * Deletes uploaded images that are no longer referenced by any project.
 * `urls` are candidates; `remainingProjects` is every project that still exists
 * after the change. Images from outside our bucket are never touched.
 * Best-effort: a failure only leaves an unused file behind.
 */
export async function removeUnreferencedImages(urls, remainingProjects) {
  const stillUsed = new Set(remainingProjects.map((project) => project.image_url).filter(Boolean));
  const paths = [...new Set(urls)]
    .filter((url) => url && !stillUsed.has(url))
    .map((url) => storagePathFromUrl(url, config.supabaseUrl))
    .filter(Boolean);
  await removeObjects(paths);
}
