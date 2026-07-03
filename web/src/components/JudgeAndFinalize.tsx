"use client";

import { useAccount } from "wagmi";
import aiJudgeAbi from "@/abi/AIJudge";
import { contractAddress, executorAddress } from "@/config/contract";
import { ritualChain } from "@/config/wagmi";
import type { Bounty } from "@/lib/bounty";
import { useWriteTx } from "@/hooks/useWriteTx";
import { useRitualWalletStatus } from "@/hooks/useRitualWalletStatus";
import { RitualWalletPanel } from "@/components/RitualWalletPanel";
import { Card, CardHeader, CardBody, Button, TxStatus, Notice } from "@/components/ui";

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

  // The connected wallet pays the LLM fee from its prepaid+locked RitualWallet.
  const walletStatus = useRitualWalletStatus(address);

  const count = Number(bounty.submissionCount);

  // Gate: owner only, has submissions, not yet judged/finalized.
  if (!isOwner || bounty.judged || bounty.finalized || count === 0) {
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
          override the choice.
        </Notice>

        <RitualWalletPanel status={walletStatus} onDeposited={walletStatus.refetch} />

        <Button onClick={handleJudgeAndFinalize} disabled={busy || !fundingReady} className="w-full">
          {tx.isBusy
            ? "AI judging & paying…"
            : !fundingReady
              ? "Fund RitualWallet to judge"
              : `AI judge & pay winner (${count})`}
        </Button>
        <TxStatus state={tx.state} error={tx.error} hash={tx.hash} explorerBase={explorerBase} />
      </CardBody>
    </Card>
  );
}
