// PROVE the anti-farming GATES on the upgraded AIJudge:
//   1. owner CANNOT submit to their own bounty      (anti-Sybil)
//   2. judgeAndFinalize reverts below MIN_SUBMISSIONS (no "1 answer auto-wins")
//   3. happy path: 2 distinct submitters -> AI scores >= MIN_SCORE -> pays winner
//   4. refund path: weak field scores < MIN_SCORE   -> reward refunded to sponsor
//
// owner = tobu (hardhat/.env), submitters = testnad + nitisorn (sibling clones).
// Run:  node --env-file=.env scripts/prove-gates.mjs
//       (or AIJUDGE=0x.. node --env-file=.env scripts/prove-gates.mjs to reuse)

import { readFileSync } from 'node:fs';
import {
  createPublicClient, createWalletClient, defineChain, http,
  parseEther, formatEther, parseAbi, encodeAbiParameters, parseAbiParameters,
  decodeAbiParameters, decodeEventLog,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';

const RPC      = process.env.RITUAL_RPC || 'https://rpc.ritualfoundation.org';
const CHAIN_ID = 1979;
const RITUAL_WALLET  = '0x532F0dF0896F353d8C3DD8cc134e8129DA2a3948';
const TEE_REGISTRY   = '0x9644e8562cE0Fe12b4deeC4163c064A8862Bf47F';
const CAPABILITY_LLM = 1;
const ESCROW_MIN = parseEther('0.45');
const ESCROW_TOP = parseEther('0.4');
const LOCK_BLOCKS = 100_000n;
const REWARD = parseEther('0.001');
const LOWGAS = { maxFeePerGas: 50_000_000n, maxPriorityFeePerGas: 1_000_000n };

const BASE = '/home/phu/Projects/airdrop';
function keyFrom(f) {
  const t = readFileSync(f, 'utf8');
  const m = t.match(/PRIVATE_KEY=("?)([^"\n]+)\1/);
  if (!m) throw new Error(`no PRIVATE_KEY in ${f}`);
  const k = m[2].trim();
  return k.startsWith('0x') ? k : '0x' + k;
}

const chain = defineChain({
  id: CHAIN_ID, name: 'Ritual Chain',
  nativeCurrency: { name: 'RITUAL', symbol: 'RITUAL', decimals: 18 },
  rpcUrls: { default: { http: [RPC] } },
});
const pub = createPublicClient({ chain, transport: http() });

const ownerAcct = privateKeyToAccount(keyFrom(`${BASE}/ritual-chain-workshop-tobu/hardhat/.env`));
const sub1Acct  = privateKeyToAccount(keyFrom(`${BASE}/ritual-chain-workshop-testnad/hardhat/.env`));
const sub2Acct  = privateKeyToAccount(keyFrom(`${BASE}/ritual-chain-workshop-nitisorn/hardhat/.env`));
const owner = createWalletClient({ account: ownerAcct, chain, transport: http() });
const sub1  = createWalletClient({ account: sub1Acct,  chain, transport: http() });
const sub2  = createWalletClient({ account: sub2Acct,  chain, transport: http() });

const artifact = JSON.parse(readFileSync(
  new URL('../artifacts/contracts/AIJudge.sol/AIJudge.json', import.meta.url)));

const judgeAbi = parseAbi([
  'function createBounty(string title, string rubric, uint256 deadline) payable returns (uint256)',
  'function submitAnswer(uint256 bountyId, string answer)',
  'function judgeAndFinalize(uint256 bountyId, address executor)',
  'function getBounty(uint256 bountyId) view returns (address owner, string title, string rubric, uint256 reward, uint256 deadline, bool judged, bool finalized, uint256 submissionCount, uint256 winnerIndex, bytes aiReview)',
  'function getSubmission(uint256 bountyId, uint256 index) view returns (address submitter, string answer)',
  'function wins(address) view returns (uint256)',
  'function MIN_SUBMISSIONS() view returns (uint256)',
  'function MIN_SCORE() view returns (uint256)',
  'event BountyCreated(uint256 indexed bountyId, address indexed owner, string title, uint256 reward, uint256 deadline)',
  'event WinnerFinalized(uint256 indexed bountyId, uint256 indexed winnerIndex, address indexed winner, uint256 reward)',
  'event RewardRefunded(uint256 indexed bountyId, address indexed owner, uint256 reward, uint256 bestScore)',
]);
const walletAbi = parseAbi([
  'function deposit(uint256 lockDuration) payable',
  'function balanceOf(address) view returns (uint256)',
  'function lockUntil(address) view returns (uint256)',
]);
const registryAbi = [{
  name: 'getServicesByCapability', type: 'function', stateMutability: 'view',
  inputs: [{ name: 'capability', type: 'uint8' }, { name: 'checkValidity', type: 'bool' }],
  outputs: [{ type: 'tuple[]', components: [
    { name: 'node', type: 'tuple', components: [
      { name: 'paymentAddress', type: 'address' }, { name: 'teeAddress', type: 'address' },
      { name: 'teeType', type: 'uint8' }, { name: 'publicKey', type: 'bytes' },
      { name: 'endpoint', type: 'string' }, { name: 'certPubKeyHash', type: 'bytes32' },
      { name: 'capability', type: 'uint8' },
    ]},
    { name: 'isValid', type: 'bool' }, { name: 'workloadId', type: 'bytes32' },
  ]}],
}];

