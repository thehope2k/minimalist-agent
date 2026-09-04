import { ipcMain } from 'electron';
import { clearProjectFromSessions } from '../storage/sessions';
import {
  createProject,
  deleteProject,
  listProjects,
  type Project,
  type ProjectInput,
  updateProject,
} from '../storage/projects';

/** Project CRUD + clearing project association from sessions on delete. */
export function registerProjectsIpc(): void {
  ipcMain.handle('projects:list', (): Project[] => listProjects());
  ipcMain.handle(
    'projects:create',
    (_e, input: ProjectInput): Project => createProject(input),
  );
  ipcMain.handle(
    'projects:update',
    (_e, id: string, patch: Partial<Omit<Project, 'id' | 'createdAt'>>):
      | Project
      | null => updateProject(id, patch),
  );
  ipcMain.handle(
    'projects:delete',
    (_e, id: string): { ok: boolean; sessionsCleared: number } => {
      const ok = deleteProject(id);
      const sessionsCleared = ok ? clearProjectFromSessions(id) : 0;
      return { ok, sessionsCleared };
    },
  );
}
