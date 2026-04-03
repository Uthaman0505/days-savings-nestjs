import type { User } from '../user/user.entity';

/**
 * URL shown to clients. When PUBLIC_APP_URL is set and the user has an avatarKey,
 * use the API proxy so images work with private buckets (JWT required — see Image headers in the app).
 */
export function resolveClientAvatarUrl(
  user: Pick<User, 'avatarUrl' | 'avatarKey'>,
  publicAppUrl: string | undefined,
): string | null {
  if (!user.avatarKey) {
    return user.avatarUrl ?? null;
  }
  const base = publicAppUrl?.trim();
  if (base) {
    const q = `v=${encodeURIComponent(user.avatarKey)}`;
    return `${base.replace(/\/$/, '')}/profile/avatar?${q}`;
  }
  return user.avatarUrl ?? null;
}
