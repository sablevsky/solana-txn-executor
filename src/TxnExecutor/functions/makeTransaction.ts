import {
  CreateTransactionParams,
  SimulatedAccountInfoByPubkey,
  createTransaction,
  getComputeUnitLimitInstruction,
  getComputeUnitPriceInstruction,
  simulateTransaction,
} from '../../base'
import { GetPriorityFee } from '../types'
import { VersionedTransaction } from '@solana/web3.js'

type MakeTransactionParams = CreateTransactionParams & {
  getPriorityFee: GetPriorityFee
}

type MakeTransactionResult = {
  transaction: VersionedTransaction
  accountInfoByPubkey?: SimulatedAccountInfoByPubkey
}

export async function makeTransaction({
  createTxnData,
  blockhash,
  payerKey,
  connection,
  getPriorityFee,
}: MakeTransactionParams): Promise<MakeTransactionResult> {
  const { instructions, signers, lookupTables, accounts } = createTxnData

  const simulationResult = await simulateTransaction({
    connection,
    instructions,
    lookupTables,
    payerKey,
    accounts,
  })

  const computeUnitLimitIxn = getComputeUnitLimitInstruction(simulationResult.unitsConsumed)

  const priorityFee = await getPriorityFee({ txnParams: createTxnData, connection })

  const computeUnitPriceIxn = getComputeUnitPriceInstruction(priorityFee)

  const transaction = await createTransaction({
    createTxnData: {
      instructions: [computeUnitLimitIxn, computeUnitPriceIxn, ...instructions],
      lookupTables,
      signers,
      accounts,
    },
    blockhash,
    payerKey,
    connection,
  })

  return { transaction, accountInfoByPubkey: simulationResult.accountInfoByPubkey }
}
