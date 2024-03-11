import { USER_REJECTED_TXN_ERR_MESSAGES } from './constants'
import {
  EventHanlders,
  ExecutorOptions,
  SentTransactionsResult,
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

export const signAndSendTxns = async <TxnAdditionalResult>({
  txnsData,
  walletAndConnection,
  eventHandlers,
  options,
}: {
  txnsData: TxnData<TxnAdditionalResult>[]
  walletAndConnection: WalletAndConnection
  eventHandlers: EventHanlders<TxnAdditionalResult>
  options: ExecutorOptions
}): Promise<SentTransactionsResult<TxnAdditionalResult>> => {
  const { connection, wallet } = walletAndConnection

  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash()

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
  if (options.debug.preventSending) {
    return txns.map(() => uniqueId('mockTxnHash_'))
  }

  const txnHashes: Array<string> = []
  if (!options.sequentialSendingDelay) {
    const hashes = await Promise.all(
      txns.map(
        async (txn) =>
          await connection.sendRawTransaction(txn.serialize(), {
            skipPreflight: options.confirmOptions.skipPreflight,
            preflightCommitment: options.confirmOptions.preflightCommitment,
          }),
      ),
    )
    txnHashes.push(...hashes)
  } else {
    for (let i = 0; i < txns.length; ++i) {
      const hash = await connection.sendRawTransaction(txns[i].serialize(), {
        skipPreflight: options.confirmOptions.skipPreflight,
        preflightCommitment: options.confirmOptions.preflightCommitment,
      })

      txnHashes.push(hash)
      await new Promise((resolve) => setTimeout(resolve, options.sequentialSendingDelay))
    }
  }

  const controller = new AbortController()
  const signal = controller.signal

  const x = connection.confirmTransaction(
    {
      signature: 'signature',
      lastValidBlockHeight: 12245,
      blockhash: '12345',
      abortSignal: signal,
    },
    'confirmed',
  )

  return txnHashes
}

export const createTxn = async <TxnAdditionalResult>({
  txnData,
  blockhash,
  walletAndConnection,
}: {
  txnData: TxnData<TxnAdditionalResult>
  blockhash: string
  walletAndConnection: WalletAndConnection
}) => {
  const { connection, wallet } = walletAndConnection

  const { lookupTables } = txnData

  const lookupTableAccounts = await Promise.all(
    (lookupTables ?? []).map((lt) => fetchLookupTableAccount(lt, connection)),
  )

  const transaction = new VersionedTransaction(
    new TransactionMessage({
      payerKey: wallet.publicKey as PublicKey,
      recentBlockhash: blockhash,
      instructions: txnData.instructions,
    }).compileToV0Message(
      lookupTableAccounts.map(({ value }) => value as AddressLookupTableAccount),
    ),
  )

  if (txnData.signers) {
    transaction.sign(txnData.signers)
  }

  return transaction
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

export const didUserRejectTxnSigning = (error: TxnError) => {
  const { message } = error
  return USER_REJECTED_TXN_ERR_MESSAGES.includes(message)
}
