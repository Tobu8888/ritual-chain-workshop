# Privacy-Preserving AI Bounty Judge — Commit-Reveal Extension

## What this does

Extends the base `AIJudge` contract with a **commit-reveal scheme** that prevents front-running — a critical issue when answers are submitted on a public mempool.

Without commit-reveal, anyone watching the mempool can copy a good answer and submit it with higher gas before the original submitter, stealing the bounty reward. This extension seals answers cryptographically before the reveal window opens.

## How commit-reveal works

```
Phase 1 — Commit
  commitment = keccak256(abi.encodePacked(answer, salt, msg.sender, bountyId))
  submitCommitment(bountyId, commitment)
  → answer stays hidden on-chain, only hash is stored

Phase 2 — Reveal
  revealAnswer(bountyId, answer, salt)
  → contract re-computes hash and verifies against stored commitment
  → if match: answer accepted into submissions[]
  → if mismatch: revert "commitment mismatch"
```

Including `msg.sender` and `bountyId` in the hash prevents:
- **Replay attacks** — same commitment reused across bounties
- **Identity theft** — copied commitment submitted by different address

## Contract functions

| Function | Description |
|---|---|
| `createBounty(title, rubric, deadline)` | Create bounty + lock ETH reward |
| `submitCommitment(bountyId, bytes32)` | Phase 1: commit answer hash |
| `revealAnswer(bountyId, answer, salt)` | Phase 2: reveal + verify answer |
| `submitAnswer(bountyId, answer)` | Original open submission (no commit-reveal) |
| `judgeAll(bountyId, llmInput)` | Send all answers to LLM precompile 0x0802 for judgment |
| `finalizeWinner(bountyId, winnerIndex)` | Lock winner + transfer reward |
| `getBounty(bountyId)` | Read bounty state |
| `getSubmission(bountyId, index)` | Read individual submission |

## Architecture

```
Submitter                    AIJudge Contract              Ritual TEE (LLM 0x0802)
    |                              |                                |
    |-- submitCommitment() ------> |                                |
    |   (hash only, answer hidden) |                                |
    |                              |                                |
    |-- revealAnswer(answer,salt)  |                                |
    |   contract verifies hash --> |                                |
    |   answer accepted ---------->|                                |
    |                              |                                |
owner|-- judgeAll(llmInput) ------>|-- call precompile 0x0802 ----> |
    |                              |<-- LLM review (single tx) -----|
    |                              |                                |
owner|-- finalizeWinner(idx) ----->|-- transfer ETH reward -------> winner
```

LLM judgment runs inside a **Trusted Execution Environment (TEE)** — the AI evaluation is tamper-proof and happens in a single transaction without an oracle or off-chain backend.

## Why TEE matters here

Traditional on-chain AI judgment requires an oracle: contract → event → off-chain node → AI provider → tx back. Each hop adds latency and a trust assumption.

Ritual's LLM precompile (0x0802, model `zai-org/GLM-4.7-FP8`, 64K context) collapses this to one synchronous call inside `judgeAll()`. The contract calls the TEE directly — no oracle node, no off-chain hop.

## Generating a commitment (off-chain)

```typescript
import { keccak256, encodePacked, parseEther } from "viem";

const answer = "My answer text";
const salt = keccak256(toBytes(crypto.randomUUID())); // random bytes32
const commitment = keccak256(
  encodePacked(
    ["string", "bytes32", "address", "uint256"],
    [answer, salt, submitterAddress, bountyId]
  )
);

// Phase 1
await contract.write.submitCommitment([bountyId, commitment]);

// Phase 2 (after commit window)
await contract.write.revealAnswer([bountyId, answer, salt]);
```

## Deploy to Ritual Chain

```shell
cd hardhat
pnpm install
npx hardhat ignition deploy ignition/modules/AIJudge.ts --network ritual
```

Network config (hardhat.config.ts):
```
chainId: 1979
rpc: https://rpc.ritualfoundation.org
```

## Run tests

```shell
npx hardhat test
```
