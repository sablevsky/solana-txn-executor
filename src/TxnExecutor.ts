import { DEFAULT_CONFIRMATION_TIMEOT } from './constants'
import { confirmTransactions, createTransaction, signAndSendTransactions } from './functions'
import {
  ConfirmedTransactionsResult,
  CreateTransactionDataFn,
  EventHanlders,
  ExecutorOptions,
  SentTransactionsResult,
  TxnError,
  WalletAndConnection,
} from './types'
import { didUserRejectTxnSigning } from './utils'
import { chain, chunk, merge } from 'lodash'

export const DEFAULT_EXECUTOR_OPTIONS: ExecutorOptions = {
  confirmOptions: {
    skipPreflight: undefined,
    commitment: undefined,
    preflightCommitment: undefined,
    maxRetries: undefined,
    confirmationTimeout: DEFAULT_CONFIRMATION_TIMEOT,
  },
  signAllChunkSize: 10,
  abortOnFirstError: false,
  sequentialSendingDelay: undefined,
  debug: {
    preventSending: undefined,
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

  public addTransactionParam(param: CreateTransactionFnParams) {
    this.txnsParams = [...this.txnsParams, param]
    return this
  }

  public addTransactionParams(params: CreateTransactionFnParams[]) {
    this.txnsParams = [...this.txnsParams, ...params]
    return this
  }

  public on<K extends keyof EventHanlders<TransactionResult>>(
    type: K,
    handler: EventHanlders<TransactionResult>[K],
  ) {
    this.eventHandlers = {
      ...this.eventHandlers,
      [type]: handler,
    }
    return this
  }

  public async execute() {
    const { txnsParams, createTransactionDataFn, walletAndConnection, options, eventHandlers } =
      this

    const txnsDataChunks = chunk(txnsParams, options.signAllChunkSize)

    const signAndSendTxnsResults: SentTransactionsResult<TransactionResult> = []
    const confirmedTxnsResults: ConfirmedTransactionsResult<TransactionResult> = {
      confirmed: [],
      failed: [],
    }
    for (const chunk of txnsDataChunks) {
      try {
        const transactionCreationData = await Promise.all(
          chunk.map((params) => createTransactionDataFn(params, { ...walletAndConnection })),
        )

        const { value, context } =
          await walletAndConnection.connection.getLatestBlockhashAndContext(
            options.confirmOptions.preflightCommitment,
          )
        const { blockhash, lastValidBlockHeight } = value

        const transactions = await Promise.all(
          transactionCreationData.map((txnData) =>
            createTransaction({
              transactionCreationData: txnData,
              blockhash: blockhash,
              connection: walletAndConnection.connection,
              payerKey: walletAndConnection.wallet.publicKey,
            }),
          ),
        )

        eventHandlers?.beforeChunkApprove?.()

        const signatures = await signAndSendTransactions({
          transactions,
          walletAndConnection,
          options,
          slot: context.slot,
        })

        const results: SentTransactionsResult<TransactionResult> = signatures.map(
          (signature, idx) => ({
            signature,
            result: transactionCreationData?.[idx]?.result,
          }),
        )
        signAndSendTxnsResults.push(...results)

        eventHandlers?.chunkSent?.(results)

        //? Track the confirmation of transactions in chunks only if specific handlers exist
        if (eventHandlers.confirmedAll || eventHandlers.chunkConfirmed) {
          confirmTransactions({
            signatures,
            blockhashWithExpiryBlockHeight: { blockhash, lastValidBlockHeight },
            connection: walletAndConnection.connection,
            options,
            slot: context.slot,
          }).then(({ confirmed: confirmedSignatures, failed: confirmationFailedResults }) => {
            const confirmedResults = results.filter(({ signature }) =>
              confirmedSignatures.includes(signature),
            )
            confirmedTxnsResults.confirmed.push(...confirmedResults)

            const failedResults = chain(confirmationFailedResults)
              .map(({ reason, signature }) => {
                const result = results.find(
                  ({ signature: resSignature }) => signature === resSignature,
                )
                if (!result) return null
                return {
                  reason,
                  signature: result.signature,
                  result: result.result,
                }
              })
              .compact()
              .value()

            confirmedTxnsResults.failed.push(...failedResults)

            eventHandlers?.chunkConfirmed?.({
              confirmed: confirmedResults,
              failed: confirmationFailedResults,
            })

            if (
              confirmedTxnsResults.confirmed.length + confirmedTxnsResults.failed.length ===
              txnsParams.length
            ) {
              eventHandlers?.confirmedAll?.({
                confirmed: confirmedResults,
                failed: confirmationFailedResults,
              })
            }
          })
        }
      } catch (error) {
        eventHandlers?.error?.(error as TxnError)
        const userRejectedTxn = didUserRejectTxnSigning(error as TxnError)
        if (userRejectedTxn) break
        if (!userRejectedTxn && options.abortOnFirstError) break
      }
    }

    if (signAndSendTxnsResults.length === txnsDataChunks.flat().length) {
      eventHandlers?.sentAll?.(signAndSendTxnsResults)
    }
    if (signAndSendTxnsResults.length) {
      eventHandlers?.sentSome?.(signAndSendTxnsResults)
    }

    return signAndSendTxnsResults
  }
}