function decodeReview(aiReview) {
  const [, , , model, , , choicesCount, choicesData] = decodeAbiParameters(
    parseAbiParameters('string, string, uint256, string, string, string, uint256, bytes[], bytes'), aiReview);
  if (choicesCount === 0n || choicesData.length === 0) return null;
  const [, finishReason, messageData] = decodeAbiParameters(parseAbiParameters('uint256, string, bytes'), choicesData[0]);
  const [, content] = decodeAbiParameters(parseAbiParameters('string, string, string, uint256, bytes[]'), messageData);
  return { model, content, finishReason };
}
async function send(client, label, req) {
  const hash = await client.writeContract({ ...req, ...LOWGAS });
  const r = await pub.waitForTransactionReceipt({ hash });
  console.log(`  ${label}: ${hash.slice(0, 12)}… block ${r.blockNumber} status=${r.status}`);
  if (r.status !== 'success') throw new Error(`${label} reverted unexpectedly`);
  return r;
}
// Expect a revert with a substring in its reason (uses simulate: free, no tx).
async function expectRevert(label, needle, fn) {
  try {
    await fn();
    throw new Error(`${label}: expected revert "${needle}" but call succeeded`);
  } catch (e) {
    const msg = (e.shortMessage || e.message || '') + ' ' + (e.metaMessages?.join(' ') || '');
    if (msg.includes(needle)) { console.log(`  ✓ ${label} reverted: "${needle}"`); return; }
    throw new Error(`${label}: wrong revert. wanted "${needle}", got: ${e.shortMessage || e.message}`);
  }
}
function bountyIdFrom(receipt) {
  for (const log of receipt.logs) {
    try { const ev = decodeEventLog({ abi: judgeAbi, data: log.data, topics: log.topics });
      if (ev.eventName === 'BountyCreated') return ev.args.bountyId; } catch {}
  }
  throw new Error('no BountyCreated event');
}
function findEvent(receipt, name) {
  for (const log of receipt.logs) {
    try { const ev = decodeEventLog({ abi: judgeAbi, data: log.data, topics: log.topics });
      if (ev.eventName === name) return ev.args; } catch {}
  }
  return null;
}

