import { didUserRejectTxnSigning, signAndSendTxns } from './helpers'
import {
  CreateTxnDataFn,
  EventHanlders,
  ExecutorOptions,
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
  createTxnDataBeforeEachChunkSign: true,
  sequentialSendingDelay: undefined,
  debug: {
    preventSending: undefined,
    confirmationFailChance: undefined,
  },
}

export class TxnExecutor<CreateTxnFnParams, TxnAdditionalResult> {
  private createTxnDataFn: CreateTxnDataFn<CreateTxnFnParams, TxnAdditionalResult>
  private txnsParams: ReadonlyArray<CreateTxnFnParams> = []
  private options: ExecutorOptions = DEFAULT_EXECUTOR_OPTIONS
  private walletAndConnection: WalletAndConnection
  private eventHandlers: EventHanlders<TxnAdditionalResult> = {}
  constructor(
    createTxnDataFn: CreateTxnDataFn<CreateTxnFnParams, TxnAdditionalResult>,
    walletAndConnection: WalletAndConnection,
    options?: Partial<ExecutorOptions>,
  ) {
    this.createTxnDataFn = createTxnDataFn
    this.walletAndConnection = walletAndConnection
    this.options = merge(this.options, options)
  }

  public addTxnParam(param: CreateTxnFnParams) {
    this.txnsParams = [...this.txnsParams, param]
    return this
  }

  public addTxnParams(params: CreateTxnFnParams[]) {
    this.txnsParams = [...this.txnsParams, ...params]
    return this
  }

  public on<K extends keyof EventHanlders<CreateTxnFnParams>>(
    type: K,
    handler: EventHanlders<CreateTxnFnParams>[K],
  ) {
    this.eventHandlers = {
      ...this.eventHandlers,
      [type]: handler,
    }
    return this
  }

  public async execute() {
    if (this.options.createTxnDataBeforeEachChunkSign) {
      return await this.executeChunked()
    }
    return await this.executeDefault()
  }

  private async executeDefault() {
    try {
      const { txnsParams, createTxnDataFn, walletAndConnection, options, eventHandlers } = this

      const txnsData = await Promise.all(
        txnsParams.map((params) => createTxnDataFn(params, { ...walletAndConnection })),
      )

      eventHandlers?.beforeFirstApprove?.()

      const txnChunks = chunk(txnsData, options.signAllChunkSize)

      const signAndSendTxnsResults: SentTransactionsResult<TxnAdditionalResult> = []
      for (const chunk of txnChunks) {
        try {
          const result = await signAndSendTxns({
            txnsData: chunk,
            walletAndConnection,
            eventHandlers,
            options,
          })
          signAndSendTxnsResults.push(...result)
        } catch (error) {
          eventHandlers?.pfError?.(error as TxnError)
          const userRejectedTxn = didUserRejectTxnSigning(error as TxnError)
          if (userRejectedTxn) break
          if (!userRejectedTxn && options.abortOnFirstPfError) break
        }
      }

      if (signAndSendTxnsResults.length === txnChunks.flat().length) {
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

  private async executeChunked() {
    try {
      const { txnsParams, createTxnDataFn, walletAndConnection, options, eventHandlers } = this

      const txnsDataChunks = chunk(txnsParams, options.signAllChunkSize)

      eventHandlers?.beforeFirstApprove?.()

      const signAndSendTxnsResults: SentTransactionsResult<TxnAdditionalResult> = []
      for (const chunk of txnsDataChunks) {
        try {
          const txnsData = await Promise.all(
            chunk.map((params) => createTxnDataFn(params, { ...walletAndConnection })),
          )

          const result = await signAndSendTxns({
            txnsData,
            walletAndConnection,
            eventHandlers,
            options,
          })

          signAndSendTxnsResults.push(...result)
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
