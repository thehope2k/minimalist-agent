import { AIPanel } from './panels/AIPanel';
import { AppPanel } from './panels/AppPanel';
import { PermissionsPanel } from './panels/PermissionsPanel';
import { PreferencesPanel } from './panels/PreferencesPanel';
import { ProjectsPanel } from './panels/ProjectsPanel';
import { StubPanel } from './panels/StubPanel';
import {
  SETTINGS_CATEGORIES,
  type SettingsCategory,
} from './SettingsCategoriesPanel';

export function SettingsContent({ category }: { category: SettingsCategory }) {
  const meta = SETTINGS_CATEGORIES.find((c) => c.id === category);
  return (
    <main className="flex h-full w-full flex-col bg-panel">
      <header className="flex h-10 items-center justify-center border-b border-border px-4">
        <h2 className="text-[15px] font-semibold text-fg">{meta?.label ?? 'Settings'}</h2>
      </header>
      <div className="scroll-thin flex-1 overflow-y-auto">
        {category === 'ai' ? (
          <AIPanel />
        ) : category === 'app' ? (
          <AppPanel />
        ) : category === 'permissions' ? (
          <PermissionsPanel />
        ) : category === 'preferences' ? (
          <PreferencesPanel />
        ) : category === 'projects' ? (
          <ProjectsPanel />
        ) : (
          <StubPanel title={meta?.label ?? 'Settings'} />
        )}
      </div>
    </main>
  );
}
