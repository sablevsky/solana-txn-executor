import { ExecutorOptionsBase, WalletAndConnection } from '../types'
import { sendTransactions } from './sendTransactions'
import { VersionedTransaction } from '@solana/web3.js'

export type SignAndSendTransactions = (params: {
  transactions: VersionedTransaction[]
  walletAndConnection: WalletAndConnection
  minContextSlot: number
  options: ExecutorOptionsBase
}) => Promise<{ signature: string; resendAbortController?: AbortController }[]>

export const signAndSendTransactions: SignAndSendTransactions = async ({
  transactions,
  walletAndConnection,
  minContextSlot,
  options,
}) => {
  const { connection, wallet } = walletAndConnection

  if (!wallet.signAllTransactions || options.signAllChunkSize === 1) {
    const signaturesAndAbortControllers = []

    for (let i = 0; i < transactions.length; ++i) {
      const signedTransaction = await wallet.signTransaction(transactions[i])
      const [signatureAndResendAbortController] = await sendTransactions({
        transactions: [signedTransaction],
        connection: connection,
        minContextSlot,
        options,
      })

      signaturesAndAbortControllers.push(signatureAndResendAbortController)
    }

    return signaturesAndAbortControllers
  }

  const signedTxns = await wallet.signAllTransactions(transactions)
  const signatureAndResendAbortController = await sendTransactions({
    transactions: signedTxns,
    connection: connection,
    minContextSlot,
    options,
  })

  return signatureAndResendAbortController
}
