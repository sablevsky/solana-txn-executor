import { sendTransactionWithResendInterval } from '../../base'
import { wait } from '../../utils'
import { ExecutorOptionsBase } from '../types'
import { sendTransactionBanx } from './sendTransactionBanx'
import { Connection, SendOptions, VersionedTransaction } from '@solana/web3.js'
import { uniqueId } from 'lodash'

export type SendTransactions = (params: {
  transactions: VersionedTransaction[]
  connection: Connection
  minContextSlot: number
  blockhash: string
  lastValidBlockHeight: number
  options: ExecutorOptionsBase
}) => Promise<{ signature: string; resendAbortController?: AbortController }[]>

export const sendTransactions: SendTransactions = async ({
  transactions,
  connection,
  options,
  blockhash,
  lastValidBlockHeight,
  minContextSlot,
}) => {
  return await (options.debug?.preventSending ? sendTransactionsMock : sendTransactionsParallel)({
    transactions,
    connection,
    minContextSlot,
    blockhash,
    lastValidBlockHeight,
    options,
  })
}

const sendTransactionsParallel: SendTransactions = async ({
  transactions,
  connection,
  minContextSlot,
  blockhash,
  lastValidBlockHeight,
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
      const resendAbortController = new AbortController()

      if (resendOptions) {
        //? Use promise because setTimeout are executed in the main loop, outside the body of code that originated them.
        wait(resendOptions.timeout * 1000).then(() => {
          if (!resendAbortController.signal.aborted) {
            resendAbortController.abort()
          }
        })
      }

      sendTransactionBanx({
        transaction: txn,
        blockhash,
        lastValidBlockHeight,
        preflightCommitment: sendOptions.preflightCommitment,
        minContextSlot,
        skipPreflight: sendOptions.skipPreflight,
        commitment: options.confirmOptions.commitment,
      })

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
