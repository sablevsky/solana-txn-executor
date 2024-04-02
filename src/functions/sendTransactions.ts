import { ExecutorOptions } from '../types'
import { Connection, VersionedTransaction } from '@solana/web3.js'
import { uniqueId } from 'lodash'

export type SendTransactionsProps = {
  transactions: VersionedTransaction[]
  connection: Connection
  minContextSlot: number
  options: ExecutorOptions
}

export const sendTransactions = async ({
  transactions,
  connection,
  minContextSlot,
  options,
}: SendTransactionsProps) => {
  if (options.debug.preventSending) {
    return await sendTransactionsMock({
      transactions,
      connection,
      minContextSlot,
      options,
    })
  }

  if (options.sequentialSendingDelay) {
    return await sendTransactionsSequential({
      transactions,
      connection,
      minContextSlot,
      options,
    })
  }

  return await sendTransactionsParallel({
    transactions,
    connection,
    minContextSlot,
    options,
  })
}

const sendTransactionsSequential = async ({
  transactions,
  connection,
  minContextSlot,
  options,
}: SendTransactionsProps) => {
  const signatures: string[] = []

  for (let i = 0; i < transactions.length; ++i) {
    const simulateResult = await connection.simulateTransaction(transactions[i], {
      commitment: options.confirmOptions.preflightCommitment,
      minContextSlot,
    })

    if (simulateResult.value.err) {
      throw simulateResult.value.err
    }

    const hash = await connection.sendRawTransaction(transactions[i].serialize(), {
      skipPreflight: options.confirmOptions.skipPreflight,
      preflightCommitment: options.confirmOptions.preflightCommitment,
      maxRetries: options.confirmOptions.maxRetries,
      minContextSlot: minContextSlot,
    })

    signatures.push(hash)

    await new Promise((resolve) => setTimeout(resolve, options.sequentialSendingDelay))
  }

  return signatures
}

const sendTransactionsParallel = async ({
  transactions,
  connection,
  minContextSlot,
  options,
}: SendTransactionsProps) => {
  const signatures = await Promise.all(
    transactions.map(async (txn) => {
      const simulateResult = await connection.simulateTransaction(txn, {
        commitment: options.confirmOptions.preflightCommitment,
        minContextSlot,
      })

      if (simulateResult.value.err) {
        throw simulateResult.value.err
      }

      return await connection.sendRawTransaction(txn.serialize(), {
        skipPreflight: options.confirmOptions.skipPreflight,
        preflightCommitment: options.confirmOptions.preflightCommitment,
        maxRetries: options.confirmOptions.maxRetries,
        minContextSlot: minContextSlot,
      })
    }),
  )
  return signatures
}

const sendTransactionsMock = async ({ transactions }: SendTransactionsProps) => {
  const signatures = transactions.map(() => uniqueId('mockTxnSignature_'))
  return await Promise.resolve(signatures)
}
