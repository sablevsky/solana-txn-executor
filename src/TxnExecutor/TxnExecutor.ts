import { CreateTxnData } from '../base'
import { DEFAULT_CONFIRMATION_TIMEOUT, GET_PRIORITY_FEE_PLACEHOLDER } from './constants'
import { confirmTransactions, makeTransaction, signAndSendTransactions } from './functions'
import {
  ConfirmedTransactionsResult,
  EventHanlders,
  ExecutorOptions,
  ExecutorOptionsBase,
  SentTransactionsResult,
  TxnError,
  WalletAndConnection,
} from './types'
import { didUserRejectTxnSigning } from './utils'
import { chain, chunk, merge } from 'lodash'

export const DEFAULT_EXECUTOR_OPTIONS: ExecutorOptionsBase = {
  confirmOptions: {
    commitment: undefined,
    confirmationTimeout: DEFAULT_CONFIRMATION_TIMEOUT,
    pollingSignatureInterval: undefined,
  },
  transactionOptions: {
    getPriorityFee: undefined,
  },
  sendOptions: {
    skipPreflight: undefined,
    maxRetries: undefined,
    preflightCommitment: undefined,
    resendInterval: undefined,
    resendTimeout: undefined,
  },
  chunkSize: 10,
  abortOnFirstError: false,
  debug: {
    preventSending: undefined,
  },
}

export class TxnExecutor<TxnResult> {
  private txnsParams: ReadonlyArray<CreateTxnData<TxnResult>> = []
  private options: ExecutorOptionsBase = DEFAULT_EXECUTOR_OPTIONS
  private walletAndConnection: WalletAndConnection
  private eventHandlers: EventHanlders<TxnResult> = {}
  constructor(walletAndConnection: WalletAndConnection, options?: ExecutorOptions) {
    this.walletAndConnection = walletAndConnection
    this.options = merge(this.options, options)
  }

  public addTransactionParam(param: Readonly<CreateTxnData<TxnResult>>) {
    this.txnsParams = [...this.txnsParams, param]
    return this
  }

  public addTransactionParams(params: ReadonlyArray<CreateTxnData<TxnResult>>) {
    this.txnsParams = [...this.txnsParams, ...params]
    return this
  }

  public on<K extends keyof EventHanlders<TxnResult>>(
    type: K,
    handler: EventHanlders<TxnResult>[K],
  ) {
    this.eventHandlers = {
      ...this.eventHandlers,
      [type]: handler,
    }
    return this
  }

  private signAndSendTxnsResults: SentTransactionsResult<TxnResult> = []
  private confirmedTxnsResults: ConfirmedTransactionsResult<TxnResult> = {
    confirmed: [],
    failed: [],
  }

  public async execute() {
    if (!this.txnsParams.length) {
      throw new Error('No transaction params provided')
    }

    const signAllSupported = !!this.walletAndConnection.wallet?.signAllTransactions
    const chunkSize = !signAllSupported || this.options.chunkSize === 1 ? 1 : this.options.chunkSize
    const txnsDataChunks = chunk(this.txnsParams, chunkSize)

    for (const chunk of txnsDataChunks) {
      await this.executeChunk(chunk)
    }

    if (this.signAndSendTxnsResults.length === txnsDataChunks.flat().length) {
      this.eventHandlers?.sentAll?.(this.signAndSendTxnsResults)
    }
    if (this.signAndSendTxnsResults.length) {
      this.eventHandlers?.sentSome?.(this.signAndSendTxnsResults)
    }

    return this.signAndSendTxnsResults
  }

  private async executeChunk(txnsParams: ReadonlyArray<CreateTxnData<TxnResult>>) {
    const resendAbortControllerBySignature = new Map<string, AbortController | undefined>()

    try {
      const {
        value: { blockhash, lastValidBlockHeight },
        context: { slot: minContextSlot },
      } = await this.walletAndConnection.connection.getLatestBlockhashAndContext(
        this.options.sendOptions.preflightCommitment,
      )

      const priorityFee = await (
        this.options.transactionOptions?.getPriorityFee ?? GET_PRIORITY_FEE_PLACEHOLDER
      )()

      const transactions = await Promise.all(
        txnsParams.map((txnParams) =>
          makeTransaction({
            createTxnData: txnParams,
            blockhash: blockhash,
            connection: this.walletAndConnection.connection,
            payerKey: this.walletAndConnection.wallet.publicKey,
            priorityFee,
          }),
        ),
      )

      this.eventHandlers?.beforeChunkApprove?.()

      const signAndSendTransactionsResults = await signAndSendTransactions({
        transactions,
        walletAndConnection: this.walletAndConnection,
        options: this.options,
        minContextSlot,
      })

      //? setting abortController map
      signAndSendTransactionsResults.forEach(({ signature, resendAbortController }) =>
        resendAbortControllerBySignature.set(signature, resendAbortController),
      )

      const results: SentTransactionsResult<TxnResult> = Array.from(
        resendAbortControllerBySignature,
      ).map(([signature], idx) => ({
        signature,
        result: txnsParams?.[idx]?.result,
      }))
      this.signAndSendTxnsResults.push(...results)

      this.eventHandlers?.chunkSent?.(results)

      //? Track the confirmation of transactions in chunks only if specific handlers exist
      if (this.eventHandlers.confirmedAll || this.eventHandlers.chunkConfirmed) {
        confirmTransactions({
          signatures: Array.from(resendAbortControllerBySignature).map(([signature]) => signature),
          resendAbortControllerBySignature,
          blockhashWithExpiryBlockHeight: { blockhash, lastValidBlockHeight },
          connection: this.walletAndConnection.connection,
          options: this.options,
        })
          .then(({ confirmed: confirmedSignatures, failed: confirmationFailedResults }) => {
            const confirmedResults = results.filter(({ signature }) =>
              confirmedSignatures.includes(signature),
            )
            this.confirmedTxnsResults.confirmed.push(...confirmedResults)

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

            this.confirmedTxnsResults.failed.push(...failedResults)

            this.eventHandlers?.chunkConfirmed?.({
              confirmed: confirmedResults,
              failed: confirmationFailedResults,
            })

            if (
              this.confirmedTxnsResults.confirmed.length +
                this.confirmedTxnsResults.failed.length ===
              this.txnsParams.length
            ) {
              this.eventHandlers?.confirmedAll?.({
                confirmed: confirmedResults,
                failed: confirmationFailedResults,
              })
            }
          })
          .finally(() => {
            //? Abort each resend
            resendAbortControllerBySignature.forEach((abortController) => {
              if (!abortController?.signal.aborted) {
                abortController?.abort()
              }
            })
          })
      }
    } catch (error) {
      this.eventHandlers?.error?.(error as TxnError)
      const userRejectedTxn = didUserRejectTxnSigning(error as TxnError)
      //? If chunk error -- abort each resend
      resendAbortControllerBySignature.forEach((abortController) => {
        if (!abortController?.signal.aborted) {
          abortController?.abort()
        }
      })
      if (userRejectedTxn) return
      if (!userRejectedTxn && this.options.abortOnFirstError) return
    }
  }
}
