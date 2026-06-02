import { Loader2, AlertCircle, CheckCircle2 } from 'lucide-react';

type Props = {
  status: 'running' | 'done' | 'error';
  resultIsError?: boolean;
};

export function StatusIcon({ status, resultIsError }: Props) {
  if (status === 'running') {
    return <Loader2 className="h-3 w-3 animate-spin" strokeWidth={2} />;
  }
  if (status === 'error' || resultIsError) {
    return <AlertCircle className="h-3 w-3 text-red-400" strokeWidth={2} />;
  }
  return <CheckCircle2 className="h-3 w-3 text-emerald-400" strokeWidth={2} />;
}
