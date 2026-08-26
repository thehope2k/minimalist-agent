import type { LoadedAgent } from '@/lib/electron';

export function ToolsAndLimitsSection({ agent }: { agent: LoadedAgent }) {
  const tools = agent.metadata.tools || [];
  const { maxTurns, permissionMode, effort } = agent.metadata;
  const hasLimits = maxTurns || permissionMode || effort;

  return (
    <section>
      <div className="mb-2">
        <h2 className="text-sm font-semibold text-fg">Tools & Limits</h2>
      </div>
      <div className="overflow-hidden rounded-lg border border-border/50 bg-elevated/20">
        <div className="space-y-3 px-4 py-3">
          <div>
            <div className="mb-1.5 text-xs font-medium text-fg-subtle">Tools</div>
            {tools.length === 0 ? (
              <div className="text-sm text-fg-muted">All available tools</div>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {tools.map((t) => (
                  <span
                    key={t}
                    className="rounded bg-elevated px-2 py-0.5 font-mono text-xs text-fg"
                  >
                    {t}
                  </span>
                ))}
              </div>
            )}
          </div>

          {hasLimits && (
            <div>
              <div className="mb-1.5 text-xs font-medium text-fg-subtle">
                Limits & Config
              </div>
              <div className="space-y-1 text-sm text-fg-muted">
                {maxTurns && (
                  <div>
                    Max turns: <span className="text-fg">{maxTurns}</span>
                  </div>
                )}
                {permissionMode && (
                  <div>
                    Permission mode: <span className="text-fg">{permissionMode}</span>
                  </div>
                )}
                {effort && (
                  <div>
                    Effort: <span className="text-fg">{effort}</span>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
