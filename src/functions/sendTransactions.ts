import { sendTransactionWithResendInterval } from '../base'
import { ExecutorOptions } from '../types'
// import { sendTransactionBanx } from './sendTransactionBanx'
import { Connection, VersionedTransaction } from '@solana/web3.js'
import { uniqueId } from 'lodash'

export type SendTransactions = (params: {
  transactions: VersionedTransaction[]
  connection: Connection
  options: ExecutorOptions
  slot: number
  resendInterval?: number
}) => Promise<{ signature: string; resendAbortController?: AbortController }[]>

export const sendTransactions: SendTransactions = async ({
  transactions,
  connection,
  options,
  slot,
  resendInterval,
}) => {
  return await (options.debug.preventSending ? sendTransactionsMock : sendTransactionsParallel)({
    transactions,
    connection,
    options,
    slot,
    resendInterval,
  })
}

const sendTransactionsParallel: SendTransactions = async ({
  transactions,
  connection,
  options,
  slot,
  resendInterval,
}) => {
  const signaturesAndAbortContollers = await Promise.all(
    transactions.map(async (txn) => {
      // sendTransactionBanx({
      //   transaction: txn,
      //   blockhash: blockhashWithExpiryBlockHeight.blockhash,
      //   lastValidBlockHeight: blockhashWithExpiryBlockHeight.lastValidBlockHeight,
      //   preflightCommitment: options.confirmOptions.preflightCommitment,
      //   minContextSlot: slot,
      //   skipPreflight: options.confirmOptions.skipPreflight,
      //   commitment: options.confirmOptions.commitment,
      // })

      return await sendTransactionWithResendInterval({
        transaction: txn,
        connection,
        resendInterval, //TODO Add resendInterva
        sendOptions: {
          maxRetries: options.confirmOptions.maxRetries,
          minContextSlot: slot,
          preflightCommitment: options.confirmOptions.preflightCommitment,
          skipPreflight: options.confirmOptions.skipPreflight,
        },
      })
    }),
  )
  return signaturesAndAbortContollers
}

const sendTransactionsMock: SendTransactions = async ({ transactions }) => {
  return await Promise.resolve(
    transactions.map(() => ({
      signature: uniqueId('mockTxnSignature_'),
      resendAbortController: new AbortController(),
    })),
  )
}
