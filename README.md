# AI Bounty Judge — Ritual Chain Workshop (builder fork)

Extends the base workshop contract with a **commit-reveal scheme** to prevent answer front-running.

## What's different here

- `submitCommitment(bountyId, bytes32)` — submitters lock a hash of their answer before revealing
- `revealAnswer(bountyId, answer, salt)` — contract verifies `keccak256(answer + salt + sender + bountyId)` before accepting
- Prevents MEV-style copying: no one can read your answer and clone it before the deadline

## Flow

1. `createBounty(title, rubric, deadline)` — owner locks reward
2. `submitCommitment` — commit phase (answer hidden)
3. `revealAnswer` — reveal phase (hash verified on-chain)
4. `judgeAll(bountyId, llmInput)` — LLM precompile `0x0802` judges all answers in one batched call
5. `finalizeWinner` — reward transferred to winner

## Key insight

LLM inference runs inside a TEE executor — no oracle node, no off-chain hop. Judge flow is fully on-chain.

## Deploy

```bash
cd hardhat && npx hardhat run scripts/deploy.ts --network ritual
```
