import { wait } from '../utils'
import { BlockhashWithExpiryBlockHeight, Commitment, Connection } from '@solana/web3.js'

export class ConfirmTransactionError extends Error {
  constructor(message: string) {
    super(message)
  }
}

type ConfirmTransactionByPollingSignatureStatus = (params: {
  signature: string
  connection: Connection
  abortSignal: AbortSignal
  commitment?: Commitment
  /* Polling interval in seconds */
  refetchInterval?: number
}) => Promise<string | undefined>
export const confirmTransactionByPollingSignatureStatus: ConfirmTransactionByPollingSignatureStatus =
  async ({ signature, connection, abortSignal, commitment = 'confirmed', refetchInterval = 2 }) => {
    // eslint-disable-next-line no-console, no-undef
    console.log('start confirmation by polling', abortSignal)
    try {
      while (!abortSignal.aborted) {
        // eslint-disable-next-line no-console, no-undef
        console.log('confirmation by polling iteration', abortSignal)
        await wait(refetchInterval * 1000)
        const { value: signatureValue } = await connection.getSignatureStatus(signature, {
          searchTransactionHistory: false,
        })
        if (signatureValue?.confirmationStatus === commitment) {
          return signature
        }
      }
    } catch (error) {
      // eslint-disable-next-line no-console, no-undef
      console.log('confirmation by polling throw error WTF')
      throw new ConfirmTransactionError('Unable to determine transaction status')
    }
  }

type СonfirmTransactionBlockheightBased = (params: {
  signature: string
  connection: Connection
  blockhashWithExpiryBlockHeight: BlockhashWithExpiryBlockHeight
  abortSignal: AbortSignal
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
    throw value.err
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
    throw new ConfirmTransactionError('Unable to confirm transaction')
  }

  return res
}
