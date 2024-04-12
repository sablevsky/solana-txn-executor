import { TransactionCreationData } from './functions/createTransaction'
import { Blockhash, Commitment, Connection, PublicKey, VersionedTransaction } from '@solana/web3.js'

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

export type ExecutorOptionsBase = {
  /**
   * Options for sending transactions
   */
  sendOptions: {
    /** disable transaction verification step */
    skipPreflight?: boolean
    /** preflight commitment level */
    preflightCommitment?: Commitment
    /** Maximum number of times for the RPC node to retry sending the transaction to the leader. */
    maxRetries?: number

    resendTimeout?: number
    resendInterval?: number
  }

  confirmOptions: {
    /** desired commitment level */
    commitment?: Commitment
    /** Transaction confirmation tracking forced termination timeout */
    confirmationTimeout?: number

    pollingSignatureInterval?: number
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
   * Parameters for debug
   */
  debug: {
    /**
     * Prevent sending transactions via RPC
     * F.e. Can be used to test optimistics responses without sending transactions into blockchain
     * Default value: undefined
     */
    preventSending?: boolean
  }
}

export type ExecutorOptions = Partial<ExecutorOptionsBase>

type SentTransactionResult<TransactionResult> = {
  signature: string
  result?: TransactionResult
}

export type SentTransactionsResult<TransactionResult> = Array<
  SentTransactionResult<TransactionResult>
>

export type ConfirmationFailedResult<TransactionResult> = {
  signature: string
  reason: ConfirmTransactionErrorReason
  result?: TransactionResult
}

export type ConfirmationFailedResults<TransactionResult> = Array<
  ConfirmationFailedResult<TransactionResult>
>

export type ConfirmedTransactionsResult<TransactionResult> = {
  confirmed: SentTransactionsResult<TransactionResult>
  failed: ConfirmationFailedResults<TransactionResult>
}

export enum ConfirmTransactionErrorReason {
  ConfirmationFailed = 'ConfirmationFailed',
  TimeoutError = 'TimeoutError',
  AbortError = 'AbortError',
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
