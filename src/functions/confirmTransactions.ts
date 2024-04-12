import { confirmTransaction } from '../base'
import {
  BlockhashWithExpiryBlockHeight,
  ConfirmTransactionErrorReason,
  ExecutorOptions,
} from '../types'
import { Connection } from '@solana/web3.js'

export type ConfirmTransactionsProps = {
  signatures: string[]
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
          const errorName = getConfirmTransactionErrorFromString(reason.name)
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
  setTimeout(() => {
    //? Abort in 60 seconds
    // eslint-disable-next-line no-console, no-undef
    console.log('set timeout trigger', abortConfirmationController)
    if (!abortConfirmationController.signal.aborted) {
      abortConfirmationController.abort()
      // eslint-disable-next-line no-console, no-undef
      console.log('set timeout trigger inside if WTF', abortConfirmationController)
      //TODO: Add timeout error here
      throw new Error('Timeout')
    }
  }, 60 * 1000)

  await confirmTransaction({
    signature,
    connection,
    pollingSignatureInterval: 4,
    abortSignal: abortConfirmationController.signal,
    commitment: options.confirmOptions.commitment,
    blockhashWithExpiryBlockHeight,
  })
}

const getConfirmTransactionErrorFromString = (errorName: string) => {
  return (
    Object.values(ConfirmTransactionErrorReason).find((error) => error === errorName) ??
    ConfirmTransactionErrorReason.ConfirmationFailed
  )
}
