let globalWorkspace: Promise<string> | null = null;

export function getGlobalAuthoringWorkspace(): Promise<string> {
  globalWorkspace ??= window.api.authoring.getGlobalWorkspace();
  return globalWorkspace;
}
