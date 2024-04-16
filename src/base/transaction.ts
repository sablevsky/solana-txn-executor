import { TransactionError } from './errors'
import { getLookupTableAccount } from './lookupTables'
import {
  ComputeBudgetProgram,
  Connection,
  PublicKey,
  Signer,
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
export type CreateTxnData<TxnResult> = {
  instructions: TransactionInstruction[]
  signers?: Signer[]
  result?: TxnResult
  lookupTables?: PublicKey[]
}

export type CreateTransactionParams<TxnResult> = {
  createTxnData: CreateTxnData<TxnResult>
  blockhash: string
  payerKey: PublicKey
  connection: Connection
}
export async function createTransaction<TxnResult>({
  createTxnData,
  blockhash,
  payerKey,
  connection,
}: CreateTransactionParams<TxnResult>): Promise<VersionedTransaction> {
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

type GetComputeUnitLimitInstructionParams = {
  connection: Connection
  instructions: TransactionInstruction[]
  payerKey: PublicKey
  lookupTables?: PublicKey[]
  fallbackComputeUnitsAmount?: number
}
export async function getComputeUnitLimitInstruction({
  connection,
  instructions,
  lookupTables,
  payerKey,
  fallbackComputeUnitsAmount = 400_000,
}: GetComputeUnitLimitInstructionParams): Promise<TransactionInstruction> {
  const SIMULATION_CU_LIMIT = 1_400_000
  //? Increase CU by 10% to have a small extra
  const CU_AMOUNT_INCREASE = 1.1

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
  })

  if (simulationValue.err) {
    throw new TransactionError('Transaction simualation failed', simulationValue.logs)
  }

  const units = simulationValue.unitsConsumed ?? fallbackComputeUnitsAmount

  return ComputeBudgetProgram.setComputeUnitLimit({
    units: Math.round(units * CU_AMOUNT_INCREASE),
  })
}

export function getComputeUnitPriceInstruction(priorityFee: number) {
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