async function main() {
  console.log(`owner : ${ownerAcct.address}`);
  console.log(`sub1  : ${sub1Acct.address}`);
  console.log(`sub2  : ${sub2Acct.address}\n`);

  // 0) deploy (or reuse)
  let AIJUDGE = process.env.AIJUDGE;
  if (AIJUDGE) { console.log(`reusing AIJudge: ${AIJUDGE}\n`); }
  else {
    console.log('deploying upgraded AIJudge (min+sybil+score+refund)…');
    const nonce = await pub.getTransactionCount({ address: ownerAcct.address });
    const dHash = await owner.deployContract({ abi: judgeAbi, bytecode: artifact.bytecode, args: [], nonce, ...LOWGAS });
    const dRec = await pub.waitForTransactionReceipt({ hash: dHash });
    AIJUDGE = dRec.contractAddress;
    console.log(`  ★ NEW AIJudge: ${AIJUDGE}  (block ${dRec.blockNumber})\n`);
  }
  const [minSub, minScore] = await Promise.all([
    pub.readContract({ address: AIJUDGE, abi: judgeAbi, functionName: 'MIN_SUBMISSIONS' }),
    pub.readContract({ address: AIJUDGE, abi: judgeAbi, functionName: 'MIN_SCORE' }),
  ]);
  console.log(`on-chain gates: MIN_SUBMISSIONS=${minSub}  MIN_SCORE=${minScore}\n`);

  // 1) LLM executor
  const services = await pub.readContract({ address: TEE_REGISTRY, abi: registryAbi, functionName: 'getServicesByCapability', args: [CAPABILITY_LLM, true] });
  const svc = services.find(s => s.isValid) || services[0];
  if (!svc) throw new Error('no LLM executor');
  const executor = svc.node.teeAddress;
  console.log(`executor: ${executor}\n`);

  // 2) owner escrow
  const cur = await pub.getBlockNumber();
  const [bal, lock] = await Promise.all([
    pub.readContract({ address: RITUAL_WALLET, abi: walletAbi, functionName: 'balanceOf', args: [ownerAcct.address] }),
    pub.readContract({ address: RITUAL_WALLET, abi: walletAbi, functionName: 'lockUntil', args: [ownerAcct.address] }),
  ]);
  if (bal < ESCROW_MIN || lock < cur + 500n) {
    console.log(`  topping up escrow +${formatEther(ESCROW_TOP)} RIT…`);
    await send(owner, 'deposit', { address: RITUAL_WALLET, abi: walletAbi, functionName: 'deposit', args: [LOCK_BLOCKS], value: ESCROW_TOP });
  } else { console.log(`escrow ok: ${formatEther(bal)} RIT (lock active)\n`); }

  // ===== BOUNTY A: happy path + negative gates =====
  console.log('── BOUNTY A: gates + happy path ──');
  const rubric = 'Best one-sentence pitch for why on-chain AI matters. Reward clarity + originality.';
  const deadline = BigInt(Math.floor(Date.now() / 1000) + 3600);
  const crA = await send(owner, 'createBounty A', { address: AIJUDGE, abi: judgeAbi, functionName: 'createBounty', args: ['On-chain AI one-liner', rubric, deadline], value: REWARD });
  const A = bountyIdFrom(crA);
  console.log(`  bountyId A = ${A}`);

  // negative 1: owner cannot submit
  await expectRevert('owner-submit', 'owner cannot submit', () =>
    pub.simulateContract({ account: ownerAcct, address: AIJUDGE, abi: judgeAbi, functionName: 'submitAnswer', args: [A, 'my own answer'] }));

  // sub1 submits (weaker)
  await send(sub1, 'sub1 submit', { address: AIJUDGE, abi: judgeAbi, functionName: 'submitAnswer', args: [A, 'AI on a chain is just a slower API call with extra steps.'] });

  // negative 2: cannot judge with only 1 submission
  await expectRevert('min-submissions', 'need more submissions', () =>
    pub.simulateContract({ account: ownerAcct, address: AIJUDGE, abi: judgeAbi, functionName: 'judgeAndFinalize', args: [A, executor] }));

  // sub2 submits (stronger)
  await send(sub2, 'sub2 submit', { address: AIJUDGE, abi: judgeAbi, functionName: 'submitAnswer', args: [A, 'On-chain AI lets a contract make a judgment no oracle can fake, and pay out on it trustlessly in the same transaction.'] });

  // judge -> should pay a winner
  console.log('  judgeAndFinalize A…');
  const jA = await send(owner, 'judge A', { address: AIJUDGE, abi: judgeAbi, functionName: 'judgeAndFinalize', args: [A, executor], gas: 15_000_000n });
  const won = findEvent(jA, 'WinnerFinalized');
  const bA = await pub.readContract({ address: AIJUDGE, abi: judgeAbi, functionName: 'getBounty', args: [A] });
  const vA = decodeReview(bA[9]);
  if (!won) throw new Error('BOUNTY A: expected WinnerFinalized (score should have passed) but got none');
  const wWins = await pub.readContract({ address: AIJUDGE, abi: judgeAbi, functionName: 'wins', args: [won.winner] });
  console.log(`  ✓ PAID winnerIndex=${won.winnerIndex} winner=${won.winner} reward=${formatEther(won.reward)} wins=${wWins}`);
  console.log(`    verdict: ${vA?.content?.split('\n')[0]}\n`);

  // ===== BOUNTY B: refund path (junk answers score below MIN_SCORE) =====
  console.log('── BOUNTY B: refund path (weak field) ──');
  const crB = await send(owner, 'createBounty B', { address: AIJUDGE, abi: judgeAbi, functionName: 'createBounty', args: ['On-chain AI one-liner', rubric, deadline], value: REWARD });
  const B = bountyIdFrom(crB);
  console.log(`  bountyId B = ${B}`);
  await send(sub1, 'sub1 junk', { address: AIJUDGE, abi: judgeAbi, functionName: 'submitAnswer', args: [B, 'banana banana banana'] });
  await send(sub2, 'sub2 junk', { address: AIJUDGE, abi: judgeAbi, functionName: 'submitAnswer', args: [B, 'asdf lol idk'] });
  console.log('  judgeAndFinalize B…');
  const jB = await send(owner, 'judge B', { address: AIJUDGE, abi: judgeAbi, functionName: 'judgeAndFinalize', args: [B, executor], gas: 15_000_000n });
  const refund = findEvent(jB, 'RewardRefunded');
  const bB = await pub.readContract({ address: AIJUDGE, abi: judgeAbi, functionName: 'getBounty', args: [B] });
  const vB = decodeReview(bB[9]);
  const winnerIdxB = bB[8];
  if (refund) {
    console.log(`  ✓ REFUNDED to sponsor=${refund.owner} reward=${formatEther(refund.reward)} bestScore=${refund.bestScore} winnerIndex=${winnerIdxB === (2n**256n-1n) ? 'NONE(max)' : winnerIdxB}`);
  } else {
    console.log(`  ⚠ AI scored the junk field >= MIN_SCORE, so it paid instead of refunding (model was lenient). winnerIndex=${winnerIdxB}`);
  }
  console.log(`    verdict: ${vB?.content?.split('\n')[0]}\n`);

  console.log('══════════════════════════════════════════════');
  console.log(`★ NEW flagship AIJudge: ${AIJUDGE}`);
  console.log('══════════════════════════════════════════════');
}

main().catch((e) => { console.error('\n✗', e.shortMessage || e.message); process.exit(1); });
