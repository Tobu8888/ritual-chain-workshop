// PROVE the AUTONOMOUS path: deploy the upgraded AIJudge, then let the AI's
// on-chain verdict pick the winner AND pay out in a single tx (no human picks
// the winner), and bump the cross-bounty leaderboard.
//
//   deploy -> createBounty -> submitAnswer x2 -> judgeAndFinalize -> read wins
//
// Run:  node --env-file=.env scripts/prove-autonomous.mjs

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
const MODEL          = 'zai-org/GLM-4.7-FP8';
const ESCROW_MIN = parseEther('0.45');
const ESCROW_TOP = parseEther('0.4');
const LOCK_BLOCKS = 100_000n;
const REWARD = parseEther('0.001');
const LOWGAS = { maxFeePerGas: 50_000_000n, maxPriorityFeePerGas: 1_000_000n };

if (!process.env.PRIVATE_KEY) { console.error('missing PRIVATE_KEY'); process.exit(1); }

const chain = defineChain({
  id: CHAIN_ID, name: 'Ritual Chain',
  nativeCurrency: { name: 'RITUAL', symbol: 'RITUAL', decimals: 18 },
  rpcUrls: { default: { http: [RPC] } },
});
const account = privateKeyToAccount(process.env.PRIVATE_KEY);
const pub    = createPublicClient({ chain, transport: http() });
const wallet = createWalletClient({ account, chain, transport: http() });

const artifact = JSON.parse(readFileSync(
  new URL('../artifacts/contracts/AIJudge.sol/AIJudge.json', import.meta.url)));

