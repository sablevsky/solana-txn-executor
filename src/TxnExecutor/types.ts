import { CreateTxnData } from '../base'
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

export type GetPriorityFeeParams<TxnResult> = {
  txnParams: CreateTxnData<TxnResult>
  connection: Connection
}
export type GetPriorityFee = <TxnResult>(params: GetPriorityFeeParams<TxnResult>) => Promise<number>

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
   * async function that returns priority fee (microlamports)
   * If was not passed, the priority fee will be 0
   * Priority fee value is the concern of the class user. It is up to you to determine how it should be calculated
   * The function is called on EACH transaction creation. So, caching (if needed) needs to be implemented on your own
   */
  transactionOptions: {
    getPriorityFee?: GetPriorityFee
  }
  /**
   * Amount of transactions passed to the signAllTransactions function
   * Default value: 10
   * Works only if signAllTransactions is supported!
   * Max amount of transactions processed in signAllTransactions is limited by wallet provider implementation
   * Use 1 for ledger of SquadsX
   */
  chunkSize: number
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

type SentTransactionResult<TxnResult> = {
  signature: string
  result?: TxnResult
}

export type SentTransactionsResult<TxnResult> = Array<SentTransactionResult<TxnResult>>

export type ConfirmationFailedResult<TxnResult> = {
  signature: string
  reason: ConfirmTransactionErrorReason
  result?: TxnResult
}

export type ConfirmationFailedResults<TxnResult> = Array<ConfirmationFailedResult<TxnResult>>

export type ConfirmedTransactionsResult<TxnResult> = {
  confirmed: SentTransactionsResult<TxnResult>
  failed: ConfirmationFailedResults<TxnResult>
}

export enum ConfirmTransactionErrorReason {
  ConfirmationFailed = 'ConfirmationFailed',
  TimeoutError = 'TimeoutError',
  AbortError = 'AbortError',
}

/**
 * Supported event handlers
 */
export type EventHanlders<TxnResult> = Partial<{
  /**
   * Triggers before every chunk approve
   */
  beforeChunkApprove: () => void
  /**
   * Triggers every time after each chunk is successfully sent (no errors on preflight)
   */
  chunkSent: (txnsResults: SentTransactionsResult<TxnResult>) => void
  /**
   * Triggers on every preflight error
   */
  error: (txnError: TxnError) => void
  /**
   * Triggers if all chunks were successfully sent (no errors on preflight)
   * Triggers when all chunks were sent
   */
  sentAll: (txnsResults: SentTransactionsResult<TxnResult>) => void
  /**
   * Triggers if at least one chunk was successfully sent (no errors on preflight)
   * Triggers when all chunks were sent
   */
  sentSome: (txnsResults: SentTransactionsResult<TxnResult>) => void
  /**
   * Triggers on the result of each chunk confirmation.
   * Contains both confirmed and failed results.
   * Triggers when the result of all transactions confirmations in the chunk is known,
   * regardless of the success of the confirmation
   */
  chunkConfirmed: ({ confirmed, failed }: ConfirmedTransactionsResult<TxnResult>) => void
  /**
   * Triggers on the result of all chunks confirmation.
   * Contains both confirmed and failed results.
   * Will never execute if there is an error in the sending/preflight step
   */
  confirmedAll: ({ confirmed, failed }: ConfirmedTransactionsResult<TxnResult>) => void
}>
