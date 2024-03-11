import { USER_REJECTED_TXN_ERR_MESSAGES } from './constants'
import { createTxn } from './helpers'
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
  Commitment,
  ConfirmOptions,
  Connection,
  PublicKey,
  RpcResponseAndContext,
  TransactionMessage,
  VersionedTransaction,
  sendAndConfirmRawTransaction
} from '@solana/web3.js'
import { has, uniqueId } from 'lodash'

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

  return txnHashes
}

const sendTransactionsParallel = async (
  txns: VersionedTransaction[],
  walletAndConnection: WalletAndConnection,
  options: ExecutorOptions,
) => {
  const { connection } = walletAndConnection

  //? Create mock hashes if preventTxnsSending === true
  if (options.debug.preventSending) {
    return txns.map(() => uniqueId('mockTxnHash_'))
  }

  const hashes = await Promise.all(
    txns.map(
      async (txn) =>
        await sendTransaction({
          txn,
          connection,
          confirmOptions: {
            skipPreflight: options.confirmOptions.skipPreflight,
            preflightCommitment: options.confirmOptions.preflightCommitment,
          },
        }),
    ),
  )

  Promise.allSettled(
    hashes.map(async (hash) => {
      await confirmTransaction({
        signature: hash,
        connection,
        options: {
          commitment: options.confirmOptions.commitment,
          blockhash: '12345',
          lastValidBlockHeight: 12345,
        },
      })
    }),
  )

  return hashes
}

const sendTransaction = async (params: {
  txn: VersionedTransaction
  connection: Connection
  confirmOptions: ConfirmOptions
}) => {
  const { txn, connection, confirmOptions } = params

  const signature = await connection.sendRawTransaction(txn.serialize(), {
    skipPreflight: confirmOptions.skipPreflight,
    preflightCommitment: confirmOptions.preflightCommitment,
  })

  return signature
}

const confirmTransaction = async (params: {
  signature: string
  connection: Connection
  options: {
    commitment: Commitment | undefined
    blockhash: string
    lastValidBlockHeight: number
  }
}) => {
  const { signature, connection, options } = params

  return await connection.confirmTransaction(
    {
      signature,
      lastValidBlockHeight: options.lastValidBlockHeight,
      blockhash: options.blockhash,
    },
    options.commitment,
  )
}
