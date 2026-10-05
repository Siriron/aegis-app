import { useState, useEffect, useCallback } from 'react';
import type { WalletState } from './types';
import { CHAIN_ID, CHAIN_ID_HEX, RPC_URL, NETWORK_NAME, CURRENCY } from './config';

function getEthereum() {
  const w = window as unknown as Record<string, unknown>;
  return w['ethereum'] as {
    request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
    on: (event: string, cb: (...args: unknown[]) => void) => void;
    removeListener: (event: string, cb: (...args: unknown[]) => void) => void;
    chainId?: string;
    selectedAddress?: string;
  } | undefined;
}

export function useWallet() {
  const [state, setState] = useState<WalletState>({
    address: null, chainId: null, connected: false, connecting: false, error: null,
  });

  const update = useCallback((patch: Partial<WalletState>) => {
    setState(prev => ({ ...prev, ...patch }));
  }, []);

  // Silent reconnect on mount
  useEffect(() => {
    const eth = getEthereum();
    if (!eth) return;
    void (async () => {
      try {
        const accounts = await eth.request({ method: 'eth_accounts' }) as string[];
        const chainHex = await eth.request({ method: 'eth_chainId' }) as string;
        if (accounts.length) {
          update({ address: accounts[0], chainId: parseInt(chainHex, 16), connected: true });
        }
      } catch { /* silent */ }
    })();

    const onAccounts = (accounts: unknown) => {
      const list = accounts as string[];
      if (list.length) update({ address: list[0], connected: true });
      else update({ address: null, connected: false, chainId: null });
    };
    const onChain = (chainHex: unknown) => {
      update({ chainId: parseInt(chainHex as string, 16) });
    };

    eth.on('accountsChanged', onAccounts);
    eth.on('chainChanged', onChain);
    return () => {
      eth.removeListener('accountsChanged', onAccounts);
      eth.removeListener('chainChanged', onChain);
    };
  }, [update]);

  const connect = useCallback(async () => {
    const eth = getEthereum();
    if (!eth) { update({ error: 'No wallet detected — install MetaMask' }); return; }
    update({ connecting: true, error: null });
    try {
      const accounts = await eth.request({ method: 'eth_requestAccounts' }) as string[];
      const chainHex = await eth.request({ method: 'eth_chainId' }) as string;
      update({ address: accounts[0], chainId: parseInt(chainHex, 16), connected: true, connecting: false });
    } catch (e) {
      update({ error: e instanceof Error ? e.message : 'Connection failed', connecting: false });
    }
  }, [update]);

  const disconnect = useCallback(() => {
    update({ address: null, chainId: null, connected: false });
  }, [update]);

  const switchNetwork = useCallback(async () => {
    const eth = getEthereum();
    if (!eth) return;
    try {
      await eth.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: CHAIN_ID_HEX }] });
    } catch {
      try {
        await eth.request({
          method: 'wallet_addEthereumChain',
          params: [{
            chainId: CHAIN_ID_HEX,
            chainName: NETWORK_NAME,
            rpcUrls: [RPC_URL],
            nativeCurrency: { name: CURRENCY, symbol: CURRENCY, decimals: 18 },
          }],
        });
      } catch (e) {
        update({ error: e instanceof Error ? e.message : 'Network switch failed' });
      }
    }
  }, [update]);

  const isWrongNetwork = state.connected && state.chainId !== CHAIN_ID;

  return { ...state, connect, disconnect, switchNetwork, isWrongNetwork };
}
