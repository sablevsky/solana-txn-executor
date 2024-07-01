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

type MakeTransactionParams<Params> = CreateTransactionParams<Params> & {
  getPriorityFee: GetPriorityFee
}

type MakeTransactionResult<Params> = {
  transaction: VersionedTransaction
  accountInfoByPubkey?: SimulatedAccountInfoByPubkey
  params: Params
}

export async function makeTransaction<Params>({
  createTxnData,
  blockhash,
  payerKey,
  connection,
  getPriorityFee,
}: MakeTransactionParams<Params>): Promise<MakeTransactionResult<Params>> {
  const { instructions, signers, lookupTables, accounts, params } = createTxnData

  const simulationResult = await simulateTransaction({
    connection,
    instructions,
    lookupTables,
    payerKey,
    accounts,
    params,
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
      params,
    },
    blockhash,
    payerKey,
    connection,
  })

  return { transaction, accountInfoByPubkey: simulationResult.accountInfoByPubkey, params }
}
