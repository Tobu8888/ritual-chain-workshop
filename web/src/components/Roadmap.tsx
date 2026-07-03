"use client";

import type { ReactNode } from "react";
import { Card, CardHeader, CardBody, Badge } from "@/components/ui";

/**
 * Forward-looking roadmap so the app reads as a living project, not a one-off
 * demo. Three honest buckets: what already works on-chain, what's next, and the
 * longer-term direction (the judge as a reusable on-chain-AI primitive).
 */

type Tone = "green" | "amber" | "zinc";

type Column = {
  tone: Tone;
  label: string;
  items: ReactNode[];
};

const COLUMNS: Column[] = [
  {
    tone: "green",
    label: "✅ Shipped",
    items: [
      "On-chain AI picks the winner and pays out in one transaction",
      "Contract builds the judging prompt itself — no human can bias it",
      "Sealed commit-reveal answers + a cross-bounty win leaderboard",
    ],
  },
  {
    tone: "amber",
    label: "🔜 Next",
    items: [
      "Show each answer's score on-chain (10–50), not just the winner",
      "Anti-Sybil guards: a host can't judge their own entry; require N distinct players",
    ],
  },
  {
    tone: "zinc",
    label: "🧭 Vision",
    items: [
      "Open the judge as a reusable primitive — any contract can ask Ritual's AI to score a subjective decision and act on it (grants, disputes, moderation)",
      "Community bounty seasons run on top of it",
    ],
  },
];

export function Roadmap() {
  return (
    <Card>
      <CardHeader
        title="Roadmap"
        subtitle="Where this is going — it's an active build, not a one-off demo."
      />
      <CardBody>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          {COLUMNS.map((col) => (
            <div key={col.label}>
              <Badge tone={col.tone}>{col.label}</Badge>
              <ul className="mt-3 space-y-2">
                {col.items.map((item, i) => (
                  <li
                    key={i}
                    className="flex gap-2 text-xs leading-relaxed text-zinc-400"
                  >
                    <span aria-hidden className="text-zinc-600">
                      •
                    </span>
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </CardBody>
    </Card>
  );
}
