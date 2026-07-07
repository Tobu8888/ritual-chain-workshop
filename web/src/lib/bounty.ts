import type { Address } from "viem";

/** Parsed shape of the `getBounty` tuple return value. */
export type Bounty = {
  owner: Address;
  title: string;
  rubric: string;
  reward: bigint;
  deadline: bigint;
  judged: boolean;
  finalized: boolean;
  submissionCount: bigint;
  winnerIndex: bigint;
  aiReview: `0x${string}`;
};

/** getBounty returns a positional tuple — map it to a named object. */
export function parseBounty(
  raw: readonly [
    Address,
    string,
    string,
    bigint,
    bigint,
    boolean,
    boolean,
    bigint,
    bigint,
    `0x${string}`,
  ],
): Bounty {
  const [
    owner,
    title,
    rubric,
    reward,
    deadline,
    judged,
    finalized,
    submissionCount,
    winnerIndex,
    aiReview,
  ] = raw;
  return {
    owner,
    title,
    rubric,
    reward,
    deadline,
    judged,
    finalized,
    submissionCount,
    winnerIndex,
    aiReview,
  };
}

export type BountyStatus = "open" | "ready" | "judged" | "finalized";

export function getBountyStatus(b: Bounty, nowSeconds = Date.now() / 1000): BountyStatus {
  if (b.finalized) return "finalized";
  if (b.judged) return "judged";
  const deadlinePassed = Number(b.deadline) <= nowSeconds;
  return deadlinePassed ? "ready" : "open";
}

export const STATUS_META: Record<
  BountyStatus,
  { label: string; tone: "green" | "amber" | "indigo" | "zinc" }
> = {
  open: { label: "Open", tone: "green" },
  ready: { label: "Ready for judging", tone: "amber" },
  judged: { label: "Judged", tone: "indigo" },
  finalized: { label: "Finalized", tone: "zinc" },
};

/** Can a participant still submit an answer? */
export function canSubmit(b: Bounty, nowSeconds = Date.now() / 1000): boolean {
  return !b.judged && !b.finalized && Number(b.deadline) > nowSeconds;
}

/**
 * Sentinel written by the contract when a bounty is finalized with NO winner —
 * i.e. the AI scored the field below MIN_SCORE and the reward was refunded to
 * the sponsor. Mirrors `type(uint256).max` set at createBounty and left as-is.
 */
export const NO_WINNER_INDEX = 2n ** 256n - 1n;

/** Finalized AND a real winner was paid (as opposed to a refund). */
export function hasWinner(b: Bounty): boolean {
  return b.finalized && b.winnerIndex !== NO_WINNER_INDEX;
}

/** Finalized with no winner: the reward was refunded to the sponsor. */
export function isRefunded(b: Bounty): boolean {
  return b.finalized && b.winnerIndex === NO_WINNER_INDEX;
}
