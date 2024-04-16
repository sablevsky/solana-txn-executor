import { wait } from '../utils'
import { ConfirmTransactionError } from './errors'
import { BlockhashWithExpiryBlockHeight, Commitment, Connection } from '@solana/web3.js'

type ConfirmTransactionByPollingSignatureStatusParams = {
  signature: string
  connection: Connection
  commitment?: Commitment
  /**
   * Required because it is the only way to stop the loop if there were no errors
   */
  abortSignal: AbortSignal
  /**
   * Polling interval in seconds
   */
  refetchInterval: number
}
/**
 * Can be used as fallback when websocket died (in connection.confirmTransaction) or RPC doen't support websockets at all
 * Throws ConfirmTransactionError if something goes wrong
 */
export async function confirmTransactionByPollingSignatureStatus({
  signature,
  connection,
  abortSignal,
  commitment = 'confirmed',
  refetchInterval = 2,
}: ConfirmTransactionByPollingSignatureStatusParams): Promise<string | undefined> {
  try {
    while (!abortSignal.aborted) {
      await wait(refetchInterval * 1000)
      const { value: signatureValue } = await connection.getSignatureStatus(signature, {
        searchTransactionHistory: false,
      })
      if (signatureValue?.confirmationStatus === commitment) {
        return signature
      }
    }
  } catch (error) {
    throw new ConfirmTransactionError('ConfirmTransactionError')
  }
}

type СonfirmTransactionBlockheightBasedParams = {
  signature: string
  connection: Connection
  blockhashWithExpiryBlockHeight: BlockhashWithExpiryBlockHeight
  abortSignal?: AbortSignal
  commitment?: Commitment
}
/**
 * Throws ConfirmTransactionError|TransactionExpiredBlockheightExceededError|TransactionExpiredTimeoutError if something goes wrong
 */
export async function confirmTransactionBlockheightBased({
  signature,
  connection,
  blockhashWithExpiryBlockHeight,
  abortSignal,
  commitment,
}: СonfirmTransactionBlockheightBasedParams): Promise<string> {
  const { value } = await connection.confirmTransaction(
    {
      signature,
      abortSignal,
      blockhash: blockhashWithExpiryBlockHeight.blockhash,
      lastValidBlockHeight: blockhashWithExpiryBlockHeight.lastValidBlockHeight,
    },
    commitment,
  )

  if (value.err) {
    if (value.err instanceof Error) {
      throw value.err
    }
    throw new ConfirmTransactionError('ConfirmTransactionError')
  }

  return signature
}

type ConfirmTransactionWithPollingFallbackParams = {
  signature: string
  connection: Connection
  blockhashWithExpiryBlockHeight: BlockhashWithExpiryBlockHeight
  abortSignal: AbortSignal
  commitment?: Commitment
  pollingSignatureInterval?: number
}
export async function confirmTransactionWithPollingFallback({
  signature,
  connection,
  blockhashWithExpiryBlockHeight,
  abortSignal,
  commitment,
  pollingSignatureInterval,
}: ConfirmTransactionWithPollingFallbackParams): Promise<string> {
  const confirmTransactionBlockheightBasedPromise = confirmTransactionBlockheightBased({
    signature,
    abortSignal,
    blockhashWithExpiryBlockHeight,
    connection,
    commitment,
  })

  //? Prevent using confirmTransactionByPollingSignatureStatus if pollingSignatureInterval is undefined
  const res = pollingSignatureInterval
    ? await Promise.race([
        confirmTransactionBlockheightBasedPromise,
        confirmTransactionByPollingSignatureStatus({
          signature,
          connection,
          abortSignal,
          commitment: commitment,
          refetchInterval: pollingSignatureInterval,
        }),
      ])
    : confirmTransactionBlockheightBasedPromise

  if (!res) {
    throw new ConfirmTransactionError('ConfirmTransactionError')
  }

  return res
}
