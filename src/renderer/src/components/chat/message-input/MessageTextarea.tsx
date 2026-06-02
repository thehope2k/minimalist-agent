import { HighlightedTextarea } from '../HighlightedTextarea';
import { MentionMenu, type MentionMenuHandle } from '../MentionMenu';
import type { LoadedSkill, LoadedExtension } from '@/lib/electron';

type MentionState = {
  active: boolean;
  query: string;
  triggerIndex: number;
  cursor: number;
};

type Props = {
  textareaRef: React.RefObject<HTMLTextAreaElement | null>;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void;
  onKeyDown: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void;
  onPaste: (e: React.ClipboardEvent<HTMLTextAreaElement>) => void;
  onBlur: () => void;
  disabled: boolean;
  placeholder: string;
  mention: MentionState;
  mentionHandleRef: React.RefObject<MentionMenuHandle | null>;
  skills: LoadedSkill[];
  extensions: LoadedExtension[];
  cwd?: string;
  onMentionSelect: (item: any) => void;
  onMentionClose: () => void;
};

export function MessageTextarea({
  textareaRef,
  value,
  onChange,
  onKeyDown,
  onPaste,
  onBlur,
  disabled,
  placeholder,
  mention,
  mentionHandleRef,
  skills,
  extensions,
  cwd,
  onMentionSelect,
  onMentionClose,
}: Props) {
  return (
    <div className="relative">
      <HighlightedTextarea
        ref={textareaRef as any}
        value={value}
        onChange={onChange}
        onKeyDown={onKeyDown}
        onPaste={onPaste}
        onBlur={onBlur}
        rows={4}
        placeholder={placeholder}
        disabled={disabled}
      />
      <MentionMenu
        open={mention.active}
        query={mention.query}
        skills={skills}
        extensions={extensions}
        cwd={cwd}
        onSelect={onMentionSelect}
        onClose={onMentionClose}
        handleRef={mentionHandleRef}
      />
    </div>
  );
}
