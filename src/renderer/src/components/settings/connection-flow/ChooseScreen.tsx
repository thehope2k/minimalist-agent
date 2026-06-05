import { Key, Monitor, Plug, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui';
import { AnthropicMark, GithubMark, OpenAIMark } from './shared';
import type { ConnectionKind } from './types';

type ChoiceProps = {
  icon: React.ReactNode;
  title: string;
  desc: string;
  comingSoon?: boolean;
  onClick: () => void;
};

function Choice({ icon, title, desc, comingSoon, onClick }: ChoiceProps) {
  return (
    <button
      disabled={comingSoon}
      onClick={onClick}
      className={cn(
        'flex w-full items-start gap-3 rounded-lg border border-border bg-elevated/30 px-3.5 py-3 text-left transition-colors',
        comingSoon
          ? 'cursor-not-allowed opacity-60'
          : 'hover:border-border-strong hover:bg-elevated',
      )}
    >
      <span className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-md bg-elevated text-fg-muted">
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-fg">{title}</span>
          {comingSoon && <Badge variant="soon">Soon</Badge>}
        </div>
        <div className="text-xs text-fg-subtle">{desc}</div>
      </div>
    </button>
  );
}

export function ChooseScreen({ onPick }: { onPick: (k: ConnectionKind) => void }) {
  return (
    <div className="px-8 py-10">
      <div className="mx-auto mb-6 grid h-12 w-12 place-items-center rounded-lg bg-accent/15 text-accent">
        <Sparkles className="h-6 w-6" strokeWidth={1.75} />
      </div>
      <h2 className="text-center text-lg font-semibold text-fg">
        Add an AI connection
      </h2>
      <p className="mt-1 text-center text-sm text-fg-subtle">
        How would you like to connect?
      </p>

      <div className="mt-6 space-y-2">
        <Choice
          icon={<AnthropicMark />}
          title="Claude Pro / Max"
          desc="Use your Claude subscription for unlimited access."
          onClick={() => onPick('claude-max')}
        />
        <Choice
          icon={<OpenAIMark />}
          title="Codex · ChatGPT Plus"
          desc="Sign in with your ChatGPT Plus or Pro account."
          onClick={() => onPick('chatgpt-plus')}
        />
        <Choice
          icon={<GithubMark />}
          title="GitHub Copilot"
          desc="Sign in with GitHub. Chat runtime ships next milestone."
          onClick={() => onPick('github-copilot')}
        />
        <Choice
          icon={<Plug className="h-4 w-4" strokeWidth={1.75} />}
          title="OpenAI-compatible API"
          desc="StepFun, DeepSeek, Groq, OpenRouter, xAI… pick a provider and paste a key."
          onClick={() => onPick('openai-compatible')}
        />
        <Choice
          icon={<Key className="h-4 w-4" strokeWidth={1.75} />}
          title="I use another provider"
          desc="Anthropic API key (Bedrock / OpenAI / Gemini coming later)."
          onClick={() => onPick('other')}
        />
        <Choice
          icon={<Monitor className="h-4 w-4" strokeWidth={1.75} />}
          title="Local model"
          desc="Run models locally with Ollama."
          onClick={() => onPick('local')}
        />
      </div>
    </div>
  );
}
