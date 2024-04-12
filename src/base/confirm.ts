import { wait } from '../utils'
import { BlockhashWithExpiryBlockHeight, Commitment, Connection } from '@solana/web3.js'

export class ConfirmTransactionError extends Error {
  constructor(message: string) {
    super(message)
  }
}
/**
 * Throws ConfirmTransactionError if something goes wrong
 */
type ConfirmTransactionByPollingSignatureStatus = (params: {
  signature: string
  connection: Connection
  commitment?: Commitment
  /* abortSignal is required because it is the only way to stop the loop if there were no errors  */
  abortSignal: AbortSignal
  /**
   * Polling interval in seconds
   * Default value is 2
   */
  refetchInterval?: number
}) => Promise<string | undefined>
export const confirmTransactionByPollingSignatureStatus: ConfirmTransactionByPollingSignatureStatus =
  async ({ signature, connection, abortSignal, commitment = 'confirmed', refetchInterval = 2 }) => {
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
      throw new ConfirmTransactionError('Unable to determine transaction status')
    }
  }

/**
 * Throws ConfirmTransactionError|TransactionExpiredBlockheightExceededError|TransactionExpiredTimeoutError if something goes wrong
 */
type СonfirmTransactionBlockheightBased = (params: {
  signature: string
  connection: Connection
  blockhashWithExpiryBlockHeight: BlockhashWithExpiryBlockHeight
  abortSignal?: AbortSignal
  commitment?: Commitment
}) => Promise<string>
export const confirmTransactionBlockheightBased: СonfirmTransactionBlockheightBased = async ({
  signature,
  connection,
  blockhashWithExpiryBlockHeight,
  abortSignal,
  commitment,
}) => {
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
    throw new ConfirmTransactionError('Unable to determine transaction status')
  }

  return signature
}

type ConfirmTransaction = (params: {
  signature: string
  connection: Connection
  blockhashWithExpiryBlockHeight: BlockhashWithExpiryBlockHeight
  abortSignal: AbortSignal
  commitment?: Commitment
  pollingSignatureInterval?: number
}) => Promise<string>
export const confirmTransaction: ConfirmTransaction = async ({
  signature,
  connection,
  blockhashWithExpiryBlockHeight,
  abortSignal,
  commitment,
  pollingSignatureInterval,
}) => {
  const res = await Promise.race([
    confirmTransactionBlockheightBased({
      signature,
      abortSignal,
      blockhashWithExpiryBlockHeight,
      connection,
      commitment,
      // lastValidBlockHeight: blockhashWithExpiryBlockHeight.lastValidBlockHeight - 150, //TODO Why?
    }),
    //? in case when web-socket died
    confirmTransactionByPollingSignatureStatus({
      signature,
      connection,
      abortSignal,
      commitment: commitment,
      refetchInterval: pollingSignatureInterval,
    }),
  ])

  if (!res) {
    throw new ConfirmTransactionError('Unable to determine transaction status')
  }

  return res
}
