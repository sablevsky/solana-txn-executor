import { ExecutorOptions } from '../types'
import { sendTransactionBanx } from './sendTransactionBanx'
import { BlockhashWithExpiryBlockHeight, Connection, VersionedTransaction } from '@solana/web3.js'
import { uniqueId } from 'lodash'

export type SendTransactionsProps = {
  transactions: VersionedTransaction[]
  connection: Connection
  options: ExecutorOptions
  blockhashWithExpiryBlockHeight: BlockhashWithExpiryBlockHeight
  slot: number
}

export const sendTransactions = async ({
  transactions,
  connection,
  options,
  blockhashWithExpiryBlockHeight,
  slot,
}: SendTransactionsProps) => {
  if (options.debug.preventSending) {
    return await sendTransactionsMock({
      transactions,
      connection,
      options,
      blockhashWithExpiryBlockHeight,
      slot,
    })
  }

  if (options.sequentialSendingDelay) {
    return await sendTransactionsSequential({
      transactions,
      connection,
      options,
      blockhashWithExpiryBlockHeight,
      slot,
    })
  }

  return await sendTransactionsParallel({
    transactions,
    connection,
    options,
    blockhashWithExpiryBlockHeight,
    slot,
  })
}

const sendTransactionsSequential = async ({
  transactions,
  connection,
  options,
  blockhashWithExpiryBlockHeight,
  slot,
}: SendTransactionsProps) => {
  const signatures: string[] = []

  for (let i = 0; i < transactions.length; ++i) {
    sendTransactionBanx({
      transaction: transactions[i],
      blockhash: blockhashWithExpiryBlockHeight.blockhash,
      lastValidBlockHeight: blockhashWithExpiryBlockHeight.lastValidBlockHeight,
      preflightCommitment: options.confirmOptions.preflightCommitment,
      minContextSlot: slot,
      skipPreflight: options.confirmOptions.skipPreflight,
      commitment: options.confirmOptions.commitment,
    })
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
  blockhashWithExpiryBlockHeight,
  slot,
}: SendTransactionsProps) => {
  const signatures = await Promise.all(
    transactions.map(async (txn) => {
      sendTransactionBanx({
        transaction: txn,
        blockhash: blockhashWithExpiryBlockHeight.blockhash,
        lastValidBlockHeight: blockhashWithExpiryBlockHeight.lastValidBlockHeight,
        preflightCommitment: options.confirmOptions.preflightCommitment,
        minContextSlot: slot,
        skipPreflight: options.confirmOptions.skipPreflight,
        commitment: options.confirmOptions.commitment,
      })

      return await connection.sendTransaction(txn, {
        skipPreflight: options.confirmOptions.skipPreflight,
        preflightCommitment: options.confirmOptions.preflightCommitment,
        maxRetries: options.confirmOptions.maxRetries,
        minContextSlot: slot,
      })
    }),
  )
  return signatures
}

const sendTransactionsMock = async ({ transactions }: SendTransactionsProps) => {
  const signatures = transactions.map(() => uniqueId('mockTxnSignature_'))
  return await Promise.resolve(signatures)
}
