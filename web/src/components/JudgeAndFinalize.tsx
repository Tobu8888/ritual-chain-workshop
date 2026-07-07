"use client";

import { useAccount } from "wagmi";
import aiJudgeAbi from "@/abi/AIJudge";
import { contractAddress, executorAddress, MIN_SUBMISSIONS, MIN_SCORE } from "@/config/contract";
import { ritualChain } from "@/config/wagmi";
import type { Bounty } from "@/lib/bounty";
import { useWriteTx } from "@/hooks/useWriteTx";
import { usePendingTx } from "@/hooks/usePendingTx";
import { useRitualWalletStatus } from "@/hooks/useRitualWalletStatus";
import { RitualWalletPanel } from "@/components/RitualWalletPanel";
import {
  Card,
  CardHeader,
  CardBody,
  Button,
  TxStatus,
  Notice,
  PendingTxNotice,
} from "@/components/ui";

const explorerBase = ritualChain.blockExplorers?.default.url;

/**
 * AUTONOMOUS + TRUST-MINIMIZED path: one click runs the Ritual LLM on-chain,
 * which both picks the winner AND pays the reward inside the same transaction.
 * The owner triggers it and supplies only the TEE *executor* to route to — the
 * contract builds the judging prompt itself on-chain from the stored rubric and
 * answers, so the owner cannot bias the verdict. The on-chain AI decides.
 */
export function JudgeAndFinalize({
  bountyId,
  bounty,
  isOwner,
  onFinalized,
}: {
  bountyId: bigint;
  bounty: Bounty;
  isOwner: boolean;
  onFinalized: () => void;
}) {
  const { address } = useAccount();
  const tx = useWriteTx(() => onFinalized());
  const { hasPending } = usePendingTx();

  // The connected wallet pays the LLM fee from its prepaid+locked RitualWallet.
  const walletStatus = useRitualWalletStatus(address);

  const count = Number(bounty.submissionCount);
  const enoughEntries = count >= MIN_SUBMISSIONS;

  // Gate: owner only, not yet judged/finalized. (Still shown when there are too
  // few entries — the button is disabled with a reason, so the anti-farming
  // floor is visible in the UI, not just a silent revert.)
  if (!isOwner || bounty.judged || bounty.finalized) {
    return null;
  }

  async function handleJudgeAndFinalize() {
    if (!contractAddress || !walletStatus.ready) return;
    await tx.run({
      address: contractAddress,
      abi: aiJudgeAbi,
      functionName: "judgeAndFinalize",
      args: [bountyId, executorAddress],
      chainId: ritualChain.id,
      // LLM-precompile txs can't be gas-estimated (eth_estimateGas reverts),
      // so wallets fall back to 0.35 × block limit = 70M and the node rejects
      // it. Send the script-proven explicit gas instead (prove-autonomous.mjs).
      gas: 15_000_000n,
    });
  }

  const busy = tx.isBusy;
  const fundingReady = walletStatus.ready === true;

  return (
    <Card>
      <CardHeader
        title="Judge & finalize — autonomously"
        subtitle="One tx: Ritual AI picks the winner on-chain AND pays the reward. No human chooses, no human writes the prompt."
      />
      <CardBody className="space-y-3">
        <Notice tone="green">
          Trustless: the contract builds the judging prompt itself from the stored
          rubric and answers, reads the AI&apos;s on-chain verdict, and pays the
          winner. The owner only routes to a TEE executor — it cannot bias or
          override the choice. The AI must score the best answer ≥ {MIN_SCORE}/100,
          otherwise the reward is refunded to you.
        </Notice>

        {!enoughEntries && (
          <Notice tone="amber">
            Needs at least {MIN_SUBMISSIONS} entries before it can be judged
            (currently {count}). This floor stops a sponsor from auto-winning
            their own bounty with a single answer.
          </Notice>
        )}

        <RitualWalletPanel status={walletStatus} onDeposited={walletStatus.refetch} />

        <Button
          onClick={handleJudgeAndFinalize}
          disabled={busy || !fundingReady || hasPending || !enoughEntries}
          className="w-full"
        >
          {tx.isBusy
            ? "AI judging & paying…"
            : !enoughEntries
              ? `Needs ${MIN_SUBMISSIONS}+ entries to judge (${count})`
              : !fundingReady
                ? "Fund RitualWallet to judge"
                : `AI judge & pay winner (${count})`}
        </Button>
        <PendingTxNotice show={hasPending && !busy} />
        <TxStatus state={tx.state} error={tx.error} hash={tx.hash} explorerBase={explorerBase} />
      </CardBody>
    </Card>
  );
}
