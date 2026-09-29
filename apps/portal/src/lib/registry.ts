import { createPublicClient, http, keccak256, parseAbi, type Address } from 'viem';
import { sepolia } from 'viem/chains';
import type { ProofBundle } from './types';

const ABI = parseAbi([
  'function submittedPeriods() view returns (uint256[])',
  'function getRecord(uint256 periodId) view returns ((uint64 submittedAt, uint64 blockNumber, bool[3] pass, bytes32 statementId, bytes32 commitment, bytes32 proofHash, address submitter))',
  'function periods(uint256) view returns (bytes32 paramsHash, bool pinned)',
]);

export const REGISTRY = (import.meta.env.VITE_REGISTRY_ADDRESS || '') as Address | '';
export const explorer = (addr: string) => `https://sepolia.etherscan.io/address/${addr}`;

export interface OnChainRecord {
  periodId: number;
  submittedAt: number;
  blockNumber: number;
  pass: readonly [boolean, boolean, boolean];
  statementId: `0x${string}`;
  commitment: `0x${string}`;
  proofHash: `0x${string}`;
  submitter: Address;
}

const client = () => createPublicClient({ chain: sepolia, transport: http(import.meta.env.VITE_SEPOLIA_RPC_URL || undefined) });

export async function fetchRecord(periodId: number): Promise<OnChainRecord | null> {
  if (!REGISTRY) return null;
  const c = client();
  const list = await c.readContract({ address: REGISTRY, abi: ABI, functionName: 'submittedPeriods' });
  if (!list.some((p) => Number(p) === periodId)) return null;
  const r = await c.readContract({ address: REGISTRY, abi: ABI, functionName: 'getRecord', args: [BigInt(periodId)] });
  return { periodId, ...r, submittedAt: Number(r.submittedAt), blockNumber: Number(r.blockNumber) };
}

export interface Consistency {
  matches: boolean;
  reasons: string[];
}

/** Compares an on-chain record with a proof bundle the viewer holds. */
export function checkConsistency(rec: OnChainRecord, b: ProofBundle): Consistency {
  const reasons: string[] = [];
  if (rec.proofHash !== keccak256(b.proof)) reasons.push('proof hash differs from the on-chain record');
  if (rec.statementId.toLowerCase() !== b.result.statementId.toLowerCase()) reasons.push('statement id differs');
  b.result.scenarios.forEach((s, i) => {
    if (s.pass !== rec.pass[i]) reasons.push(`${s.name} result differs`);
  });
  return { matches: reasons.length === 0, reasons };
}
