import { CreateTxnData } from '../base'
import { GET_PRIORITY_FEE_PLACEHOLDER } from './constants'
import { confirmTransactions, makeTransaction, signAndSendTransactions } from './functions'
import {
  ConfirmationFailedResult,
  ConfirmedTransactionsResult,
  EventHanlders,
  ExecutorOptions,
  ExecutorOptionsBase,
  SentTransactionsResult,
  TxnError,
  WalletAndConnection,
} from './types'
import { didUserRejectTxnSigning } from './utils'
import { chain, chunk, map, merge } from 'lodash'

export const DEFAULT_EXECUTOR_OPTIONS: ExecutorOptionsBase = {
  confirmOptions: {
    confirmationTimeout: 60,
    pollingSignatureInterval: 2,
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

export class TxnExecutor<Params> {
  private txnsParams: ReadonlyArray<CreateTxnData<Params>> = []
  private options: ExecutorOptionsBase = DEFAULT_EXECUTOR_OPTIONS
  private walletAndConnection: WalletAndConnection
  private eventHandlers: EventHanlders<Params> = {}
  constructor(walletAndConnection: WalletAndConnection, options?: ExecutorOptions) {
    this.walletAndConnection = walletAndConnection
    this.options = merge(this.options, options)
  }

  public addTxnData(param: Readonly<CreateTxnData<Params>>) {
    this.txnsParams = [...this.txnsParams, param]
    return this
  }

  public addTxnsData(params: ReadonlyArray<CreateTxnData<Params>>) {
    this.txnsParams = [...this.txnsParams, ...params]
    return this
  }

  public on<K extends keyof EventHanlders<Params>>(type: K, handler: EventHanlders<Params>[K]) {
    this.eventHandlers = {
      ...this.eventHandlers,
      [type]: handler,
    }
    return this
  }

  private signAndSendTxnsResults: SentTransactionsResult<Params> = []
  private confirmedTxnsResults: ConfirmedTransactionsResult<Params> = {
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

  private async executeChunk(txnsParams: ReadonlyArray<CreateTxnData<Params>>) {
    const resendAbortControllerBySignature = new Map<string, AbortController | undefined>()

    try {
      const {
        value: { blockhash },
        context: { slot: minContextSlot },
      } = await this.walletAndConnection.connection.getLatestBlockhashAndContext(
        this.options.sendOptions.preflightCommitment,
      )

      const transactionsAndAccounts = await Promise.all(
        txnsParams.map((txnParams) =>
          makeTransaction({
            createTxnData: txnParams,
            blockhash: blockhash,
            connection: this.walletAndConnection.connection,
            payerKey: this.walletAndConnection.wallet.publicKey,
            getPriorityFee:
              this.options.transactionOptions?.getPriorityFee ?? GET_PRIORITY_FEE_PLACEHOLDER,
          }),
        ),
      )

      this.eventHandlers?.beforeChunkApprove?.()

      const signAndSendTransactionsResults = await signAndSendTransactions({
        transactions: map(transactionsAndAccounts, ({ transaction }) => transaction),
        walletAndConnection: this.walletAndConnection,
        options: this.options,
        minContextSlot,
      })

      //? setting abortController map
      signAndSendTransactionsResults.forEach(({ signature, resendAbortController }) =>
        resendAbortControllerBySignature.set(signature, resendAbortController),
      )

      const results: SentTransactionsResult<Params> = Array.from(
        resendAbortControllerBySignature,
      ).map(([signature], idx) => ({
        signature,
        accountInfoByPubkey: transactionsAndAccounts?.[idx]?.accountInfoByPubkey,
        params: transactionsAndAccounts?.[idx]?.params,
      }))
      this.signAndSendTxnsResults.push(...results)

      this.eventHandlers?.chunkSent?.(results)

      //? Track the confirmation of transactions in chunks only if specific handlers exist
      if (this.eventHandlers.confirmedAll || this.eventHandlers.chunkConfirmed) {
        confirmTransactions({
          signatures: Array.from(resendAbortControllerBySignature).map(([signature]) => signature),
          resendAbortControllerBySignature,
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
                const value: ConfirmationFailedResult<Params> = {
                  reason,
                  signature: result.signature,
                  accountInfoByPubkey: result.accountInfoByPubkey,
                  params: result.params,
                }
                return value
              })
              .compact()
              .value()

            this.confirmedTxnsResults.failed.push(...failedResults)

            this.eventHandlers?.chunkConfirmed?.({
              confirmed: confirmedResults,
              failed: failedResults,
            })

            if (
              this.confirmedTxnsResults.confirmed.length +
                this.confirmedTxnsResults.failed.length ===
              this.txnsParams.length
            ) {
              this.eventHandlers?.confirmedAll?.({
                confirmed: confirmedResults,
                failed: failedResults,
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
