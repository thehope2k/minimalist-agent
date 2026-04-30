import { Button } from '@/components/ui';

export function NotImplemented({ onBack }: { onBack: () => void }) {
  return (
    <div className="px-8 py-12 text-center">
      <p className="text-sm text-fg-muted">Coming soon.</p>
      <Button variant="outline" onClick={onBack} className="mt-4">
        Back
      </Button>
    </div>
  );
}
