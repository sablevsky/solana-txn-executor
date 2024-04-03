import { ExecutorOptions, WalletAndConnection } from '../types'
import { sendTransactions } from './sendTransactions'
import { VersionedTransaction } from '@solana/web3.js'

export type SignAndSendTransactionsProps = {
  transactions: VersionedTransaction[]
  walletAndConnection: WalletAndConnection
  options: ExecutorOptions
}

export const signAndSendTransactions = async ({
  transactions,
  walletAndConnection,
  options,
}: SignAndSendTransactionsProps): Promise<string[]> => {
  const { connection, wallet } = walletAndConnection

  if (!wallet.signAllTransactions || options.signAllChunkSize === 1) {
    const signatures: string[] = []

    for (let i = 0; i < transactions.length; ++i) {
      const signedTransaction = await wallet.signTransaction(transactions[i])
      const [signature] = await sendTransactions({
        transactions: [signedTransaction],
        connection: connection,
        options,
      })

      signatures.push(signature)
    }

    return signatures
  }

  const signedTxns = await wallet.signAllTransactions(transactions)
  const signatures = await sendTransactions({
    transactions: signedTxns,
    connection: connection,
    options,
  })

  return signatures
}
