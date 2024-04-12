import { confirmTransactionWithPollingFallback } from '../../base'
import {
  BlockhashWithExpiryBlockHeight,
  ConfirmTransactionErrorReason,
  ExecutorOptions,
} from '../types'
import { TimeoutError } from './errors'
import { Connection } from '@solana/web3.js'

export type ConfirmTransactionsProps = {
  signatures: string[]
  resendAbortControllerBySignature: Map<string, AbortController | undefined>
  connection: Connection
  blockhashWithExpiryBlockHeight: BlockhashWithExpiryBlockHeight
  options: ExecutorOptions
}

export type ConfirmTransactionsResult = {
  confirmed: string[]
  failed: { signature: string; reason: ConfirmTransactionErrorReason }[]
}

export const confirmTransactions = async ({
  signatures,
  resendAbortControllerBySignature,
  connection,
  blockhashWithExpiryBlockHeight,
  options,
}: ConfirmTransactionsProps) => {
  const results = await Promise.allSettled(
    signatures.map(async (signature) => {
      const abortConfirmationController = new AbortController()

      await confirmSingleTransaction({
        signature,
        connection,
        blockhashWithExpiryBlockHeight,
        options,
        abortConfirmationController,
      }).finally(() => {
        const resendTransactionAbortController = resendAbortControllerBySignature?.get(signature)
        resendTransactionAbortController?.abort()
        abortConfirmationController.abort()
      })
    }),
  )

  return results.reduce(
    (acc: ConfirmTransactionsResult, result, idx) => {
      const signature = signatures[idx]

      if (result.status === 'rejected') {
        const { reason } = result

        if (reason instanceof Error) {
          const errorName = getConfirmationErrorReason(reason)
          acc.failed.push({ signature, reason: errorName })
        } else {
          acc.failed.push({ signature, reason: ConfirmTransactionErrorReason.ConfirmationFailed })
        }

        return acc
      }

      acc.confirmed.push(signature)
      return acc
    },
    {
      confirmed: [],
      failed: [],
    },
  )
}

type ConfirmTransactionProps = {
  signature: string
  connection: Connection
  blockhashWithExpiryBlockHeight: BlockhashWithExpiryBlockHeight
  options: ExecutorOptions
  abortConfirmationController: AbortController
}
const confirmSingleTransaction = async ({
  signature,
  connection,
  blockhashWithExpiryBlockHeight,
  options,
  abortConfirmationController,
}: ConfirmTransactionProps) => {
  const { confirmationTimeout, commitment, pollingSignatureInterval } = options.confirmOptions

  if (confirmationTimeout) {
    setTimeout(() => {
      if (!abortConfirmationController.signal.aborted) {
        abortConfirmationController.abort()
        throw new TimeoutError('ConfirmTransactionTimeout')
      }
    }, confirmationTimeout * 1000)
  }

  await confirmTransactionWithPollingFallback({
    signature,
    connection,
    pollingSignatureInterval,
    abortSignal: abortConfirmationController.signal,
    commitment,
    blockhashWithExpiryBlockHeight,
  })
}

const getConfirmationErrorReason = (reason: Error) => {
  if (reason instanceof TimeoutError) return ConfirmTransactionErrorReason.TimeoutError

  const errorName = reason.name
  return (
    Object.values(ConfirmTransactionErrorReason).find((error) => error === errorName) ??
    ConfirmTransactionErrorReason.ConfirmationFailed
  )
}
