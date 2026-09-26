/** Fixed key per user — a new upload/sync always overwrites the previous avatar rather than accumulating objects. */
export function avatarObjectKey(userId: string): string {
  return `avatars/${userId}`
}

/**
 * Stable path clients can always request. The bucket is private, so this
 * resolves through `GET /users/:id/avatar`, which issues a fresh signed URL
 * on every request rather than embedding one directly — signed URLs expire
 * in 5 minutes, which is too short to store.
 */
export function avatarUrlFor(userId: string, version?: number): string {
  const base = `${process.env.API_URL ?? 'http://localhost:3001'}/users/${userId}/avatar`
  // The version only changes the URL, so a browser cannot keep showing the
  // picture it cached under the old one.
  return version ? `${base}?v=${version}` : base
}
