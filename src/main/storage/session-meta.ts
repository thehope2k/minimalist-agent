import { join } from 'node:path';
import { type FileSchema } from './json-store';
import { Paths } from './paths';
import type { SessionMeta } from './session-types';

export const META_DEFAULT_FACTORY = (): SessionMeta => ({
  id: '',
  title: 'New session',
  archived: false,
  createdAt: 0,
  lastMessageAt: 0,
});

export function metaSchema(id: string): FileSchema<SessionMeta> {
  return {
    path: join(Paths.sessionsDir(), id, 'session.json'),
    currentVersion: 12,
    defaultValue: META_DEFAULT_FACTORY(),
    migrations: [
      (prev) => ({ ...META_DEFAULT_FACTORY(), ...(prev as object) }) as SessionMeta,
      (prev) => ({ ...(prev as SessionMeta) }),
      (prev) => ({ ...(prev as SessionMeta) }),
      (prev) => ({ ...(prev as SessionMeta), projectId: null }) as SessionMeta,
      (prev) => ({ ...(prev as SessionMeta) }),
      (prev) => ({ ...(prev as SessionMeta) }),
      (prev) => ({ ...(prev as SessionMeta) }),
      (prev) => ({ ...(prev as SessionMeta) }),
      (prev) => {
        const session = prev as SessionMeta;
        return session.permissionMode === ('ask' as never)
          ? { ...session, permissionMode: 'auto' }
          : session;
      },
      (prev) => ({ ...(prev as SessionMeta) }),
      (prev) => ({ ...(prev as SessionMeta) }),
      (prev) => {
        const legacy = prev as SessionMeta & { sdkSessionId?: string };
        const { sdkSessionId, ...session } = legacy;
        return {
          ...session,
          ...(sdkSessionId ? { runtimeSessionId: sdkSessionId } : {}),
        } as SessionMeta;
      },
    ],
  };
}
