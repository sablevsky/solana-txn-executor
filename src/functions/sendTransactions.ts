import { ExecutorOptions } from '../types'
import { Connection, VersionedTransaction } from '@solana/web3.js'
import { uniqueId } from 'lodash'

export type SendTransactionsProps = {
  transactions: VersionedTransaction[]
  connection: Connection
  options: ExecutorOptions
  slot: number
}

export const sendTransactions = async ({
  transactions,
  connection,
  options,
  slot,
}: SendTransactionsProps) => {
  if (options.debug.preventSending) {
    return await sendTransactionsMock({
      transactions,
      connection,
      options,
      slot,
    })
  }

  if (options.sequentialSendingDelay) {
    return await sendTransactionsSequential({
      transactions,
      connection,
      options,
      slot,
    })
  }

  return await sendTransactionsParallel({
    transactions,
    connection,
    options,
    slot,
  })
}

const sendTransactionsSequential = async ({
  transactions,
  connection,
  options,
  slot,
}: SendTransactionsProps) => {
  const signatures: string[] = []

  for (let i = 0; i < transactions.length; ++i) {
    const hash = await connection.sendTransaction(transactions[i], {
      skipPreflight: options.confirmOptions.skipPreflight,
      preflightCommitment: options.confirmOptions.preflightCommitment,
      maxRetries: options.confirmOptions.maxRetries,
      minContextSlot: slot,
    })

    signatures.push(hash)

    await new Promise((resolve) => setTimeout(resolve, options.sequentialSendingDelay))
  }

  return signatures
}

const sendTransactionsParallel = async ({
  transactions,
  connection,
  options,
  slot,
}: SendTransactionsProps) => {
  const signatures = await Promise.all(
    transactions.map(
      async (txn) =>
        await connection.sendTransaction(txn, {
          skipPreflight: options.confirmOptions.skipPreflight,
          preflightCommitment: options.confirmOptions.preflightCommitment,
          maxRetries: options.confirmOptions.maxRetries,
          minContextSlot: slot,
        }),
    ),
  )
  return signatures
}

const sendTransactionsMock = async ({ transactions }: SendTransactionsProps) => {
  const signatures = transactions.map(() => uniqueId('mockTxnSignature_'))
  return await Promise.resolve(signatures)
}
