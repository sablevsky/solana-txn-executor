import { wait } from '../utils'
import {
  Connection,
  SendOptions,
  SendTransactionError,
  VersionedTransaction,
} from '@solana/web3.js'

type ResendTransactionWithInterval = (params: {
  transaction: VersionedTransaction
  connection: Connection
  signal: AbortSignal
  sendOptions?: SendOptions
  resendInterval?: number
}) => Promise<void>
export const resendTransactionWithInterval: ResendTransactionWithInterval = async ({
  transaction,
  connection,
  signal,
  sendOptions,
  resendInterval = 2,
}) => {
  // eslint-disable-next-line no-console, no-undef
  console.log('start resendTransactionWithInterval')
  while (!signal.aborted) {
    // eslint-disable-next-line no-console, no-undef
    console.log('resendTransactionWithInterval iteration')
    await wait(resendInterval * 1000)
    try {
      await connection.sendTransaction(transaction, sendOptions)
    } catch (error) {
      if (error instanceof SendTransactionError) {
        throw error
      }
      throw new SendTransactionError('ResendTransactionError')
    }
  }
}

type SendTransactionWithResendInterval = (params: {
  transaction: VersionedTransaction
  connection: Connection
  sendOptions?: SendOptions
  resendInterval?: number
}) => Promise<{ signature: string; resendAbortController: AbortController | undefined }>
export const sendTransactionWithResendInterval: SendTransactionWithResendInterval = async ({
  transaction,
  connection,
  sendOptions,
  resendInterval,
}) => {
  // eslint-disable-next-line no-console, no-undef
  console.log('send transaction')
  const signature = await connection.sendTransaction(transaction, sendOptions)

  const resendAbortController = new AbortController()

  if (resendInterval) {
    setTimeout(() => {
      if (!resendAbortController.signal.aborted) {
        //? Abort in 60 seconds
        resendAbortController.abort()
        //TODO: Add timeout error here
        throw new Error('Timeout')
      }
    }, 60 * 1000)

    resendTransactionWithInterval({
      transaction,
      connection,
      signal: resendAbortController.signal,
      sendOptions,
      resendInterval,
    })
  }

  return { signature, resendAbortController: resendInterval ? resendAbortController : undefined }
}
