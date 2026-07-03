import { decodeAbiParameters, parseAbiParameters, hexToString } from "viem";

export type RankingEntry = {
  index: number;
  score: number;
  reason: string;
};

export type JudgeResult = {
  winnerIndex: number;
  ranking: RankingEntry[];
  summary: string;
};

export type DecodedAiReview = {
  /** Human-readable text of the AI verdict (the model's `content`). */
  raw: string;
  /** Parsed judge result, or null if the bytes weren't parseable. */
  parsed: JudgeResult | null;
};

const EMPTY_BYTES = new Set(["", "0x"]);

/**
 * Decode the on-chain `aiReview` bytes into text and a parsed judge result.
 *
 * The contract stores the LLM precompile's raw `CompletionData` (an ABI blob),
 * not plain text. We ABI-decode it down to the assistant `content` string —
 * which is shaped `WINNER: <index>\n<reason>` — and read the winner + reason
 * out of that. If the bytes aren't CompletionData (e.g. an older deployment
 * that stored a UTF-8 JSON result), we fall back to the JSON path.
 */
export function decodeAiReview(aiReviewHex?: string): DecodedAiReview | null {
  if (!aiReviewHex || EMPTY_BYTES.has(aiReviewHex)) return null;

  // Preferred path: aiReview is the raw CompletionData ABI blob.
  const content = decodeCompletionContent(aiReviewHex as `0x${string}`);
  if (content !== null) {
    const winnerIndex = parseWinnerIndex(content);
    return {
      raw: content,
      parsed:
        winnerIndex === null
          ? null
          : { winnerIndex, ranking: [], summary: stripWinnerLine(content) },
    };
  }

  // Fallback: older deployments stored a UTF-8 JSON judge result.
  let raw: string;
  try {
    raw = hexToString(aiReviewHex as `0x${string}`);
  } catch {
    raw = aiReviewHex;
  }
  return { raw, parsed: tryParseJudgeResult(raw) };
}

/**
 * ABI-decode the LLM `CompletionData` down to the assistant message content.
 * Layout mirrors the contract's `_decodeContent`:
 *   top: (string id, string object, uint created, string model, string sysFp,
 *         string svcTier, uint choicesCount, bytes[] choicesData, bytes usage)
 *   choicesData[0]: (uint index, string finishReason, bytes messageData)
 *   messageData:    (string role, string content, string refusal,
 *                    uint toolCallsCount, bytes[] toolCallsData)
 * Returns null when the bytes aren't a CompletionData blob.
 */
function decodeCompletionContent(hex: `0x${string}`): string | null {
  try {
    const top = decodeAbiParameters(
      parseAbiParameters(
        "string, string, uint256, string, string, string, uint256, bytes[], bytes",
      ),
      hex,
    );
    const choicesData = top[7] as readonly `0x${string}`[];
    if (!choicesData || choicesData.length === 0) return null;

    const choice = decodeAbiParameters(
      parseAbiParameters("uint256, string, bytes"),
      choicesData[0],
    );
    const messageData = choice[2] as `0x${string}`;

    const message = decodeAbiParameters(
      parseAbiParameters("string, string, string, uint256, bytes[]"),
      messageData,
    );
    return message[1] as string;
  } catch {
    return null;
  }
}

/**
 * Read the winner index out of the verdict text. Mirrors the contract's
 * `_parseFirstUint` (first run of digits) but prefers an explicit `WINNER:`
 * marker when present.
 */
function parseWinnerIndex(text: string): number | null {
  const marked = text.match(/WINNER:\s*(\d+)/i);
  if (marked) return Number(marked[1]);
  const first = text.match(/\d+/);
  return first ? Number(first[0]) : null;
}

/** Drop the leading `WINNER: <n>` line, leaving the reasoning as the summary. */
function stripWinnerLine(text: string): string {
  return text.replace(/^\s*WINNER:\s*\d+\s*/i, "").trim();
}

function tryParseJudgeResult(text: string): JudgeResult | null {
  const candidate = extractJson(text);
  if (!candidate) return null;

  let obj: unknown;
  try {
    obj = JSON.parse(candidate);
  } catch {
    return null;
  }

  if (!obj || typeof obj !== "object") return null;
  const o = obj as Record<string, unknown>;

  if (typeof o.winnerIndex !== "number") return null;

  const ranking: RankingEntry[] = Array.isArray(o.ranking)
    ? (o.ranking as unknown[])
        .map((r) => {
          if (!r || typeof r !== "object") return null;
          const e = r as Record<string, unknown>;
          return {
            index: typeof e.index === "number" ? e.index : Number(e.index),
            score: typeof e.score === "number" ? e.score : Number(e.score),
            reason: typeof e.reason === "string" ? e.reason : String(e.reason ?? ""),
          } satisfies RankingEntry;
        })
        .filter((r): r is RankingEntry => r !== null)
    : [];

  return {
    winnerIndex: o.winnerIndex,
    ranking,
    summary: typeof o.summary === "string" ? o.summary : "",
  };
}

/** Strip markdown fences and isolate the first {...} block. */
function extractJson(text: string): string | null {
  let t = text.trim();
  // Remove ```json ... ``` fences if present.
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) t = fence[1].trim();

  const start = t.indexOf("{");
  const end = t.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return null;
  return t.slice(start, end + 1);
}
