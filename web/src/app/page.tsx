"use client";

import { useCallback, useEffect, useState } from "react";
import { WalletConnect } from "@/components/WalletConnect";
import { CreateBountyForm } from "@/components/CreateBountyForm";
import { LoadBountyPanel } from "@/components/LoadBountyPanel";
import { BountyView } from "@/components/BountyView";
import { Leaderboard } from "@/components/Leaderboard";
import { HowItWorks } from "@/components/HowItWorks";
import { Roadmap } from "@/components/Roadmap";
import { useRecentBounties } from "@/hooks/useRecentBounties";
import { isContractConfigured, contractAddress } from "@/config/contract";
import { ritualChain } from "@/config/wagmi";
import { shortenAddress } from "@/lib/format";
import { Notice } from "@/components/ui";

export default function Home() {
  const [selectedId, setSelectedId] = useState<bigint | null>(null);
  const { ids, add } = useRecentBounties();

  // Track any opened bounty in the recent list too. `add` is a no-op when the
  // id is already most-recent, so this won't loop.
  useEffect(() => {
    if (selectedId !== null) add(selectedId);
  }, [selectedId, add]);

  const handleCreated = useCallback(
    (id: bigint) => {
      add(id);
      setSelectedId(id);
    },
    [add],
  );

  return (
    <div className="min-h-full">
      {/* Top nav */}
      <header className="sticky top-0 z-10 border-b border-white/10 bg-black/70 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3 sm:px-6">
          <div className="flex items-center gap-2.5">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/abj-logo.png"
              alt="AI Bounty Judge"
              className="h-9 w-9 rounded-[9px] shadow-[0_0_16px_rgba(136,64,255,0.45)]"
            />
            <div>
              <h1 className="mono-label text-sm font-semibold leading-tight">AI BOUNTY JUDGE</h1>
              <p className="text-[11px] leading-tight text-zinc-500">on {ritualChain.name}</p>
            </div>
          </div>
          <WalletConnect />
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
        {/* Hero / explanation */}
        <section className="mb-6">
          <p className="mono-label mb-2 text-xs text-glow-green">
            ◆ RITUAL // AI-JUDGED ARENA
          </p>
          <h2 className="neon-heading text-3xl font-semibold tracking-tight sm:text-4xl">
            AI judges your bounty — and pays the winner itself.
          </h2>
          <p className="mt-3 max-w-2xl text-sm text-zinc-400">
            Create a bounty, collect answers, then let Ritual&apos;s on-chain AI pick the winner and
            release the reward in a single transaction. No human referee — the contract acts on the
            AI&apos;s verdict directly.
          </p>
          <div className="mt-4 flex flex-wrap gap-2 text-xs">
            <span className="rounded-full bg-[#40ffaf]/10 px-3 py-1 text-[#40ffaf] ring-1 ring-inset ring-[#40ffaf]/40">
              AI picks the winner on-chain — trustlessly
            </span>
            <span className="rounded-full bg-[#8840ff]/10 px-3 py-1 text-[#c4a0ff] ring-1 ring-inset ring-[#8840ff]/40">
              Winner paid automatically in the same tx
            </span>
            <span className="rounded-full bg-[#00c2ff]/10 px-3 py-1 text-[#5ad6ff] ring-1 ring-inset ring-[#00c2ff]/40">
              Front-running blocked via commit-reveal
            </span>
          </div>
        </section>

        {/* Plain-language explainer */}
        <section className="mb-6">
          <HowItWorks />
        </section>

        {!isContractConfigured && (
          <div className="mb-6">
            <Notice tone="amber">
              No contract address configured. Copy <code className="font-mono">.env.example</code>{" "}
              to <code className="font-mono">.env.local</code> and set{" "}
              <code className="font-mono">NEXT_PUBLIC_CONTRACT_ADDRESS</code> to start interacting
              on-chain.
            </Notice>
          </div>
        )}

        {/* Dashboard: create + load */}
        <section className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <CreateBountyForm onCreated={handleCreated} />
          <LoadBountyPanel selectedId={selectedId} onSelect={setSelectedId} recentIds={ids} />
        </section>

        {/* Cross-bounty Arena leaderboard */}
        <section className="mt-6">
          <Leaderboard />
        </section>

        {/* Selected bounty */}
        {selectedId !== null && (
          <section className="mt-6">
            <BountyView bountyId={selectedId} />
          </section>
        )}

        {/* Forward-looking roadmap */}
        <section className="mt-6">
          <Roadmap />
        </section>

        <footer className="mt-10 border-t border-white/10 pt-4 text-xs text-zinc-600">
          {contractAddress ? (
            <>
              Contract <span className="font-mono">{shortenAddress(contractAddress, 6)}</span> ·
              Chain {ritualChain.id}
            </>
          ) : (
            <>Workshop demo · {ritualChain.name}</>
          )}
        </footer>
      </main>
    </div>
  );
}
