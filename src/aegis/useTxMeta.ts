import { useState } from 'react';
import type { TxPhase, TxResult } from './client';

// Phase and verified result of the transaction a page is currently confirming.
export function useTxMeta() {
  const [phase, setPhase] = useState<TxPhase | null>(null);
  const [result, setResult] = useState<TxResult | null>(null);
  return { phase, setPhase, result, setResult };
}
