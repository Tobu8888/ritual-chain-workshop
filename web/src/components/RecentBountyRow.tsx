"use client";

import { useBounty } from "@/hooks/useBounty";
import { useNow } from "@/hooks/useNow";
import { getBountyStatus, STATUS_META, type BountyStatus } from "@/lib/bounty";
import { formatReward } from "@/lib/format";

type Tone = "green" | "amber" | "indigo" | "zinc";

// Solid dot + label colours per status tone. Kept local (not the ring/bg
// `Badge` palette) so the status reads as a single coloured cue at a glance.
const DOT: Record<Tone, string> = {
  green: "bg-[#40ffaf] shadow-[0_0_8px_rgba(64,255,175,0.7)]",
  amber: "bg-[#f6be4f] shadow-[0_0_8px_rgba(246,190,79,0.6)]",
  indigo: "bg-[#c4a0ff] shadow-[0_0_8px_rgba(196,160,255,0.6)]",
  zinc: "bg-zinc-500",
};

const LABEL: Record<Tone, string> = {
  green: "text-[#40ffaf]",
  amber: "text-[#f6be4f]",
  indigo: "text-[#c4a0ff]",
  zinc: "text-zinc-400",
};

/**
 * One row in the "Recent" list: turns a bare bounty id into a scannable line —
 * a status dot, the title, `#id · reward · entries`, and the status label — so
 * users recognise which bounty they're reopening instead of guessing a number.
 * Fetches its own bounty (`useBounty`) and shows a skeleton until it resolves.
 */
export function RecentBountyRow({
  id,
  selected,
  onClick,
}: {
  id: string;
  selected: boolean;
  onClick: () => void;
}) {
  const { bounty, isLoading, isError } = useBounty(BigInt(id));
  const now = useNow();

  const status: BountyStatus | null = bounty
    ? getBountyStatus(bounty, now / 1000)
    : null;
  const meta = status ? STATUS_META[status] : null;
  const tone: Tone = meta ? meta.tone : "zinc";

  const entryCount = bounty ? Number(bounty.submissionCount) : 0;
  const loading = isLoading && !bounty;

  return (
    <button
      onClick={onClick}
      className={`group flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors ${
        selected ? "bg-[#8840ff]/15" : "hover:bg-white/5"
      }`}
    >
      <span
        className={`h-2 w-2 shrink-0 rounded-full ${loading ? "bg-white/15" : DOT[tone]}`}
      />

      <span className="min-w-0 flex-1">
        {loading ? (
          <>
            <span className="block h-3.5 w-32 max-w-full animate-pulse rounded bg-white/10" />
            <span className="mt-1.5 block h-2.5 w-24 max-w-full animate-pulse rounded bg-white/5" />
          </>
        ) : (
          <>
            <span className="block truncate text-sm font-medium text-zinc-100">
              {bounty?.title?.trim() || `Bounty #${id}`}
            </span>
            <span className="block truncate text-[11px] text-zinc-500">
              {isError || !bounty
                ? `#${id} · unavailable`
                : `#${id} · ${formatReward(bounty.reward)} · ${entryCount} ${
                    entryCount === 1 ? "entry" : "entries"
                  }`}
            </span>
          </>
        )}
      </span>

      {meta && (
        <span className={`shrink-0 text-[11px] font-medium ${LABEL[tone]}`}>
          {meta.label}
        </span>
      )}
      <span className="shrink-0 text-zinc-600 transition-transform group-hover:translate-x-0.5">
        ›
      </span>
    </button>
  );
}
