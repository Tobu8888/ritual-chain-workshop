"use client";

import { useQuery } from "@tanstack/react-query";
import { parseAbiItem } from "viem";
import { useAccount, usePublicClient } from "wagmi";
import { contractAddress } from "@/config/contract";
import { ritualChain } from "@/config/wagmi";
import { isAddressEqual, shortenAddress } from "@/lib/format";
import { Card, CardHeader, CardBody, Notice, Spinner } from "@/components/ui";

// The contract emits this on every bounty payout (autonomous or manual).
const LEADERBOARD_EVENT = parseAbiItem(
  "event LeaderboardUpdated(address indexed winner, uint256 totalWins)",
);

// RPC caps getLogs at ~100k blocks; stay safely under. The contract is recent,
// so a single window covers its full history.
const WINDOW = 90_000n;

type Row = { winner: `0x${string}`; wins: bigint };

/**
 * Cross-bounty "Arena" leaderboard: aggregates LeaderboardUpdated logs into
 * total wins per address. This is the differentiator's payoff — wins accrue
 * across every bounty the AI has settled.
 */
export function Leaderboard() {
  const { address } = useAccount();
  const publicClient = usePublicClient({ chainId: ritualChain.id });

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["leaderboard", contractAddress],
    enabled: Boolean(contractAddress && publicClient),
    refetchInterval: 15_000,
    queryFn: async (): Promise<Row[]> => {
      const head = await publicClient!.getBlockNumber();
      const fromBlock = head > WINDOW ? head - WINDOW : 0n;
      const logs = await publicClient!.getLogs({
        address: contractAddress!,
        event: LEADERBOARD_EVENT,
        fromBlock,
        toBlock: head,
      });
      // Logs are chain-ordered; the last value seen per winner is the latest total.
      const totals = new Map<string, bigint>();
      for (const log of logs) {
        const winner = log.args.winner;
        const total = log.args.totalWins;
        if (winner !== undefined && total !== undefined) {
          totals.set(winner.toLowerCase(), total);
        }
      }
      return [...totals.entries()]
        .map(([winner, wins]) => ({ winner: winner as `0x${string}`, wins }))
        .sort((a, b) => (b.wins > a.wins ? 1 : b.wins < a.wins ? -1 : 0))
        .slice(0, 10);
    },
  });

  if (!contractAddress) return null;

  return (
    <Card>
      <CardHeader
        title="Arena leaderboard"
        subtitle="Total bounties won per address, across the whole arena."
      />
      <CardBody>
        {isLoading ? (
          <div className="flex items-center gap-2 text-sm text-zinc-400">
            <Spinner /> Loading leaderboard…
          </div>
        ) : isError ? (
          <Notice tone="red">
            Couldn&apos;t load leaderboard.{" "}
            {(error as Error)?.message?.slice(0, 120)}
          </Notice>
        ) : !data || data.length === 0 ? (
          <p className="text-sm text-zinc-500">
            No winners yet. Be the first — create a bounty and let the AI settle it.
          </p>
        ) : (
          <ol className="space-y-1.5">
            {data.map((row, i) => {
              const you = isAddressEqual(address, row.winner);
              return (
                <li
                  key={row.winner}
                  className={`flex items-center justify-between rounded-lg px-3 py-2 text-sm ring-1 ring-inset ${
                    you
                      ? "bg-emerald-500/10 ring-emerald-400/30"
                      : "bg-white/5 ring-white/10"
                  }`}
                >
                  <span className="flex items-center gap-3">
                    <span className="w-5 text-right font-mono text-zinc-500">
                      {i + 1}
                    </span>
                    <span className="font-mono">
                      {shortenAddress(row.winner, 5)}
                    </span>
                    {you && (
                      <span className="rounded-full bg-emerald-400/20 px-2 py-0.5 text-[10px] font-semibold text-emerald-300">
                        you
                      </span>
                    )}
                  </span>
                  <span className="font-semibold">
                    {row.wins.toString()}
                    <span className="ml-1 text-xs font-normal text-zinc-500">
                      win{row.wins === 1n ? "" : "s"}
                    </span>
                  </span>
                </li>
              );
            })}
          </ol>
        )}
      </CardBody>
    </Card>
  );
}
