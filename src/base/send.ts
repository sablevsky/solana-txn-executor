import { wait } from '../utils'
import {
  Connection,
  SendOptions,
  SendTransactionError,
  VersionedTransaction,
} from '@solana/web3.js'

/**
 * Used to resend transactions repeatedly at a specified interval
 * Throws SendTransactionError if something goes wrong
 */
type ResendTransactionWithInterval = (params: {
  transaction: VersionedTransaction
  connection: Connection
  /**
   * Required because it is the only way to stop the loop if there were no errors
   */
  abortSignal: AbortSignal
  /**
   * Resend interval in seconds
   */
  resendInterval: number
  sendOptions?: SendOptions
}) => Promise<void>
export const resendTransactionWithInterval: ResendTransactionWithInterval = async ({
  transaction,
  resendInterval,
  connection,
  abortSignal,
  sendOptions,
}) => {
  while (!abortSignal.aborted) {
    await wait(resendInterval * 1000)
    try {
      await connection.sendTransaction(transaction, sendOptions)
    } catch (error) {
      throw new SendTransactionError('ResendTransactionError')
    }
  }
}

/**
 * Send transaction with resend functionality
 * Throws SendTransactionError if something goes wrong
 */
type SendTransactionWithResendInterval = (params: {
  transaction: VersionedTransaction
  connection: Connection
  sendOptions?: SendOptions
  /**
   * Resend params
   * If undefined send transaction only once
   */
  resendOptions?: {
    /**
     * Required because it is the only way to stop the resend loop
     */
    abortSignal: AbortSignal
    /**
     * Resend transactions interval in seconds
     */
    interval: number
  }
}) => Promise<string>
export const sendTransactionWithResendInterval: SendTransactionWithResendInterval = async ({
  transaction,
  connection,
  sendOptions,
  resendOptions,
}) => {
  const signature = await connection.sendTransaction(transaction, sendOptions)

  //? Prevent using resendTransactionWithInterval if resendOptions is undefined
  if (resendOptions) {
    resendTransactionWithInterval({
      transaction,
      connection,
      abortSignal: resendOptions.abortSignal,
      sendOptions,
      resendInterval: resendOptions.interval,
    })
  }

  return signature
}
