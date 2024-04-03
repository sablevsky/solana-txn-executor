import { ExecutorOptions } from '../types'
import { Connection, VersionedTransaction } from '@solana/web3.js'
import { uniqueId } from 'lodash'

export type SendTransactionsProps = {
  transactions: VersionedTransaction[]
  connection: Connection
  options: ExecutorOptions
}

export const sendTransactions = async ({
  transactions,
  connection,
  options,
}: SendTransactionsProps) => {
  if (options.debug.preventSending) {
    return await sendTransactionsMock({
      transactions,
      connection,
      options,
    })
  }

  if (options.sequentialSendingDelay) {
    return await sendTransactionsSequential({
      transactions,
      connection,
      options,
    })
  }

  return await sendTransactionsParallel({
    transactions,
    connection,
    options,
  })
}

const sendTransactionsSequential = async ({
  transactions,
  connection,
  options,
}: SendTransactionsProps) => {
  const signatures: string[] = []

  for (let i = 0; i < transactions.length; ++i) {
    const hash = await connection.sendRawTransaction(transactions[i].serialize(), {
      skipPreflight: options.confirmOptions.skipPreflight,
      preflightCommitment: options.confirmOptions.preflightCommitment,
      maxRetries: options.confirmOptions.maxRetries,
      minContextSlot: options.confirmOptions.minContextSlot,
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
}: SendTransactionsProps) => {
  const signatures = await Promise.all(
    transactions.map(
      async (txn) =>
        await connection.sendRawTransaction(txn.serialize(), {
          skipPreflight: options.confirmOptions.skipPreflight,
          preflightCommitment: options.confirmOptions.preflightCommitment,
          maxRetries: options.confirmOptions.maxRetries,
          minContextSlot: options.confirmOptions.minContextSlot,
        }),
    ),
  )
  return signatures
}

const sendTransactionsMock = async ({ transactions }: SendTransactionsProps) => {
  const signatures = transactions.map(() => uniqueId('mockTxnSignature_'))
  return await Promise.resolve(signatures)
}
