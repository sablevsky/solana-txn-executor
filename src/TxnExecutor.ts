import { confirmTransactions, createTransaction, signAndSendTransactions } from './functions'
import { didUserRejectTxnSigning } from './helpers'
import {
  CreateTransactionDataFn,
  EventHanlders,
  ExecutorOptions,
  SentTransactionResult,
  SentTransactionsResult,
  TxnError,
  WalletAndConnection,
} from './types'
import { chunk, merge } from 'lodash'

export const DEFAULT_EXECUTOR_OPTIONS: ExecutorOptions = {
  confirmOptions: {
    skipPreflight: false,
    commitment: 'confirmed',
    preflightCommitment: 'processed',
    maxRetries: undefined,
    minContextSlot: undefined,
  },
  signAllChunkSize: 40,
  abortOnFirstPfError: false,
  sequentialSendingDelay: undefined,
  debug: {
    preventSending: undefined,
    confirmationFailChance: undefined,
  },
}

export class TxnExecutor<CreateTransactionFnParams, TransactionResult> {
  private createTransactionDataFn: CreateTransactionDataFn<
    CreateTransactionFnParams,
    TransactionResult
  >
  private txnsParams: ReadonlyArray<CreateTransactionFnParams> = []
  private options: ExecutorOptions = DEFAULT_EXECUTOR_OPTIONS
  private walletAndConnection: WalletAndConnection
  private eventHandlers: EventHanlders<TransactionResult> = {}
  constructor(
    createTransactionDataFn: CreateTransactionDataFn<CreateTransactionFnParams, TransactionResult>,
    walletAndConnection: WalletAndConnection,
    options?: Partial<ExecutorOptions>,
  ) {
    this.createTransactionDataFn = createTransactionDataFn
    this.walletAndConnection = walletAndConnection
    this.options = merge(this.options, options)
  }

  public addTxnParam(param: CreateTransactionFnParams) {
    this.txnsParams = [...this.txnsParams, param]
    return this
  }

  public addTxnParams(params: CreateTransactionFnParams[]) {
    this.txnsParams = [...this.txnsParams, ...params]
    return this
  }

  public on<K extends keyof EventHanlders<CreateTransactionFnParams>>(
    type: K,
    handler: EventHanlders<CreateTransactionFnParams>[K],
  ) {
    this.eventHandlers = {
      ...this.eventHandlers,
      [type]: handler,
    }
    return this
  }

  public async execute() {
    try {
      const { txnsParams, createTransactionDataFn, walletAndConnection, options, eventHandlers } =
        this

      const txnsDataChunks = chunk(txnsParams, options.signAllChunkSize)

      eventHandlers?.beforeFirstApprove?.()

      const signAndSendTxnsResults: SentTransactionsResult<TransactionResult> = []
      const confirmedOrFailedSignatures: string[] = []
      for (const chunk of txnsDataChunks) {
        try {
          const transactionCreationData = await Promise.all(
            chunk.map((params) => createTransactionDataFn(params, { ...walletAndConnection })),
          )

          const { blockhash, lastValidBlockHeight } =
            await walletAndConnection.connection.getLatestBlockhash()

          const transactions = await Promise.all(
            transactionCreationData.map((txnData) =>
              createTransaction({
                transactionCreationData: txnData,
                blockhash,
                connection: walletAndConnection.connection,
                payerKey: walletAndConnection.wallet.publicKey,
              }),
            ),
          )

          eventHandlers?.beforeApproveEveryChunk?.()

          const signatures = await signAndSendTransactions({
            transactions,
            walletAndConnection,
            options,
          })

          const results: SentTransactionResult<TransactionResult>[] = signatures.map(
            (signature, idx) => ({
              signature,
              transactionResult: transactionCreationData?.[idx]?.result,
            }),
          )

          eventHandlers?.pfSuccessEach?.(results)

          confirmTransactions({
            signatures,
            blockhashWithExpiryBlockHeight: { blockhash, lastValidBlockHeight },
            connection: walletAndConnection.connection,
            options,
          }).then(({ confirmed, failed }) => {
            confirmedOrFailedSignatures.push(...confirmed, ...failed)

            //TODO:
            if (confirmedOrFailedSignatures.length === txnsParams.length) {
              // eventHandlers?.confirmedSome()
              // eventHandlers?.confirmedAll()
            }
            // eventHandlers?.confirmedEach()
            // eventHandlers?.confirmationError()
          })

          signAndSendTxnsResults.push(...results)
        } catch (error) {
          eventHandlers?.pfError?.(error as TxnError)
          const userRejectedTxn = didUserRejectTxnSigning(error as TxnError)
          if (userRejectedTxn) break
          if (!userRejectedTxn && options.abortOnFirstPfError) break
        }
      }

      if (signAndSendTxnsResults.length === txnsDataChunks.flat().length) {
        eventHandlers?.pfSuccessAll?.(signAndSendTxnsResults)
      }
      if (signAndSendTxnsResults.length) {
        eventHandlers?.pfSuccessSome?.(signAndSendTxnsResults)
      }

      return signAndSendTxnsResults
    } catch (error) {
      this.eventHandlers?.pfError?.(error as TxnError)
    }
  }
}
