import {
  CreateTransactionParams,
  createTransaction,
  getComputeUnitLimitInstruction,
  getComputeUnitPriceInstruction,
} from '../../base'
import { GetPriorityFee } from '../types'
import { VersionedTransaction } from '@solana/web3.js'

type MakeTransactionParams<TxnResult> = CreateTransactionParams<TxnResult> & {
  getPriorityFee: GetPriorityFee
}

export async function makeTransaction<TxnResult>({
  createTxnData,
  blockhash,
  payerKey,
  connection,
  getPriorityFee,
}: MakeTransactionParams<TxnResult>): Promise<VersionedTransaction> {
  const { instructions, signers, lookupTables, result } = createTxnData

  const computeUnitLimitIxn = await getComputeUnitLimitInstruction({
    connection,
    instructions,
    payerKey,
    lookupTables,
  })

  const priorityFee = await getPriorityFee({ txnParams: createTxnData, connection })

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
