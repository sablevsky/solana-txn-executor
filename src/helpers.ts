import { USER_REJECTED_TXN_ERR_MESSAGES } from './constants'
import {
  EventHanlders,
  ExecutorOptions,
  SendTxnsResult,
  TxnData,
  TxnError,
  WalletAndConnection,
} from './types'
import {
  AddressLookupTableAccount,
  Connection,
  PublicKey,
  RpcResponseAndContext,
  TransactionMessage,
  VersionedTransaction,
} from '@solana/web3.js'
import { uniqueId } from 'lodash'

export const signAndSendTxns = async <TResult>({
  txnsData,
  walletAndConnection,
  eventHandlers,
  options,
}: {
  txnsData: TxnData<TResult>[]
  walletAndConnection: WalletAndConnection
  eventHandlers: EventHanlders<TResult>
  options: ExecutorOptions
}): Promise<SendTxnsResult<TResult>> => {
  const { connection, wallet } = walletAndConnection

  const { blockhash } = await connection.getLatestBlockhash()

  const txns = (
    await Promise.all(
      txnsData.map((txnData) =>
        createTxn({
          txnData,
          blockhash,
          walletAndConnection,
        }),
      ),
    )
  ).filter(Boolean) as VersionedTransaction[]

  if (!wallet.signAllTransactions) {
    throw new Error("Wallet is not connected. Or doesn't support signAllTransactions method")
  }

  eventHandlers?.beforeApproveEveryChunk?.()

  const signedTxns = await wallet.signAllTransactions(txns)

  const txnHashes = await sendTransactions(signedTxns, walletAndConnection, options)

  const results = txnHashes.map((txnHash, idx) => ({
    txnHash,
    result: txnsData?.[idx]?.additionalResult,
  }))

  eventHandlers?.pfSuccessEach?.(results)

  return results
}

const sendTransactions = async (
  txns: VersionedTransaction[],
  walletAndConnection: WalletAndConnection,
  options: ExecutorOptions,
) => {
  const { connection } = walletAndConnection

  //? Create mock hashes if preventTxnsSending === true
  if (options.preventTxnsSending) {
    return txns.map(() => uniqueId('mockTxnHash_'))
  }

  const txnHashes: Array<string> = []
  if (!options.parallelExecutionTimeot) {
    const hashes = await Promise.all(
      txns.map(
        async (txn) =>
          await connection.sendRawTransaction(txn.serialize(), {
            skipPreflight: options.skipPreflight,
            preflightCommitment: options.preflightCommitment,
          }),
      ),
    )
    txnHashes.push(...hashes)
  } else {
    for (let i = 0; i < txns.length; ++i) {
      const hash = await connection.sendRawTransaction(txns[i].serialize(), {
        skipPreflight: options.skipPreflight,
        preflightCommitment: options.preflightCommitment,
      })

      txnHashes.push(hash)
      await new Promise((resolve) => setTimeout(resolve, options.parallelExecutionTimeot))
    }
  }

  return txnHashes
}

const createTxn = async <TResult>({
  txnData,
  blockhash,
  walletAndConnection,
}: {
  txnData: TxnData<TResult>
  blockhash: string
  walletAndConnection: WalletAndConnection
}) => {
  const { connection, wallet } = walletAndConnection

  const { lookupTables } = txnData

  const lookupTableAccounts = await Promise.all(
    lookupTables.map((lt) => fetchLookupTableAccount(lt, connection)),
  )

  const txnMessageV0 = new VersionedTransaction(
    new TransactionMessage({
      payerKey: wallet.publicKey as PublicKey,
      recentBlockhash: blockhash,
      instructions: txnData.instructions,
    }).compileToV0Message(
      lookupTableAccounts.map(({ value }) => value as AddressLookupTableAccount),
    ),
  )
  if (txnData.signers) {
    txnMessageV0.sign(txnData.signers)
  }

  return txnMessageV0
}

const lookupTablesCache = new Map<
  string,
  Promise<RpcResponseAndContext<AddressLookupTableAccount | null>>
>()
const fetchLookupTableAccount = (lookupTable: PublicKey, connection: Connection) => {
  const lookupTableAddressStr = lookupTable.toBase58()

  if (!lookupTablesCache.has(lookupTableAddressStr)) {
    const lookupTableAccountPromise = connection.getAddressLookupTable(lookupTable)

    lookupTablesCache.set(lookupTableAddressStr, lookupTableAccountPromise)
  }

  return lookupTablesCache.get(lookupTableAddressStr)!
}

export const hasUserRejectedTxnApprove = (error: TxnError) => {
  const { message } = error
  if (USER_REJECTED_TXN_ERR_MESSAGES.includes(message)) {
    return true
  }
  return false
}
