import { useWallet } from '../aegis/useWallet';
import { shortAddr } from '../utils/format';

export function WalletButton() {
  const { address, connected, connecting, isWrongNetwork, connect, disconnect, switchNetwork } = useWallet();

  if (isWrongNetwork) {
    return (
      <button className="btn btn-danger notched-sm" onClick={() => { void switchNetwork(); }}>
        <span className="pulse-dot-red" />
        Wrong Network
      </button>
    );
  }

  if (connected && address) {
    return (
      <button className="btn btn-ghost notched-sm font-mono" onClick={disconnect}
        title="Click to disconnect">
        <span className="pulse-dot" />
        {shortAddr(address)}
      </button>
    );
  }

  return (
    <button className="btn btn-outline-accent notched-sm" onClick={() => { void connect(); }} disabled={connecting}>
      {connecting ? <span className="spinner" /> : null}
      {connecting ? 'Connecting…' : 'Connect Wallet'}
    </button>
  );
}
