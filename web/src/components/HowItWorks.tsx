"use client";

import { Fragment, type ReactNode } from "react";
import { Card, CardHeader, CardBody } from "@/components/ui";

/**
 * Plain-language pipeline for a deep app. Four connected steps on a glowing
 * neon rail: a host locks a prize, players submit sealed answers, the on-chain
 * AI scores each, and the top answer is paid automatically. No emoji — the
 * flow reads as a diagram (numbered nodes + rail + a travelling pulse). The
 * score tags stand in for the AI's quality judgment; sealed = commit-reveal.
 */

type Step = {
  n: string;
  label: string;
  title: string;
  body: ReactNode;
  chips?: number[];
  winner?: number;
  bar?: number;
};

const STEPS: Step[] = [
  {
    n: "1",
    label: "CREATE",
    title: "Host locks a prize",
    body: (
      <>
        Post a challenge (question + rubric) and{" "}
        <span className="text-zinc-200">lock the reward on-chain</span>. Only the
        winner can unlock it — not even the host.
      </>
    ),
  },
  {
    n: "2",
    label: "SUBMIT",
    title: "Players answer, sealed",
    body: (
      <>
        Each answer goes in <span className="text-zinc-200">sealed</span>, then is
        revealed later — so no one can copy. It takes{" "}
        <span className="text-zinc-200">≥2 real entries</span>, and the host{" "}
        <span className="text-zinc-200">can&apos;t answer their own bounty</span>.
      </>
    ),
  },
  {
    n: "3",
    label: "AI JUDGE",
    title: "AI scores on-chain",
    body: (
      <>
        Ritual&apos;s <span className="text-zinc-200">on-chain AI</span> rates every
        answer <span className="text-zinc-200">0–100</span> by quality — the best
        must clear a <span className="text-[#40ffaf]">60 bar</span> to win.
      </>
    ),
    chips: [88, 41, 55],
    winner: 88,
    bar: 60,
  },
  {
    n: "4",
    label: "PAYOUT",
    title: "Winner auto-paid",
    body: (
      <>
        The top answer above the bar is{" "}
        <span className="text-zinc-200">paid instantly</span>, same transaction. If
        nothing clears it, the prize is{" "}
        <span className="text-zinc-200">refunded to the host</span> — no weak default
        winner.
      </>
    ),
  },
];

/** Gradient-ring node with the step number + neon glow. */
function Node({ n }: { n: string }) {
  return (
    <div className="rounded-full bg-gradient-to-br from-[#8840ff] via-[#e554e8] to-[#00c2ff] p-[1.5px] shadow-[0_0_16px_rgba(136,64,255,0.45)]">
      <div className="mono-label grid h-9 w-9 place-items-center rounded-full bg-black text-sm font-bold text-white">
        {n}
      </div>
    </div>
  );
}

/** Horizontal connector rail (desktop) with a travelling data pulse + chevron. */
function Rail() {
  return (
    <div className="relative mt-5 hidden h-px w-10 shrink-0 self-start bg-gradient-to-r from-[#8840ff]/70 to-[#00c2ff]/70 md:block">
      <span className="rail-pulse absolute top-1/2 h-1.5 w-1.5 -translate-y-1/2 rounded-full bg-[#00c2ff] shadow-[0_0_8px_#00c2ff]" />
      <span className="absolute -right-1.5 top-1/2 -translate-y-1/2 text-xs text-[#00c2ff]">
        ›
      </span>
    </div>
  );
}

function Chips({
  chips,
  winner,
  bar,
}: {
  chips: number[];
  winner?: number;
  bar?: number;
}) {
  return (
    <div className="mt-3 flex flex-col items-center gap-1">
      <div className="flex items-center justify-center gap-1.5">
        {chips.map((c) => {
          const win = c === winner;
          const below = bar !== undefined && c < bar;
          return (
            <span
              key={c}
              className={`mono-label rounded-md px-1.5 py-0.5 text-[11px] font-semibold ring-1 ring-inset ${
                win
                  ? "animate-winner bg-[#40ffaf]/15 text-[#40ffaf] ring-[#40ffaf]/45"
                  : below
                    ? "bg-white/5 text-zinc-600 ring-white/10 line-through decoration-zinc-600"
                    : "bg-white/5 text-zinc-400 ring-white/10"
              }`}
              title={
                win
                  ? "highest score → wins"
                  : below
                    ? "below the 60 bar"
                    : "cleared the bar, not top"
              }
            >
              {c}
            </span>
          );
        })}
      </div>
      {bar !== undefined && (
        <span className="mono-label text-[10px] tracking-wide text-[#40ffaf]/80">
          pass bar {bar}/100
        </span>
      )}
    </div>
  );
}

function StepBody({ s }: { s: Step }) {
  return (
    <>
      <div className="mono-label text-[11px] tracking-widest text-[#c4a0ff]">
        {s.label}
      </div>
      <h3 className="mt-1 text-sm font-semibold text-zinc-100">{s.title}</h3>
      <p className="mt-1 text-xs leading-relaxed text-zinc-400">{s.body}</p>
      {s.chips && <Chips chips={s.chips} winner={s.winner} bar={s.bar} />}
    </>
  );
}

export function HowItWorks() {
  return (
    <Card>
      <CardHeader
        title="How it works"
        subtitle="It's an answer contest — judged by an AI that can't cheat."
      />
      <CardBody>
        {/* Desktop: horizontal neon pipeline */}
        <div className="hidden items-start md:flex">
          {STEPS.map((s, i) => (
            <Fragment key={s.n}>
              <div className="flex flex-1 flex-col items-center px-3 text-center">
                <Node n={s.n} />
                <div className="mt-3">
                  <StepBody s={s} />
                </div>
              </div>
              {i < STEPS.length - 1 && <Rail />}
            </Fragment>
          ))}
        </div>

        {/* Mobile: vertical timeline */}
        <div className="md:hidden">
          {STEPS.map((s, i) => (
            <div key={s.n} className="flex gap-3">
              <div className="flex flex-col items-center">
                <Node n={s.n} />
                {i < STEPS.length - 1 && (
                  <span className="my-1 w-px flex-1 bg-gradient-to-b from-[#8840ff]/70 to-[#00c2ff]/40" />
                )}
              </div>
              <div className="pb-6 pt-0.5">
                <StepBody s={s} />
              </div>
            </div>
          ))}
        </div>

        {/* Trustless footer — neon rule, no icon */}
        <div className="mt-6 flex items-center gap-3">
          <span className="h-px flex-1 bg-gradient-to-r from-transparent to-[#8840ff]/40" />
          <p className="mono-label text-center text-[11px] tracking-wide text-zinc-400">
            no bribes · no bias · no self-dealing · no weak default winner —{" "}
            <span className="text-[#40ffaf]">it&apos;s on-chain code</span>
          </p>
          <span className="h-px flex-1 bg-gradient-to-l from-transparent to-[#00c2ff]/40" />
        </div>
      </CardBody>
    </Card>
  );
}
