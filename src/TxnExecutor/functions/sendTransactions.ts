import { sendTransactionWithResendInterval } from '../../base'
import { ExecutorOptionsBase } from '../types'
import { TimeoutError } from './errors'
import { Connection, SendOptions, VersionedTransaction } from '@solana/web3.js'
import { uniqueId } from 'lodash'

export type SendTransactions = (params: {
  transactions: VersionedTransaction[]
  connection: Connection
  minContextSlot: number
  options: ExecutorOptionsBase
}) => Promise<{ signature: string; resendAbortController?: AbortController }[]>

export const sendTransactions: SendTransactions = async ({
  transactions,
  connection,
  options,
  minContextSlot,
}) => {
  return await (options.debug?.preventSending ? sendTransactionsMock : sendTransactionsParallel)({
    transactions,
    connection,
    minContextSlot,
    options,
  })
}

const sendTransactionsParallel: SendTransactions = async ({
  transactions,
  connection,
  minContextSlot,
  options,
}) => {
  const { sendOptions } = options

  const resendOptions =
    sendOptions.resendInterval && sendOptions.resendTimeout
      ? {
          timeout: sendOptions.resendTimeout,
          interval: sendOptions.resendInterval,
        }
      : undefined

  const sendTxnOptions: SendOptions = {
    maxRetries: sendOptions.maxRetries,
    minContextSlot,
    preflightCommitment: sendOptions.preflightCommitment,
    skipPreflight: sendOptions.skipPreflight,
  }

  const signaturesAndAbortContollers = await Promise.all(
    transactions.map(async (txn) => {
      // sendTransactionBanx({
      //   transaction: txn,
      //   blockhash: blockhashWithExpiryBlockHeight.blockhash,
      //   lastValidBlockHeight: blockhashWithExpiryBlockHeight.lastValidBlockHeight,
      //   preflightCommitment: options.confirmOptions.preflightCommitment,
      //   minContextSlot,
      //   skipPreflight: options.confirmOptions.skipPreflight,
      //   commitment: options.confirmOptions.commitment,
      // })

      const resendAbortController = new AbortController()

      if (resendOptions) {
        setTimeout(() => {
          if (!resendAbortController.signal.aborted) {
            resendAbortController.abort()
            throw new TimeoutError('ResendTimeoutError')
          }
        }, resendOptions.timeout * 1000)
      }

      const signature = await sendTransactionWithResendInterval({
        transaction: txn,
        connection,
        resendOptions: resendOptions
          ? {
              abortSignal: resendAbortController.signal,
              interval: resendOptions.interval,
            }
          : undefined,
        sendOptions: sendTxnOptions,
      })

      return { signature, resendAbortController: resendOptions ? resendAbortController : undefined }
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
