import type { Verdict, IncidentStatus, TokenState, SourceState } from '../aegis/types';

type Variant = 'cyan' | 'green' | 'red' | 'amber' | 'gray';

function badge(label: string, variant: Variant, pulse = false) {
  return (
    <span className={`badge badge-${variant}`}>
      {pulse && <span className={variant === 'red' ? 'pulse-dot-red' : 'pulse-dot'} />}
      {label}
    </span>
  );
}

export function IncidentStatusBadge({ status }: { status: IncidentStatus }) {
  switch (status) {
    case 'OPEN':                   return badge('OPEN', 'cyan', true);
    case 'AUTHORITY_PENDING':      return badge('PENDING FINALITY', 'amber', true);
    case 'CONFIRMED_NO_GOVERNANCE':return badge('GOVERNANCE REJECTED', 'red');
    case 'AUTHORITY_ISSUED':       return badge('AUTHORITY ISSUED', 'cyan');
    case 'SUSPENSION_APPLIED':     return badge('SUSPENSION APPLIED', 'green');
    case 'AUTHORITY_EXPIRED':      return badge('AUTHORITY EXPIRED', 'gray');
    case 'AUTHORITY_FAILED':       return badge('AUTHORITY FAILED', 'red');
    case 'RETRYABLE':              return badge('RETRYABLE', 'amber');
    case 'CLOSED_NO_AUTHORITY':    return badge('NO AUTHORITY', 'gray');
    default:                       return badge(status, 'gray');
  }
}

export function VerdictBadge({ verdict }: { verdict: Verdict }) {
  switch (verdict) {
    case 'CONFIRMED':        return badge('CONFIRMED', 'green');
    case 'NOT_CONFIRMED':    return badge('NOT CONFIRMED', 'red');
    case 'WEAK_EVIDENCE':    return badge('WEAK EVIDENCE', 'amber');
    case 'DISPROPORTIONATE': return badge('DISPROPORTIONATE', 'red');
    case 'CONFLICTING':      return badge('CONFLICTING', 'amber');
    default:                 return badge(verdict, 'gray');
  }
}

export function TokenStateBadge({ state }: { state: TokenState }) {
  switch (state) {
    case 'ISSUED':     return badge('ISSUED', 'cyan', true);
    case 'DISPATCHED': return badge('DISPATCHED', 'amber', true);
    case 'APPLIED':    return badge('APPLIED', 'green');
    case 'EXPIRED':    return badge('EXPIRED', 'gray');
    default:           return badge(state, 'gray');
  }
}

export function ActiveBadge({ active }: { active: boolean }) {
  return active ? badge('ACTIVE', 'green') : badge('INACTIVE', 'gray');
}

export function SourceStateBadge({ state }: { state: SourceState }) {
  switch (state) {
    case 'SUPPORTS':    return badge('SUPPORTS', 'green');
    case 'CONTRADICTS': return badge('CONTRADICTS', 'red');
    case 'NEUTRAL':     return badge('NEUTRAL', 'gray');
    case 'UNAVAILABLE': return badge('UNAVAILABLE', 'amber');
    default:            return badge(state, 'gray');
  }
}
