import { TransactionCreationData } from './functions/createTransaction'
import {
  Blockhash,
  Commitment,
  ConfirmOptions,
  Connection,
  PublicKey,
  VersionedTransaction,
} from '@solana/web3.js'

/**
 * The wallet must contain a publicKey and support at least signTransaction method
 */
export type Wallet = {
  publicKey: PublicKey
  signTransaction: (transaction: VersionedTransaction) => Promise<VersionedTransaction>
  signAllTransactions:
    | ((transactions: VersionedTransaction[]) => Promise<VersionedTransaction[]>)
    | undefined
}

export type WalletAndConnection = {
  wallet: Wallet
  connection: Connection
}

export type TxnError = {
  logs?: Array<string>
} & Error

export type BlockhashWithExpiryBlockHeight = Readonly<{
  blockhash: Blockhash
  lastValidBlockHeight: number
}>

/**
 * Function that creates TxnData. Acc
 * Accepts the parameters required to create a TxnData.
 * Wallet and Connection are always passed
 */
export type CreateTransactionDataFn<CreateTransactionFnParams, TransactionResult> = (
  params: CreateTransactionFnParams,
  walletAndConnection: WalletAndConnection,
) => Promise<TransactionCreationData<TransactionResult>>

export type ExecutorOptions = {
  /**
   * Options for sending transactions
   * Default value: { skipPreflight: false, commitment: 'confirmed', preflightCommitment: 'processed', maxRetries: undefined, minContextSlot: undefined }
   */
  confirmOptions: {
    /** disable transaction verification step */
    skipPreflight?: boolean
    /** desired commitment level */
    commitment?: Commitment
    /** preflight commitment level */
    preflightCommitment?: Commitment
    /** Maximum number of times for the RPC node to retry sending the transaction to the leader. */
    maxRetries?: number
    /** Transaction confirmation tracking forced termination timeout */
    confirmationTimeout?: number
  }
  /**
   * Amount of transactions passed to the signAllTransactions function
   * Default value: 10
   * Works only if signAllTransactions is supported!
   * Max amount of transactions processed in signAllTransactions is limited by wallet provider implementation
   * Use 1 for ledger of SquadsX
   */
  signAllChunkSize: number
  /**
   * Stop sending other txns(chunks) after first preflight error. Mostly relevant for small values of signAllChunkSize (E.g. ledger cases)
   * Default value: false
   */
  abortOnFirstError: boolean
  /**
   * If the value exists, the transactions in chunk will be sent sequentially with the specified delay
   * If no value is passed, the transactions in chunk will be sent via Promise.all
   * Allowed values: [0, +Infinity)
   * Default value: undefined
   */
  sequentialSendingDelay: number | undefined
  /**
   * Parameters for debug
   */

  debug: {
    /**
     * Prevent sending transactions via RPC
     * F.e. Can be used to test optimistics responses without sending transactions into blockchain
     * Default value: undefined
     */
    preventSending: boolean | undefined
  }
}

type SentTransactionResult<TransactionResult> = {
  signature: string
  result?: TransactionResult
}

export type SentTransactionsResult<TransactionResult> = Array<
  SentTransactionResult<TransactionResult>
>

export type ConfirmedTransactionsResult<TransactionResult> = {
  confirmed: SentTransactionsResult<TransactionResult>
  failed: SentTransactionsResult<TransactionResult>
}

/**
 * Supported event handlers
 */
export type EventHanlders<TransactionResult> = Partial<{
  /**
   * Triggers before every chunk approve
   */
  beforeChunkApprove: () => void
  /**
   * Triggers every time after each chunk is successfully sent (no errors on preflight)
   */
  chunkSent: (txnsResults: SentTransactionsResult<TransactionResult>) => void
  /**
   * Triggers on every preflight error
   */
  error: (txnError: TxnError) => void
  /**
   * Triggers if all chunks were successfully sent (no errors on preflight)
   */
  sentAll: (txnsResults: SentTransactionsResult<TransactionResult>) => void
  /**
   * Triggers if at least one chunk was successfully sent (no errors on preflight)
   */
  sentSome: (txnsResults: SentTransactionsResult<TransactionResult>) => void
  /**
   * Triggers on the result of each chunk confirmation.
   * Contains both confirmed and failed results.
   * Triggers when the result of all transactions confirmations in the chunk is known,
   * regardless of the success of the confirmation
   */
  chunkConfirmed: ({ confirmed, failed }: ConfirmedTransactionsResult<TransactionResult>) => void
  /**
   * Triggers on the result of all chunks confirmation.
   * Contains both confirmed and failed results.
   * Will never execute if there is an error in the sending/preflight step
   */
  confirmedAll: ({ confirmed, failed }: ConfirmedTransactionsResult<TransactionResult>) => void
}>
