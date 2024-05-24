import { CreateTxnData } from '../base'
import { DEFAULT_CONFIRMATION_TIMEOUT, GET_PRIORITY_FEE_PLACEHOLDER } from './constants'
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

export class TxnExecutor {
  private txnsParams: ReadonlyArray<CreateTxnData> = []
  private options: ExecutorOptionsBase = DEFAULT_EXECUTOR_OPTIONS
  private walletAndConnection: WalletAndConnection
  private eventHandlers: EventHanlders = {}
  constructor(walletAndConnection: WalletAndConnection, options?: ExecutorOptions) {
    this.walletAndConnection = walletAndConnection
    this.options = merge(this.options, options)
  }

  public addTxnData(param: Readonly<CreateTxnData>) {
    this.txnsParams = [...this.txnsParams, param]
    return this
  }

  public addTxnsData(params: ReadonlyArray<CreateTxnData>) {
    this.txnsParams = [...this.txnsParams, ...params]
    return this
  }

  public on<K extends keyof EventHanlders>(type: K, handler: EventHanlders[K]) {
    this.eventHandlers = {
      ...this.eventHandlers,
      [type]: handler,
    }
    return this
  }

  private signAndSendTxnsResults: SentTransactionsResult = []
  private confirmedTxnsResults: ConfirmedTransactionsResult = {
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

  private async executeChunk(txnsParams: ReadonlyArray<CreateTxnData>) {
    const resendAbortControllerBySignature = new Map<string, AbortController | undefined>()

    try {
      const {
        value: { blockhash, lastValidBlockHeight },
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

      const results: SentTransactionsResult = Array.from(resendAbortControllerBySignature).map(
        ([signature], idx) => ({
          signature,
          accountInfoByPubkey: transactionsAndAccounts?.[idx]?.accountInfoByPubkey,
        }),
      )
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
                const value: ConfirmationFailedResult = {
                  reason,
                  signature: result.signature,
                  accountInfoByPubkey: result.accountInfoByPubkey,
                }
                return value
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
