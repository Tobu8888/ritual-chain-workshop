"use client";

import { useState } from "react";
import { useAccount } from "wagmi";
import { useNow } from "@/hooks/useNow";
import aiJudgeAbi from "@/abi/AIJudge";
import { contractAddress } from "@/config/contract";
import { ritualChain } from "@/config/wagmi";
import { canSubmit, type Bounty } from "@/lib/bounty";
import { useWriteTx } from "@/hooks/useWriteTx";
import { usePendingTx } from "@/hooks/usePendingTx";
import {
  Card,
  CardHeader,
  CardBody,
  Field,
  Textarea,
  Button,
  TxStatus,
  Notice,
  PendingTxNotice,
} from "@/components/ui";

const explorerBase = ritualChain.blockExplorers?.default.url;

export function SubmitAnswer({
  bountyId,
  bounty,
  isOwner,
  onSubmitted,
}: {
  bountyId: bigint;
  bounty: Bounty;
  isOwner: boolean;
  onSubmitted: () => void;
}) {
  const { isConnected } = useAccount();
  const { hasPending } = usePendingTx();
  const [answer, setAnswer] = useState("");
  const now = useNow();
  const tx = useWriteTx(() => {
    setAnswer("");
    onSubmitted();
  });

  // Submission window closed — nothing to show.
  if (!canSubmit(bounty, now / 1000)) return null;

  // Anti-Sybil: the sponsor cannot answer their own bounty (the contract also
  // reverts this). Show why instead of a form that would fail on submit.
  if (isOwner) {
    return (
      <Card>
        <CardHeader
          title="Submit an answer"
          subtitle="Open until the deadline. One entry, judged against the rubric."
        />
        <CardBody>
          <Notice tone="amber">
            You created this bounty, so you can&apos;t submit an answer to it.
            This keeps a sponsor from entering — and auto-winning — their own
            reward. Share it so others can compete.
          </Notice>
        </CardBody>
      </Card>
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!answer.trim() || !contractAddress) return;
    try {
      await tx.run({
        address: contractAddress,
        abi: aiJudgeAbi,
        functionName: "submitAnswer",
        args: [bountyId, answer.trim()],
        chainId: ritualChain.id,
      });
    } catch {
      /* surfaced via tx.state */
    }
  }

  return (
    <Card>
      <CardHeader
        title="Submit an answer"
        subtitle="Open until the deadline. One entry, judged against the rubric."
      />
      <CardBody>
        <form onSubmit={handleSubmit} className="space-y-3">
          <Field label="Your answer">
            <Textarea
              value={answer}
              onChange={(e) => setAnswer(e.target.value)}
              rows={5}
              placeholder="Write your submission…"
            />
          </Field>
          <Button
            type="submit"
            disabled={!isConnected || !answer.trim() || tx.isBusy || hasPending}
            className="w-full"
          >
            {tx.isBusy ? "Submitting…" : "Submit answer"}
          </Button>
          <PendingTxNotice show={hasPending && !tx.isBusy} />
          {!isConnected && (
            <p className="text-xs text-zinc-500">
              Connect your wallet to submit.
            </p>
          )}
          <TxStatus
            state={tx.state}
            error={tx.error}
            hash={tx.hash}
            explorerBase={explorerBase}
          />
        </form>
      </CardBody>
    </Card>
  );
}
