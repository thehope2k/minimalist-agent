import { useState } from 'react';
import { MessageSquarePlus, PlugZap } from 'lucide-react';
import { Button } from '@/components/ui';
import type { McpTestResult } from '@/lib/electron';

export function ConnectionCheck({
  slug,
  testable,
  onStartChat,
}: {
  slug: string;
  testable: boolean;
  onStartChat?: () => void;
}) {
  const [testing, setTesting] = useState(false);
  const [result, setResult] = useState<McpTestResult | null>(null);

  const runTest = async () => {
    setTesting(true);
    setResult(null);
    try {
      setResult(await window.api.extensions.testMcp(slug));
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="space-y-2 rounded-md border border-border/60 bg-elevated/40 p-3">
      <p className="text-xs text-fg-muted">
        Setup is complete. New chats pick the extension up automatically — a chat that is already
        open won't see it until you start a new one.
      </p>
      <div className="flex flex-wrap items-center gap-2">
        {testable && (
          <Button icon={PlugZap} loading={testing} onClick={runTest}>
            {testing ? 'Connecting…' : 'Test connection'}
          </Button>
        )}
        {onStartChat && (
          <Button variant="primary" icon={MessageSquarePlus} onClick={onStartChat}>
            Start a chat with it
          </Button>
        )}
      </div>
      {result?.ok && (
        <p className="text-xs text-green-300">Connected — {result.toolCount} tool(s) available.</p>
      )}
      {result && !result.ok && (
        <p className="break-words text-xs text-red-300">Connection failed: {result.error}</p>
      )}
    </div>
  );
}
