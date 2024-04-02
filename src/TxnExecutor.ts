import { hasUserRejectedTxnApprove, signAndSendTxns } from './helpers'
import {
  EventHanlders,
  ExecutorOptions,
  MakeActionFn,
  SendTxnsResult,
  TxnError,
  WalletAndConnection,
} from './types'
import { chunk } from 'lodash'

export const DEFAULT_EXECUTOR_OPTIONS: ExecutorOptions = {
  commitment: 'confirmed',
  signAllChunks: 40, //? Set different for ledger
  skipPreflight: false,
  maxRetries: undefined,
  preflightCommitment: 'confirmed',
  rejectQueueOnFirstPfError: false,
  chunkCallOfActionFn: true,
  parallelExecutionTimeot: 0,
  preventTxnsSending: false,
}

export class TxnExecutor<TParams, TResult> {
  private makeActionFn: MakeActionFn<TParams, TResult>
  private txnsParams: TParams[] = []
  private options: ExecutorOptions = DEFAULT_EXECUTOR_OPTIONS
  private walletAndConnection: WalletAndConnection
  private eventHandlers: EventHanlders<TResult> = {}
  constructor(
    makeActionFn: MakeActionFn<TParams, TResult>,
    walletAndConnection: WalletAndConnection,
    options?: Partial<ExecutorOptions>,
  ) {
    this.makeActionFn = makeActionFn
    this.walletAndConnection = walletAndConnection
    this.options = {
      ...this.options,
      ...options,
    }
  }

  public addTxnParam(param: TParams) {
    this.txnsParams = [...this.txnsParams, param]
    return this
  }

  public addTxnParams(params: TParams[]) {
    this.txnsParams = [...this.txnsParams, ...params]
    return this
  }

  public on<K extends keyof EventHanlders<TResult>>(type: K, handler: EventHanlders<TResult>[K]) {
    this.eventHandlers = {
      ...this.eventHandlers,
      [type]: handler,
    }
    return this
  }

  public async execute() {
    if (this.options.chunkCallOfActionFn) {
      return await this.executeChunked()
    }
    return await this.executeDefault()
  }

  private async executeDefault() {
    try {
      const { txnsParams, makeActionFn, walletAndConnection, options, eventHandlers } = this

      const txnsData = await Promise.all(
        txnsParams.map((params) => makeActionFn(params, { ...walletAndConnection })),
      )

      eventHandlers?.beforeFirstApprove?.()

      const txnChunks = chunk(txnsData, options.signAllChunks)

      const signAndSendTxnsResults: SendTxnsResult<TResult> = []
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
          const userRejectedTxn = hasUserRejectedTxnApprove(error as TxnError)
          if (userRejectedTxn) break
          if (!userRejectedTxn && options.rejectQueueOnFirstPfError) break
        }
      }

      if (signAndSendTxnsResults.length === txnChunks.flat().length) {
        eventHandlers?.pfSuccessAll?.(signAndSendTxnsResults)
      } else if (signAndSendTxnsResults.length) {
        eventHandlers?.pfSuccessSome?.(signAndSendTxnsResults)
      }

      return signAndSendTxnsResults
    } catch (error) {
      this.eventHandlers?.pfError?.(error as TxnError)
    }
  }

  private async executeChunked() {
    try {
      const { txnsParams, makeActionFn, walletAndConnection, options, eventHandlers } = this

      const txnsDataChunks = chunk(txnsParams, options.signAllChunks)

      eventHandlers?.beforeFirstApprove?.()

      const signAndSendTxnsResults: SendTxnsResult<TResult> = []
      for (const chunk of txnsDataChunks) {
        try {
          const txnsData = await Promise.all(
            chunk.map((params) => makeActionFn(params, { ...walletAndConnection })),
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
          const userRejectedTxn = hasUserRejectedTxnApprove(error as TxnError)
          if (userRejectedTxn) break
          if (!userRejectedTxn && options.rejectQueueOnFirstPfError) break
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
