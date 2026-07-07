"use client";

import { useEffect, useState } from "react";
import { useAccount, usePublicClient } from "wagmi";
import { ritualChain } from "@/config/wagmi";

/**
 * True while the connected wallet has a transaction sitting in the mempool that
 * hasn't been mined yet — detected by comparing the *pending* nonce to the
 * *latest* (mined) nonce on chain.
 *
 * Write buttons already disable themselves via `tx.isBusy`, but that state
 * lives in the component and resets on page reload. So refreshing mid-send
 * re-enables the button, and a second click reserves the *next* nonce behind
 * the first — every later tx then queues behind the still-unconfirmed one and
 * the wallet gridlocks (exactly the "submit ซ้ำๆ ถี่ๆ" pile-up we hit).
 *
 * Reading the nonce gap from chain closes that hole: it survives reloads and is
 * shared across every tab and button. Once the pending tx mines (or is dropped
 * from the mempool), the gap clears on the next poll and writes re-enable.
 */
export function usePendingTx(pollMs = 4000): { hasPending: boolean } {
  const { address } = useAccount();
  const publicClient = usePublicClient({ chainId: ritualChain.id });
  const [hasPending, setHasPending] = useState(false);

  useEffect(() => {
    // Nothing to poll while disconnected. We don't reset state here (calling
    // setState synchronously in an effect is discouraged); the return value is
    // masked to `false` below whenever there's no account.
    if (!address || !publicClient) return;
    // Capture the narrowed values: TS re-widens the outer consts inside a
    // closure invoked later (via setInterval), so pin them here.
    const account = address;
    const client = publicClient;
    let cancelled = false;

    async function check() {
      try {
        const [pending, latest] = await Promise.all([
          client.getTransactionCount({ address: account, blockTag: "pending" }),
          client.getTransactionCount({ address: account, blockTag: "latest" }),
        ]);
        if (!cancelled) setHasPending(pending > latest);
      } catch {
        // Transient RPC hiccup — leave the last known value rather than
        // flipping the guard on/off from a single failed read.
      }
    }

    check();
    const id = setInterval(check, pollMs);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [address, publicClient, pollMs]);

  // Mask to false while disconnected so a stale `true` from a previous account
  // can't linger after the wallet disconnects.
  return { hasPending: Boolean(address && publicClient) && hasPending };
}
