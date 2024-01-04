import { WalletContextState } from '@solana/wallet-adapter-react'
import { Commitment, Connection, PublicKey, Signer, TransactionInstruction } from '@solana/web3.js'

export interface WalletAndConnection {
  wallet: WalletContextState
  connection: Connection
}

export interface TxnError extends Error {
  logs?: Array<string>
}

export type TxnData<TResult> = {
  instructions: TransactionInstruction[]
  signers?: Signer[]
  additionalResult?: TResult
  lookupTables: PublicKey[]
}

export type MakeActionFn<TParams, TResult> = (
  params: TParams,
  walletAndConnection: WalletAndConnection,
) => Promise<TxnData<TResult>>

export type ExecutorOptions = {
  commitment: Commitment
  signAllChunks: number
  skipPreflight: boolean
  preflightCommitment: Commitment
  rejectQueueOnFirstPfError: boolean //? Stop sending other txns after first preflight error. Mostly relevant for the ledger
  chunkCallOfActionFn: boolean //? If true -- call makeActionFn for each chunk (between wallet approve). If false -- call makeActionFn for all txnsParams at once
  parallelExecutionTimeot: number //? If true -- send all transactions via Promise all. If false -- send them sequentially
  //TODO: Add webscoket result handling in future
}

export type EventHanlders<TResult> = Partial<{
  beforeFirstApprove: () => void //? Triggers before first chunk approve
  beforeApproveEveryChunk: () => void //? Triggers after beforeFirstApprove and before each chunk approve
  pfSuccessAll: (result: SendTxnsResult<TResult>) => void //? Triggers if all chunks were successfully sent
  pfSuccessSome: (result: SendTxnsResult<TResult>) => void //? Triggers if at least one chunk was successfully sended
  pfSuccessEach: (result: SendTxnsResult<TResult>) => void //? Triggers after successfull send of each chunk
  pfError: (error: TxnError) => void //? Triggers on any error
}>

export type SendTxnsResult<TResult> = Array<{
  txnHash: string
  result: TResult | undefined
}>
