import { confirmTransactionWithPollingFallback } from '../../base'
import { wait } from '../../utils'
import {
  BlockhashWithExpiryBlockHeight,
  ConfirmTransactionErrorReason,
  ExecutorOptionsBase,
} from '../types'
import { Connection } from '@solana/web3.js'

export type ConfirmTransactionsProps = {
  signatures: string[]
  resendAbortControllerBySignature: Map<string, AbortController | undefined>
  connection: Connection
  blockhashWithExpiryBlockHeight: BlockhashWithExpiryBlockHeight
  options: ExecutorOptionsBase
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
      try {
        await confirmSingleTransaction({
          signature,
          connection,
          blockhashWithExpiryBlockHeight,
          options,
          abortConfirmationController,
        })
      } finally {
        const resendTransactionAbortController = resendAbortControllerBySignature?.get(signature)
        resendTransactionAbortController?.abort()
        abortConfirmationController.abort()
      }
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
  options: ExecutorOptionsBase
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

  //? Use promise because setTimeout are executed in the main loop, outside the body of code that originated them.
  //? It is impossible to handle an error using setTimeout
  const abortOnTimeout = async (timeout: number) => {
    await wait(timeout * 1000)
    if (!abortConfirmationController.signal.aborted) {
      abortConfirmationController.abort()
      throw new Error(ConfirmTransactionErrorReason.TimeoutError)
    }
  }

  const confirmTransactionPromise = confirmTransactionWithPollingFallback({
    signature,
    connection,
    pollingSignatureInterval,
    abortSignal: abortConfirmationController.signal,
    commitment,
    blockhashWithExpiryBlockHeight,
  })

  await (confirmationTimeout
    ? Promise.race([confirmTransactionPromise, abortOnTimeout(confirmationTimeout)])
    : confirmTransactionPromise)
}

const getConfirmationErrorReason = (reason: Error) => {
  const message = reason.message
  return (
    Object.values(ConfirmTransactionErrorReason).find((error) => error === message) ??
    ConfirmTransactionErrorReason.ConfirmationFailed
  )
}
