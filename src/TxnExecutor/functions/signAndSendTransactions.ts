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

  //? Use signTransaction method if signAllTransactions not supported or chunk size is 1
  if (!wallet.signAllTransactions || transactions.length === 1) {
    const signedTransaction = await wallet.signTransaction(transactions[0])
    return await sendTransactions({
      transactions: [signedTransaction],
      connection: connection,
      minContextSlot,
      options,
    })
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
