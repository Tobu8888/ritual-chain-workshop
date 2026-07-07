"use client";

import { useState } from "react";
import { Card, CardHeader, CardBody, Field, Input, Button } from "@/components/ui";
import { RecentBountyRow } from "@/components/RecentBountyRow";

export function LoadBountyPanel({
  selectedId,
  onSelect,
  recentIds,
}: {
  selectedId: bigint | null;
  onSelect: (id: bigint | null) => void;
  recentIds: string[];
}) {
  // `override === null` => show the current selection; typing takes over.
  const [override, setOverride] = useState<string | null>(null);
  const value =
    override ?? (selectedId !== null ? selectedId.toString() : "");

  function load(raw: string) {
    const trimmed = raw.trim();
    if (trimmed === "") {
      onSelect(null);
      return;
    }
    try {
      const id = BigInt(trimmed);
      if (id < 0n) return;
      onSelect(id);
    } catch {
      /* not a number — ignore */
    }
  }

  return (
    <Card>
      <CardHeader
        title="Load a bounty"
        subtitle="Open any bounty by its numeric id."
      />
      <CardBody className="space-y-3">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            load(value);
          }}
          className="flex items-end gap-2"
        >
          <div className="flex-1">
            <Field label="Bounty id">
              <Input
                inputMode="numeric"
                value={value}
                onChange={(e) => setOverride(e.target.value)}
                placeholder="0"
              />
            </Field>
          </div>
          <Button type="submit">Load</Button>
        </form>

        {recentIds.length > 0 && (
          <div>
            <div className="mb-1.5 text-[11px] uppercase tracking-wide text-zinc-500">
              Recent
            </div>
            <div className="divide-y divide-white/10 overflow-hidden rounded-xl border border-white/10 bg-black/20">
              {recentIds.slice(0, 6).map((id) => (
                <RecentBountyRow
                  key={id}
                  id={id}
                  selected={selectedId?.toString() === id}
                  onClick={() => {
                    setOverride(null);
                    load(id);
                  }}
                />
              ))}
            </div>
          </div>
        )}
      </CardBody>
    </Card>
  );
}