const judgeAbi = parseAbi([
  'function createBounty(string title, string rubric, uint256 deadline) payable returns (uint256)',
  'function submitAnswer(uint256 bountyId, string answer)',
  'function judgeAndFinalize(uint256 bountyId, address executor)',
  'function getBounty(uint256 bountyId) view returns (address owner, string title, string rubric, uint256 reward, uint256 deadline, bool judged, bool finalized, uint256 submissionCount, uint256 winnerIndex, bytes aiReview)',
  'function getSubmission(uint256 bountyId, uint256 index) view returns (address submitter, string answer)',
  'function wins(address) view returns (uint256)',
  'event BountyCreated(uint256 indexed bountyId, address indexed owner, string title, uint256 reward, uint256 deadline)',
  'event LeaderboardUpdated(address indexed winner, uint256 totalWins)',
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

const LLM_TUPLE = parseAbiParameters([
  'address, bytes[], uint256, bytes[], bytes,',
  'string, string, int256, string, bool, int256, string, string,',
  'uint256, bool, int256, string, bytes, int256, string, string, bool,',
  'int256, bytes, bytes, int256, int256, string, bool,',
  '(string,string,string)',
].join(''));

function buildLlmInput(executor, messages) {
  return encodeAbiParameters(LLM_TUPLE, [
    executor, [], 300n, [], '0x', JSON.stringify(messages), MODEL,
    0n, '', false, 4096n, '', '', 1n, true, 0n, 'medium', '0x', -1n, 'auto', '',
    false, 700n, '0x', '0x', -1n, 1000n, '', false, ['', '', ''],
  ]);
}
function decodeReview(aiReview) {
  const [, , , model, , , choicesCount, choicesData] = decodeAbiParameters(
    parseAbiParameters('string, string, uint256, string, string, string, uint256, bytes[], bytes'), aiReview);
  if (choicesCount === 0n || choicesData.length === 0) return null;
  const [, finishReason, messageData] = decodeAbiParameters(parseAbiParameters('uint256, string, bytes'), choicesData[0]);
  const [, content] = decodeAbiParameters(parseAbiParameters('string, string, string, uint256, bytes[]'), messageData);
  return { model, content, finishReason };
}
async function send(label, req) {
  const hash = await wallet.writeContract({ ...req, ...LOWGAS });
  console.log(`  ${label} tx: ${hash}`);
  const r = await pub.waitForTransactionReceipt({ hash });
  console.log(`  mined block ${r.blockNumber} status=${r.status}`);
  if (r.status !== 'success') throw new Error(`${label} reverted`);
  return r;
}

async function main() {
  console.log(`EOA : ${account.address}\n`);

  // 0) deploy the upgraded AIJudge — or reuse one via AIJUDGE env (RPC nonce-lag
  // throws a spurious error AFTER the deploy actually lands, so we allow reuse).
  let AIJUDGE = process.env.AIJUDGE;
  if (AIJUDGE) {
    console.log(`reusing AIJudge: ${AIJUDGE}\n`);
  } else {
    console.log('deploying AIJudge (autonomous + leaderboard)…');
    const nonce = await pub.getTransactionCount({ address: account.address });
    const dHash = await wallet.deployContract({ abi: judgeAbi, bytecode: artifact.bytecode, args: [], nonce, ...LOWGAS });
    const dRec = await pub.waitForTransactionReceipt({ hash: dHash });
    AIJUDGE = dRec.contractAddress;
    console.log(`  ★ NEW AIJudge: ${AIJUDGE}  (block ${dRec.blockNumber})\n`);
  }

  // 1) LLM executor
  const services = await pub.readContract({ address: TEE_REGISTRY, abi: registryAbi, functionName: 'getServicesByCapability', args: [CAPABILITY_LLM, true] });
  const svc = services.find(s => s.isValid) || services[0];
  if (!svc) throw new Error('no LLM executor');
  const executor = svc.node.teeAddress;
  console.log(`Executor: ${executor}\n`);

  // 2) ensure EOA escrow
  const cur = await pub.getBlockNumber();
  const [bal, lock] = await Promise.all([
    pub.readContract({ address: RITUAL_WALLET, abi: walletAbi, functionName: 'balanceOf', args: [account.address] }),
    pub.readContract({ address: RITUAL_WALLET, abi: walletAbi, functionName: 'lockUntil', args: [account.address] }),
  ]);
  const lockActive = lock >= cur + 500n;
  console.log(`Escrow: ${formatEther(bal)} RIT  lock ${lockActive ? 'active' : 'WEAK'} @ ${lock}`);
  if (bal < ESCROW_MIN || !lockActive) {
    console.log(`  topping up +${formatEther(ESCROW_TOP)} RIT…`);
    await send('deposit', { address: RITUAL_WALLET, abi: walletAbi, functionName: 'deposit', args: [LOCK_BLOCKS], value: ESCROW_TOP });
  }
  console.log('');

  // 3) createBounty
  const rubric = 'Best one-sentence pitch for why on-chain AI matters. Reward clarity + originality.';
  const deadline = BigInt(Math.floor(Date.now() / 1000) + 3600);
  console.log('createBounty…');
  const cr = await send('createBounty', { address: AIJUDGE, abi: judgeAbi, functionName: 'createBounty', args: ['Ritual one-liner', rubric, deadline], value: REWARD });
  let bountyId;
  for (const log of cr.logs) { try { const ev = decodeEventLog({ abi: judgeAbi, data: log.data, topics: log.topics }); if (ev.eventName === 'BountyCreated') bountyId = ev.args.bountyId; } catch {} }
  console.log(`  bountyId = ${bountyId}\n`);

  // 4) two answers (answer 1 is deliberately the stronger one)
  const answers = [
    'AI on a chain is just a faster API call with extra steps.',
    'On-chain AI lets a contract make a judgment no oracle can fake, and pay out on it trustlessly.',
  ];
  for (let i = 0; i < answers.length; i++) {
    console.log(`submitAnswer #${i}…`);
    await send(`submit#${i}`, { address: AIJUDGE, abi: judgeAbi, functionName: 'submitAnswer', args: [bountyId, answers[i]] });
  }
  console.log('');

  // 5) judgeAndFinalize — contract builds the prompt ON-CHAIN from the rubric +
  // answers (owner cannot bias it); AI picks winner + pays, all in this tx.
  console.log(`judgeAndFinalize… (executor ${executor}; prompt built on-chain)`);
  await send('judgeAndFinalize', { address: AIJUDGE, abi: judgeAbi, functionName: 'judgeAndFinalize', args: [bountyId, executor], gas: 15_000_000n });
  console.log('');

  // 6) read results
  const b = await pub.readContract({ address: AIJUDGE, abi: judgeAbi, functionName: 'getBounty', args: [bountyId] });
  const winnerIndex = b[8];
  const [winnerAddr] = await pub.readContract({ address: AIJUDGE, abi: judgeAbi, functionName: 'getSubmission', args: [bountyId, winnerIndex] });
  const winnerWins = await pub.readContract({ address: AIJUDGE, abi: judgeAbi, functionName: 'wins', args: [winnerAddr] });
  const v = decodeReview(b[9]);
  console.log(`finalized=${b[6]}  AI-picked winnerIndex=${winnerIndex}  winner=${winnerAddr}`);
  console.log(`leaderboard wins[winner] = ${winnerWins}`);
  console.log(`\n===== AUTONOMOUS ON-CHAIN VERDICT (model ${v?.model}, finish=${v?.finishReason}) =====`);
  console.log(v?.content);
  console.log('==================================================================');
  console.log(`\n★ NEW flagship AIJudge: ${AIJUDGE}`);
}

main().catch((e) => { console.error('\n✗', e.shortMessage || e.message); process.exit(1); });
