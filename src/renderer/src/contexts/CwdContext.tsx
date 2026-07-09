import { createContext, useContext } from 'react';

/**
 * Active session working directory — available to any component in the
 * chat tree without prop drilling.
 *
 * Provided by ChatContent; consumed by anything that needs to scope
 * skill / extension resolution to the current project.
 */
export const CwdContext = createContext<string | undefined>(undefined);

/** The active session's working directory, or undefined outside a session. */
export function useCwd(): string | undefined {
  return useContext(CwdContext);
}
