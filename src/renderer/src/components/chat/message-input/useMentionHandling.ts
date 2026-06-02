import { useRef } from 'react';
import { useSkills } from '@/hooks/useSkills';
import { useExtensions } from '@/hooks/useExtensions';
import { useInlineMention } from '@/hooks/useInlineMention';
import type { MentionItem, MentionMenuHandle } from '../MentionMenu';

/**
 * Mention handling (@skill, @extension, @file). Provides trigger, insert,
 * and keyboard navigation logic.
 */
export function useMentionHandling(
  textareaRef: React.RefObject<HTMLTextAreaElement | null>,
  value: string,
  setValue: (text: string) => void,
) {
  const skills = useSkills() ?? [];
  const extensions = useExtensions() ?? [];
  
  const {
    state: mention,
    recompute: recomputeMention,
    reset: resetMention,
  } = useInlineMention(textareaRef);
  
  const mentionHandleRef = useRef<MentionMenuHandle | null>(null);

  /**
   * Replace the in-progress `@…` token with the appropriate mention syntax
   * for the picked item and refocus.
   */
  const insertMention = (item: MentionItem) => {
    const el = textareaRef.current;
    if (!el || mention.triggerIndex < 0) return;
    
    const before = value.slice(0, mention.triggerIndex);
    const after = value.slice(mention.cursor);
    
    let token: string;
    if (item.kind === 'skill') {
      token = `@${item.skill.slug}`;
    } else if (item.kind === 'extension') {
      token = `@${item.extension.slug}`;
    } else {
      // Folders get a trailing slash
      token =
        item.entry.type === 'directory'
          ? `@${item.entry.relativePath}/`
          : `@${item.entry.relativePath}`;
    }
    
    const insertion = `${token} `;
    const next = before + insertion + after;
    setValue(next);
    resetMention();
    
    // Restore caret right after the inserted token
    requestAnimationFrame(() => {
      const pos = before.length + insertion.length;
      el.focus();
      el.setSelectionRange(pos, pos);
    });
  };

  /** Programmatic `@` trigger from the toolbar button */
  const triggerMentionFromButton = () => {
    const el = textareaRef.current;
    if (!el) return;
    
    el.focus();
    const cursor = el.selectionStart ?? value.length;
    const before = value.slice(0, cursor);
    const needsSpace = before.length > 0 && !/\s$/.test(before);
    const insertion = `${needsSpace ? ' ' : ''}@`;
    const next = before + insertion + value.slice(cursor);
    
    setValue(next);
    requestAnimationFrame(() => {
      const pos = before.length + insertion.length;
      el.setSelectionRange(pos, pos);
      recomputeMention();
    });
  };

  return {
    skills,
    extensions,
    mention,
    mentionHandleRef,
    recomputeMention,
    resetMention,
    insertMention,
    triggerMentionFromButton,
  };
}
