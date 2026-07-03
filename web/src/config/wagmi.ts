import { createConfig, http } from "wagmi";
import { defineChain } from "viem";
import { walletConnect } from "wagmi/connectors";
import { ritualChainId, ritualRpcUrl } from "@/config/contract";

/**
 * Custom Ritual Chain definition. RPC URL and chain id come from env vars so
 * the demo can target a local devnet, a shared testnet, or mainnet.
 */
export const ritualChain = defineChain({
  id: ritualChainId,
  name: "Ritual Chain",
  nativeCurrency: { name: "Ritual", symbol: "RITUAL", decimals: 18 },
  rpcUrls: {
    default: { http: [ritualRpcUrl] },
  },
  blockExplorers: {
    default: { name: "RitualScan", url: "https://explorer.ritualfoundation.org" },
  },
});

const walletConnectProjectId = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID?.trim();

// Browser wallets (OKX, MetaMask, …) are surfaced through EIP-6963 discovery
// (see `multiInjectedProviderDiscovery` below), each as its own named button —
// so we don't add a generic `injected()` catch-all, which grabs whichever
// window.ethereum happens to win and is ambiguous when several wallets are
// installed. WalletConnect is added only when a project id is present (it
// throws without one) as a mobile/QR fallback.
const connectors = walletConnectProjectId
  ? [walletConnect({ projectId: walletConnectProjectId })]
  : [];

export const config = createConfig({
  chains: [ritualChain],
  connectors,
  // Discover injected wallets via EIP-6963 so each appears as a distinct
  // connector (OKX Wallet, MetaMask, …) instead of one opaque "Injected".
  multiInjectedProviderDiscovery: true,
  ssr: true,
  transports: {
    [ritualChain.id]: http(ritualRpcUrl),
  },
});

declare module "wagmi" {
  interface Register {
    config: typeof config;
  }
}
