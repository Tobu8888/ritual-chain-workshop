"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  useWriteContract,
  useWaitForTransactionReceipt,
  useAccount,
  useSwitchChain,
} from "wagmi";
import type { Abi, Address, TransactionReceipt } from "viem";

/**
 * Structural shape of a contract write. Kept deliberately simple: wagmi's exact
 * mutate-params type is a large discriminated union that infers poorly when
 * forwarded through a wrapper, so we accept this and cast once at the boundary.
 */
type WriteParams = {
  address: Address;
  abi: Abi | readonly unknown[];
  functionName: string;
  args?: readonly unknown[];
  value?: bigint;
  chainId?: number;
  gas?: bigint;
  gasPrice?: bigint;
  maxFeePerGas?: bigint;
  maxPriorityFeePerGas?: bigint;
};

type WagmiWriteParams = Parameters<ReturnType<typeof useWriteContract>["writeContractAsync"]>[0];

/**
 * Ritual chain fee floor. Its base fee sits at ~7 wei while the RPC's suggested
 * priority fee (1 gwei) dwarfs it, so wallets can't render a fee and show
 * "network fee unavailable" (and may fall back to a bad gas guess). Supplying
 * explicit EIP-1559 fees on every write makes wallets show a real fee and mine
 * reliably. Values match hardhat/scripts LOWGAS, proven on chain 1979.
 */
const RITUAL_MAX_FEE_PER_GAS = 50_000_000n; // 0.05 gwei
const RITUAL_MAX_PRIORITY_FEE_PER_GAS = 1_000_000n; // 0.001 gwei

export type TxState =
  | "idle"
  | "wallet" // waiting for the user to confirm in their wallet
  | "pending" // submitted, waiting for on-chain confirmation
  | "confirmed"
  | "failed";

export type WriteTx = ReturnType<typeof useWriteTx>;

/** Turn an unknown thrown value into a short, human-friendly message. */
function describeError(err: unknown): string {
  if (!err) return "Transaction failed.";
  const anyErr = err as { shortMessage?: string; message?: string };
  const msg = anyErr.shortMessage || anyErr.message || String(err);
  if (/user rejected|denied|rejected the request/i.test(msg)) {
    return "Request rejected in wallet.";
  }
  // Keep it to the first line so we don't dump a stack into the UI.
  return msg.split("\n")[0];
}

/**
 * Wraps wagmi's write + receipt hooks into a single clear state machine:
 * idle → wallet → pending → confirmed | failed.
 *
 * `run(params)` returns the tx hash (or throws). `onConfirmed(receipt)` fires
 * once when the receipt lands — handy for refetching reads or reading logs.
 */
export function useWriteTx(onConfirmed?: (receipt: TransactionReceipt) => void) {
  const {
    data: hash,
    reset: resetWrite,
    isPending: isWalletPending,
    mutateAsync: writeContractAsync,
  } = useWriteContract();

  // Used to auto-switch the wallet to the target chain before sending, so an
  // action button never fails with a raw "wrong chain" error. We read the
  // *connector's* chain (useAccount), not useChainId — the latter can report a
  // configured chain even when the wallet sits on an unconfigured one (e.g. 61999).
  const { chainId: walletChainId } = useAccount();
  const { switchChainAsync } = useSwitchChain();

  const {
    data: receipt,
    isLoading: isConfirming,
    isSuccess: isConfirmed,
    isError: isReceiptError,
    error: receiptError,
  } = useWaitForTransactionReceipt({ hash });

  // Local error from the submit step. The receipt error is derived (below),
  // so we never copy it into state from an effect.
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const notifiedRef = useRef(false);

  // Fire onConfirmed exactly once per confirmation. Calling a callback (not
  // setState) inside the effect keeps render pure and lint-clean.
  useEffect(() => {
    if (isConfirmed && receipt && !notifiedRef.current) {
      notifiedRef.current = true;
      onConfirmed?.(receipt);
    }
  }, [isConfirmed, receipt, onConfirmed]);

  const error =
    submitError ?? (isReceiptError && receiptError ? describeError(receiptError) : null);

  const state: TxState = error
    ? "failed"
    : isConfirmed
      ? "confirmed"
      : isConfirming
        ? "pending"
        : submitting || isWalletPending
          ? "wallet"
          : "idle";

  const run = useCallback(
    async (params: WriteParams) => {
      setSubmitError(null);
      notifiedRef.current = false;
      setSubmitting(true);
      try {
        // If the wallet is on the wrong network, switch it first instead of
        // letting the write fail with a raw chain-mismatch error. When the
        // wallet chain is unknown, switch defensively too.
        if (params.chainId != null && walletChainId !== params.chainId) {
          await switchChainAsync({ chainId: params.chainId });
        }
        // Fill in Ritual's EIP-1559 fees unless the caller set them, so every
        // write (current and future) shows a real fee instead of "unavailable".
        // Explicit `gas` limits from LLM-precompile callers are left untouched.
        const withFees: WriteParams = {
          ...params,
          maxFeePerGas: params.maxFeePerGas ?? RITUAL_MAX_FEE_PER_GAS,
          maxPriorityFeePerGas:
            params.maxPriorityFeePerGas ?? RITUAL_MAX_PRIORITY_FEE_PER_GAS,
        };
        return await writeContractAsync(withFees as WagmiWriteParams);
      } catch (e) {
        setSubmitError(describeError(e));
        throw e;
      } finally {
        setSubmitting(false);
      }
    },
    [writeContractAsync, switchChainAsync, walletChainId],
  );

  const reset = useCallback(() => {
    resetWrite();
    setSubmitError(null);
    notifiedRef.current = false;
    setSubmitting(false);
  }, [resetWrite]);

  return {
    run,
    reset,
    state,
    hash,
    receipt,
    error,
    isBusy: state === "wallet" || state === "pending",
    isConfirmed,
  };
}
