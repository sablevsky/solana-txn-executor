import {
  CreateTransactionParams,
  createTransaction,
  getComputeUnitLimitInstruction,
  getComputeUnitPriceInstruction,
} from '../../base'
import { VersionedTransaction } from '@solana/web3.js'

/**
 * Data needed to create a transaction
 * Consists of instructions, signers (optional),
 * lookup tables (optional)
 * and \result (additional data to be returned with the
 * transaction result. F.e. for an optimistic response) (optional)
 */

type MakeTransactionParams<TxnResult> = CreateTransactionParams<TxnResult> & {
  priorityFee: number
}

export async function makeTransaction<TxnResult>({
  createTxnData,
  blockhash,
  payerKey,
  connection,
  priorityFee,
}: MakeTransactionParams<TxnResult>): Promise<VersionedTransaction> {
  const { instructions, signers, lookupTables, result } = createTxnData

  const computeUnitLimitIxn = await getComputeUnitLimitInstruction({
    connection,
    instructions,
    payerKey,
    lookupTables,
  })

  const computeUnitPriceIxn = getComputeUnitPriceInstruction(priorityFee)

  const transaction = await createTransaction({
    createTxnData: {
      instructions: [computeUnitLimitIxn, computeUnitPriceIxn, ...instructions],
      lookupTables,
      signers,
      result,
    },
    blockhash,
    payerKey,
    connection,
  })

  return transaction
}
