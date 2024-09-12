import { confirmTransactionByPollingSignatureStatus } from '../../base'
import { wait } from '../../utils'
import { ConfirmTransactionErrorReason, ExecutorOptionsBase } from '../types'
import { Connection } from '@solana/web3.js'

export type ConfirmTransactionsProps = {
  signatures: string[]
  resendAbortControllerBySignature: Map<string, AbortController | undefined>
  connection: Connection
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
  options,
}: ConfirmTransactionsProps) => {
  const results = await Promise.allSettled(
    signatures.map(async (signature) => {
      const abortConfirmationController = new AbortController()
      try {
        await confirmSingleTransaction({
          signature,
          connection,
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
  options: ExecutorOptionsBase
  abortConfirmationController: AbortController
}
const confirmSingleTransaction = async ({
  signature,
  connection,
  options,
  abortConfirmationController,
}: ConfirmTransactionProps) => {
  const { confirmationTimeout, pollingSignatureInterval } = options.confirmOptions

  //? Use promise because setTimeout are executed in the main loop, outside the body of code that originated them.
  //? It is impossible to handle an error using setTimeout
  const abortOnTimeout = async (timeout: number) => {
    await wait(timeout * 1000)
    if (!abortConfirmationController.signal.aborted) {
      abortConfirmationController.abort()
      throw new Error(ConfirmTransactionErrorReason.TimeoutError)
    }
  }

  const confirmTransactionPromise = confirmTransactionByPollingSignatureStatus({
    signature,
    connection,
    abortSignal: abortConfirmationController.signal,
    refetchInterval: pollingSignatureInterval ?? 2,
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
