import { TransactionError } from './errors'
import { getLookupTableAccount } from './lookupTables'
import {
  ComputeBudgetProgram,
  Connection,
  PublicKey,
  Signer,
  SimulatedTransactionAccountInfo,
  TransactionInstruction,
  TransactionMessage,
  VersionedTransaction,
} from '@solana/web3.js'
import { chain, concat, flatMap, map } from 'lodash'

/**
 * Data needed to create a transaction
 * Consists of instructions, signers (optional),
 * lookup tables (optional)
 * and result (additional data to be returned with the
 * transaction result. F.e. for an optimistic response) (optional)
 */
export type CreateTxnData = {
  instructions: TransactionInstruction[]
  signers?: Signer[]
  accounts?: PublicKey[]
  lookupTables?: PublicKey[]
}

export type CreateTransactionParams = {
  createTxnData: CreateTxnData
  blockhash: string
  payerKey: PublicKey
  connection: Connection
}
export async function createTransaction({
  createTxnData,
  blockhash,
  payerKey,
  connection,
}: CreateTransactionParams): Promise<VersionedTransaction> {
  const { instructions, signers, lookupTables } = createTxnData

  const lookupTableAccountsResponses = await Promise.all(
    (lookupTables ?? []).map((lt) => getLookupTableAccount(lt, connection)),
  )

  const lookupTableAccounts = chain(lookupTableAccountsResponses)
    .map(({ value }) => value)
    .compact()
    .value()

  const transaction = new VersionedTransaction(
    new TransactionMessage({
      payerKey,
      recentBlockhash: blockhash,
      instructions: instructions,
    }).compileToV0Message(lookupTableAccounts),
  )

  if (signers?.length) {
    transaction.sign(signers)
  }

  return transaction
}

type SimulateTransactionParams = CreateTxnData & {
  connection: Connection
  payerKey: PublicKey
}
export type SimulatedAccountInfoByPubkey = Record<string, SimulatedTransactionAccountInfo | null>
type SimulateTransactionResult = {
  accountInfoByPubkey?: SimulatedAccountInfoByPubkey
  unitsConsumed: number
}
export async function simulateTransaction({
  connection,
  instructions,
  lookupTables,
  payerKey,
  accounts,
}: SimulateTransactionParams): Promise<SimulateTransactionResult> {
  const SIMULATION_CU_LIMIT = 1_400_000
  const FALLBACK_COMPUTE_UNITS_AMOUNT = 400_000

  const simulationInstructions = [
    ComputeBudgetProgram.setComputeUnitLimit({ units: SIMULATION_CU_LIMIT }),
    ...instructions,
  ]

  const lookupTableAccountsResponses = await Promise.all(
    (lookupTables ?? []).map((lt) => getLookupTableAccount(lt, connection)),
  )

  const lookupTableAccounts = chain(lookupTableAccountsResponses)
    .map(({ value }) => value)
    .compact()
    .value()

  const transaction = new VersionedTransaction(
    new TransactionMessage({
      instructions: simulationInstructions,
      payerKey: payerKey,
      recentBlockhash: PublicKey.default.toString(),
    }).compileToV0Message(lookupTableAccounts),
  )

  const { value: simulationValue } = await connection.simulateTransaction(transaction, {
    replaceRecentBlockhash: true,
    sigVerify: false,
    accounts: accounts
      ? { addresses: accounts?.map((acc) => acc.toBase58()), encoding: 'base64' }
      : undefined,
  })

  if (simulationValue.err) {
    throw new TransactionError('Transaction simualation failed', simulationValue.logs)
  }

  const accountInfoByPubkey: SimulatedAccountInfoByPubkey | undefined =
    accounts &&
    chain(accounts)
      .map((account, idx) => [account, simulationValue.accounts?.[idx] ?? null])
      .fromPairs()
      .value()

  return {
    accountInfoByPubkey,
    unitsConsumed: simulationValue.unitsConsumed ?? FALLBACK_COMPUTE_UNITS_AMOUNT,
  }
}

export function getComputeUnitLimitInstruction(unitsConsumed: number): TransactionInstruction {
  //? Increase CU by 10% to have a small extra
  const CU_AMOUNT_INCREASE = 1.1

  return ComputeBudgetProgram.setComputeUnitLimit({
    units: Math.round(unitsConsumed * CU_AMOUNT_INCREASE),
  })
}

export function getComputeUnitPriceInstruction(priorityFee: number): TransactionInstruction {
  return ComputeBudgetProgram.setComputeUnitPrice({
    microLamports: priorityFee,
  })
}

export function extractAccountKeysFromInstructions(
  instructions: TransactionInstruction[],
): PublicKey[] {
  const accountsKeys = flatMap(instructions, (ixn) => map(ixn.keys, (key) => key.pubkey))
  const programIds = map(instructions, (i) => i.programId)

  return concat(accountsKeys, programIds)
}
