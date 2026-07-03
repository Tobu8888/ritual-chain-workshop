// PROVE end-to-end: AIJudge calls the LLM precompile (0x0802) ON-CHAIN and
// returns an AI verdict, settled in a single tx (short-running async).
//
//   createBounty -> submitAnswer x2 -> judgeAll(llmInput) -> decode aiReview
//
// Reuses the proven patterns from ritual-app/requestSecret.mjs (executor
// discovery, RitualWallet escrow, LOWGAS) + the 30-field LLM tuple and the
// CompletionData decode from ritual-dapp-skills/ritual-dapp-llm SKILL.md.
//
// Run:  node --env-file=.env scripts/prove-judge.mjs
// Env:  PRIVATE_KEY  (tobu = 0xbFBDe16307A44692b9A04e6811182df3e5626999)

import {
  createPublicClient, createWalletClient, defineChain, http,
  parseEther, formatEther, parseAbi, encodeAbiParameters, parseAbiParameters,
  decodeAbiParameters, decodeEventLog,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';

// ---- config ----
const RPC      = process.env.RITUAL_RPC || 'https://rpc.ritualfoundation.org';
const CHAIN_ID = 1979;
const AIJUDGE        = '0x246D9234a1a79a92b8332539E80B2e60a263DB95'; // tobu deploy
const RITUAL_WALLET  = '0x532F0dF0896F353d8C3DD8cc134e8129DA2a3948';
const TEE_REGISTRY   = '0x9644e8562cE0Fe12b4deeC4163c064A8862Bf47F';
const CAPABILITY_LLM = 1;
const MODEL          = 'zai-org/GLM-4.7-FP8';

const ESCROW_MIN = parseEther('0.45'); // LLM needs >= ~0.4 RIT escrow (memory)
const ESCROW_TOP = parseEther('0.4');  // amount to add when topping up
const LOCK_BLOCKS = 100_000n;          // SMALL lock — avoid 96M permanent-lock gotcha
const REWARD = parseEther('0.001');    // recoverable via finalizeWinner

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

// ---- ABIs ----
const judgeAbi = parseAbi([
  'function nextBountyId() view returns (uint256)',
  'function createBounty(string title, string rubric, uint256 deadline) payable returns (uint256)',
  'function submitAnswer(uint256 bountyId, string answer)',
  'function judgeAll(uint256 bountyId, bytes llmInput)',
  'function getBounty(uint256 bountyId) view returns (address owner, string title, string rubric, uint256 reward, uint256 deadline, bool judged, bool finalized, uint256 submissionCount, uint256 winnerIndex, bytes aiReview)',
  'event BountyCreated(uint256 indexed bountyId, address indexed owner, string title, uint256 reward, uint256 deadline)',
  'event AllAnswersJudged(uint256 indexed bountyId, bytes aiReview)',
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

// 30-field LLM request tuple (exact layout from ritual-dapp-llm SKILL.md / LLMConsumer.sol)
const LLM_TUPLE = parseAbiParameters([
  'address, bytes[], uint256, bytes[], bytes,',
  'string, string, int256, string, bool, int256, string, string,',
  'uint256, bool, int256, string, bytes, int256, string, string, bool,',
  'int256, bytes, bytes, int256, int256, string, bool,',
  '(string,string,string)',
].join(''));

function buildLlmInput(executor, messages) {
  return encodeAbiParameters(LLM_TUPLE, [
    executor, [], 300n, [], '0x',
    JSON.stringify(messages),
    MODEL,
    0n, '', false, 4096n, '', '',
    1n, true, 0n, 'medium', '0x', -1n, 'auto', '',
    false,            // stream
    700n, '0x', '0x', -1n, 1000n, '',
    false,            // piiEnabled
    ['', '', ''],     // convoHistory empty = stateless single-turn (LLMConsumer pattern)
  ]);
}

// Decode aiReview (ABI-encoded CompletionData) -> plain text content
function decodeReview(aiReview) {
  const [id, obj, created, model, , , choicesCount, choicesData] =
    decodeAbiParameters(
      parseAbiParameters('string, string, uint256, string, string, string, uint256, bytes[], bytes'),
      aiReview,
    );
  if (choicesCount === 0n || choicesData.length === 0) return null;
  const [, finishReason, messageData] =
    decodeAbiParameters(parseAbiParameters('uint256, string, bytes'), choicesData[0]);
  const [, content] =
    decodeAbiParameters(parseAbiParameters('string, string, string, uint256, bytes[]'), messageData);
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
  console.log(`EOA     : ${account.address}`);
  console.log(`AIJudge : ${AIJUDGE}\n`);

  // 1) discover an active LLM executor
  const services = await pub.readContract({
    address: TEE_REGISTRY, abi: registryAbi,
    functionName: 'getServicesByCapability', args: [CAPABILITY_LLM, true],
  });
  const svc = services.find(s => s.isValid) || services[0];
  if (!svc) throw new Error('no LLM executor (capability 1) registered');
  const executor = svc.node.teeAddress;
  console.log(`Executor: ${executor}  (${services.length} available)\n`);

  // 2) ensure EOA escrow >= ESCROW_MIN with an active lock (fee charged to signer)
  const cur = await pub.getBlockNumber();
  let [bal, lock] = await Promise.all([
    pub.readContract({ address: RITUAL_WALLET, abi: walletAbi, functionName: 'balanceOf', args: [account.address] }),
    pub.readContract({ address: RITUAL_WALLET, abi: walletAbi, functionName: 'lockUntil', args: [account.address] }),
  ]);
  const lockActive = lock >= cur + 500n;
  console.log(`Escrow  : ${formatEther(bal)} RIT  lock ${lockActive ? 'active' : 'WEAK'} @ ${lock} (head ${cur})`);
  if (bal < ESCROW_MIN || !lockActive) {
    console.log(`  topping up +${formatEther(ESCROW_TOP)} RIT, lock +${LOCK_BLOCKS} blocks…`);
    await send('deposit', { address: RITUAL_WALLET, abi: walletAbi, functionName: 'deposit', args: [LOCK_BLOCKS], value: ESCROW_TOP });
  }
  console.log('');

  // 3) createBounty
  const deadline = BigInt(Math.floor(Date.now() / 1000) + 3600);
  console.log('createBounty…');
  const cr = await send('createBounty', {
    address: AIJUDGE, abi: judgeAbi, functionName: 'createBounty',
    args: ['Ritual one-liner', 'Best one-sentence pitch for why on-chain AI matters. Reward clarity + originality.', deadline],
    value: REWARD,
  });
  let bountyId;
  for (const log of cr.logs) {
    try {
      const ev = decodeEventLog({ abi: judgeAbi, data: log.data, topics: log.topics });
      if (ev.eventName === 'BountyCreated') bountyId = ev.args.bountyId;
    } catch {}
  }
  if (bountyId === undefined) throw new Error('no BountyCreated event');
  console.log(`  bountyId = ${bountyId}\n`);

  // 4) two answers
  const answers = [
    'On-chain AI lets contracts make judgment calls no oracle can fake.',
    'It moves trust from the API to the chain, so the verdict is verifiable.',
  ];
  for (let i = 0; i < answers.length; i++) {
    console.log(`submitAnswer #${i}…`);
    await send(`submit#${i}`, { address: AIJUDGE, abi: judgeAbi, functionName: 'submitAnswer', args: [bountyId, answers[i]] });
  }
  console.log('');

  // 5) build judge prompt + judgeAll (LLM precompile runs inside this tx)
  const messages = [
    { role: 'system', content: 'You are a strict, fair judge. You are given a RUBRIC and a numbered list of ANSWERS (0-based). Pick the single best. Reply in plain text: first line exactly "WINNER: <index>", then 1-2 sentences why. No markdown.' },
    { role: 'user', content:
      `RUBRIC:\nBest one-sentence pitch for why on-chain AI matters. Reward clarity + originality.\n\nANSWERS:\n` +
      answers.map((a, i) => `${i}) ${a}`).join('\n') + `\n\nPick the winner.` },
  ];
  const llmInput = buildLlmInput(executor, messages);
  console.log(`judgeAll… (llmInput ${(llmInput.length - 2) / 2} bytes)`);
  await send('judgeAll', { address: AIJUDGE, abi: judgeAbi, functionName: 'judgeAll', args: [bountyId, llmInput], gas: 5_000_000n });
  console.log('');

  // 6) read + decode the on-chain AI verdict
  const b = await pub.readContract({ address: AIJUDGE, abi: judgeAbi, functionName: 'getBounty', args: [bountyId] });
  const aiReview = b[9];
  console.log(`judged=${b[5]}  submissions=${b[7]}  aiReview ${(aiReview.length - 2) / 2} bytes`);
  const v = decodeReview(aiReview);
  if (!v) { console.log('⚠️ could not decode choices (empty?)'); return; }
  console.log(`\n===== ON-CHAIN AI VERDICT (model ${v.model}, finish=${v.finishReason}) =====`);
  console.log(v.content);
  console.log('==============================================================');
}

main().catch((e) => { console.error('\n✗', e.shortMessage || e.message); process.exit(1); });
