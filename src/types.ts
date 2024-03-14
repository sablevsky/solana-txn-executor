import { TransactionCreationData } from './functions/createTransaction'
import {
  Blockhash,
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
  logs: Array<string> | undefined
} & Error

/**
 * Data needed to create a transaction
 * Consists of instructions, signers (optional),
 * lookup tables (optional)
 * and additional result (additional data to be returned with the
 * transaction result. F.e. for an optimistic response) (optional)
 */
// export type TxnData<TransactionResult> = {
//   instructions: TransactionInstruction[]
//   signers: Signer[] | undefined
//   additionalResult: TransactionResult | undefined
//   lookupTables: PublicKey[] | undefined
// }

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
  confirmOptions: ConfirmOptions
  /**
   * Amount of transactions passed to the signAllTransactions function
   * Default value: 40
   * Works only if signAllTransactions is supported!
   * Max amount of transactions processed in signAllTransactions is limited by wallet provider implementation
   * Use 1 for ledger of SquadsX
   */
  signAllChunkSize: number
  /**
   * Stop sending other txns(chunks) after first preflight error. Mostly relevant for small values of signAllChunkSize (E.g. ledger cases)
   * Default value: false
   */
  abortOnFirstPfError: boolean

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
    /**
     * Set the chance of unsuccessful transaction confirmation
     * F.e. To mock an unstable network condition
     * Works only if preventSending: true!
     * Allowed values: [0, 1)
     * Default value: undefined
     */
    confirmationFailChance: number | undefined
  }
  //TODO: Maybe add in future
  /**
   *
   * Useful in cases where there are a lot of chunks. Prevents the errors related to
   * loss of relevance of data. F.e. If asynchronous requests are used in createTxnDataFn.
   * However, it can create a delay between signTransaction/signAllTransaction calls
   * Default value: true
   */
  // createTxnDataBeforeEachChunkSign: boolean
}

/**
 * Supported event handlers
 */
export type EventHanlders<TResult> = Partial<{
  /**
   * Triggers only once before first chunk approve but after the first call of CreateTxnDataFn
   */
  beforeFirstApprove: () => void
  /**
   * Triggers before every chunk approve
   * The first call is triggered after beforeFirstApprove
   */
  beforeApproveEveryChunk: () => void
  /**
   * Triggers if all chunks were successfully sent (no errors on preflight)
   */
  pfSuccessAll: (result: SentTransactionsResult<TResult>) => void
  /**
   * Triggers if at least one chunk was successfully sent (no errors on preflight)
   */
  pfSuccessSome: (result: SentTransactionsResult<TResult>) => void
  /**
   * Triggers every time after each chunk is successfully sent (no errors on preflight)
   */
  pfSuccessEach: (result: SentTransactionsResult<TResult>) => void
  /**
   * Triggers on every preflight error
   */
  pfError: (error: TxnError) => void
  /**
   * Triggers if all chunks have been successfully confirmed
   */
  confirmedAll: (result: SentTransactionsResult<TResult>) => void
  /**
   * Triggers if at least one chunk has been successfully confirmed
   */
  confirmedSome: (result: SentTransactionsResult<TResult>) => void
  /**
   * Triggers every time after each chunk is successfully confirmed
   */
  confirmedEach: (result: SentTransactionsResult<TResult>) => void
  /**
   * Triggers on every unsuccessfully confirmed transaction
   * Transaction! Not chunk
   */
  confirmationError: (error: TxnError) => void
}>

export type SentTransactionResult<TransactionResult> = {
  signature: string
  transactionResult?: TransactionResult
}

export type SentTransactionsResult<TransactionResult> = Array<
  SentTransactionResult<TransactionResult>
>

export type BlockhashWithExpiryBlockHeight = Readonly<{
  blockhash: Blockhash
  lastValidBlockHeight: number
}>
