import { DEFAULT_CONFIRMATION_TIMEOT } from '../constants'
import { BlockhashWithExpiryBlockHeight, ExecutorOptions } from '../types'
import { Connection } from '@solana/web3.js'

export type ConfirmTransactionsProps = {
  signatures: string[]
  connection: Connection
  blockhashWithExpiryBlockHeight: BlockhashWithExpiryBlockHeight
  options: ExecutorOptions
  slot: number
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
  slot,
}: ConfirmTransactionsProps) => {
  const results = await Promise.allSettled(
    signatures.map(
      async (signature) =>
        await confirmTransaction({
          signature,
          connection,
          blockhashWithExpiryBlockHeight,
          options,
          slot,
        }),
    ),
  )

  return results.reduce(
    (acc: ConfirmTransactionsResult, result, idx) => {
      const signature = signatures[idx]

      if (result.status === 'rejected') {
        const { reason } = result

        if (typeof reason === 'string') {
          const errorName = getConfirmTransactionErrorFromString(reason)
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

export type ConfirmTransactionProps = {
  signature: string
  connection: Connection
  blockhashWithExpiryBlockHeight: BlockhashWithExpiryBlockHeight
  options: ExecutorOptions
  slot: number
}
const confirmTransaction = async ({
  signature,
  connection,
  blockhashWithExpiryBlockHeight,
  options,
  slot,
}: ConfirmTransactionProps) => {
  const { blockhash, lastValidBlockHeight } = blockhashWithExpiryBlockHeight

  const signal = AbortSignal.timeout(
    (options.confirmOptions.confirmationTimeout ?? DEFAULT_CONFIRMATION_TIMEOT) * 1000,
  )

  const { value } = await connection.confirmTransaction(
    {
      signature,
      lastValidBlockHeight,
      blockhash,
      minContextSlot: slot,
      abortSignal: signal,
    },
    options.confirmOptions.commitment,
  )

  if (value.err) {
    throw new Error(ConfirmTransactionErrorReason.ConfirmationFailed)
  }
}

const getConfirmTransactionErrorFromString = (errorName: string) => {
  return (
    Object.values(ConfirmTransactionErrorReason).find((error) => error === errorName) ??
    ConfirmTransactionErrorReason.ConfirmationFailed
  )
}

export enum ConfirmTransactionErrorReason {
  ConfirmationFailed = 'ConfirmationFailed',
  TimeoutError = 'TimeoutError',
  AbortError = 'AbortError',
}
