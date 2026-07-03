// PROVE createBounty works via the exact frontend path (no explicit gas limit,
// LOWGAS fees, value>0) on the flagship contract the live site uses.
import { createPublicClient, createWalletClient, defineChain, http, parseEther, parseAbi, decodeEventLog } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
const RPC='https://rpc.ritualfoundation.org';
const AIJUDGE='0x5C850fdD7F50C9cE2b6E66B5adFE9632395bC71f';
const LOWGAS={maxFeePerGas:50_000_000n,maxPriorityFeePerGas:1_000_000n};
const chain=defineChain({id:1979,name:'Ritual Chain',nativeCurrency:{name:'RITUAL',symbol:'RITUAL',decimals:18},rpcUrls:{default:{http:[RPC]}}});
const account=privateKeyToAccount(process.env.PRIVATE_KEY);
const pub=createPublicClient({chain,transport:http()});
const wallet=createWalletClient({account,chain,transport:http()});
const abi=parseAbi([
  'function nextBountyId() view returns (uint256)',
  'function createBounty(string title, string rubric, uint256 deadline) payable returns (uint256)',
  'event BountyCreated(uint256 indexed bountyId, address indexed owner, string title, uint256 reward, uint256 deadline)',
]);
console.log('account:', account.address);
console.log('balance:', (await pub.getBalance({address:account.address})).toString(), 'wei');
console.log('nextBountyId before:', (await pub.readContract({address:AIJUDGE,abi,functionName:'nextBountyId'})).toString());
const deadline=BigInt(Math.floor(Date.now()/1000)+86400);
const hash=await wallet.writeContract({address:AIJUDGE,abi,functionName:'createBounty',args:['verify: reward-required fix','payout goes to the best answer',deadline],value:parseEther('0.001'),...LOWGAS});
console.log('tx sent:', hash);
const rc=await pub.waitForTransactionReceipt({hash});
console.log('STATUS:', rc.status, '| gasUsed:', rc.gasUsed.toString(), '| block:', rc.blockNumber.toString());
let bountyId=null;
for(const log of rc.logs){ try{ const d=decodeEventLog({abi,data:log.data,topics:log.topics}); if(d.eventName==='BountyCreated') bountyId=d.args.bountyId; }catch{} }
console.log('bountyId:', bountyId?.toString());
console.log('nextBountyId after:', (await pub.readContract({address:AIJUDGE,abi,functionName:'nextBountyId'})).toString());
