import { wait } from '../utils'
import { ConfirmTransactionError } from './errors'
import { Connection } from '@solana/web3.js'

type ConfirmTransactionByPollingSignatureStatusParams = {
  signature: string
  connection: Connection
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
  refetchInterval,
}: ConfirmTransactionByPollingSignatureStatusParams): Promise<string | undefined> {
  try {
    while (!abortSignal.aborted) {
      await wait(refetchInterval * 1000)
      const { value: signatureValues } = await connection.getSignatureStatuses([signature], {
        searchTransactionHistory: false,
      })

      if (signatureValues?.[0]?.confirmationStatus === 'confirmed') {
        return signature
      }
    }
  } catch (error) {
    throw new ConfirmTransactionError('ConfirmTransactionError')
  }
}
