interface PermissionModesSectionProps {
  alwaysAllow: string[];
}

export function PermissionModesSection({ alwaysAllow }: PermissionModesSectionProps) {
  const hasList = alwaysAllow.length > 0;

  return (
    <section>
      <div className="mb-2">
        <h2 className="text-sm font-semibold text-fg">Always Allowed Tools</h2>
        <p className="mt-1 text-xs text-fg-subtle">
          Informational only — not enforced. Documents which tools the skill expects to use.
        </p>
      </div>
      <div className="overflow-hidden rounded-lg border border-border/50 bg-elevated/20">
        {hasList ? (
          <div className="px-4 py-3">
            <div className="flex flex-wrap gap-2">
              {alwaysAllow.map((tool) => (
                <span
                  key={tool}
                  className="rounded-md bg-elevated px-2 py-1 font-mono text-xs text-fg"
                >
                  {tool}
                </span>
              ))}
            </div>
          </div>
        ) : (
          <div className="px-4 py-3 text-xs text-fg-subtle">
            No tools declared. Add <Mono>alwaysAllow: ["Bash", "Write"]</Mono> to
            the frontmatter to document expected tool usage.
          </div>
        )}
      </div>
    </section>
  );
}

function Mono({ children }: { children: React.ReactNode }) {
  return <span className="font-mono text-[12.5px]">{children}</span>;
}
