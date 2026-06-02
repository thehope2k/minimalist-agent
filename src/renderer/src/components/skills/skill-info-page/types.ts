import type { LoadedSkill } from '@/lib/electron';
import type { SeedSubmit } from '@/App';

export type SkillInfoPageProps = {
  skill: LoadedSkill | null;
  onClose?: () => void;
  /** Routes Edit submissions to a fresh chat. */
  onStartChatWithSubmission?: (submit: SeedSubmit) => void;
};

export interface KeyValueRow {
  label: string;
  /** Pre-rendered ReactNode so paths can be clickable. */
  value: React.ReactNode;
}
