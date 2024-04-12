import {
  AddressLookupTableAccount,
  Connection,
  PublicKey,
  RpcResponseAndContext,
  Signer,
  TransactionInstruction,
  TransactionMessage,
  VersionedTransaction,
} from '@solana/web3.js'

/**
 * Data needed to create a transaction
 * Consists of instructions, signers (optional),
 * lookup tables (optional)
 * and \result (additional data to be returned with the
 * transaction result. F.e. for an optimistic response) (optional)
 */
export type TransactionCreationData<TransactionResult> = {
  instructions: TransactionInstruction[]
  signers?: Signer[]
  result?: TransactionResult
  lookupTables?: PublicKey[]
}

type CreateTransaction = <TransactionResult>(props: {
  transactionCreationData: TransactionCreationData<TransactionResult>
  blockhash: string
  payerKey: PublicKey
  connection: Connection
}) => Promise<VersionedTransaction>

export const createTransaction: CreateTransaction = async ({
  transactionCreationData,
  blockhash,
  payerKey,
  connection,
}) => {
  const { instructions, signers, lookupTables } = transactionCreationData

  const lookupTableAccounts = await Promise.all(
    (lookupTables ?? []).map((lt) => fetchLookupTableAccount(lt, connection)),
  )

  const transaction = new VersionedTransaction(
    new TransactionMessage({
      payerKey,
      recentBlockhash: blockhash,
      instructions: instructions,
    }).compileToV0Message(
      lookupTableAccounts.map(({ value }) => value as AddressLookupTableAccount),
    ),
  )

  if (signers) {
    transaction.sign(signers)
  }

  return transaction
}

const lookupTablesCache = new Map<
  string,
  Promise<RpcResponseAndContext<AddressLookupTableAccount | null>>
>()
const fetchLookupTableAccount = (
  lookupTable: PublicKey,
  connection: Connection,
): Promise<RpcResponseAndContext<AddressLookupTableAccount | null>> => {
  const lookupTableAddressStr = lookupTable.toBase58()

  if (!lookupTablesCache.has(lookupTableAddressStr)) {
    const lookupTableAccountPromise = connection.getAddressLookupTable(lookupTable)

    lookupTablesCache.set(lookupTableAddressStr, lookupTableAccountPromise)
  }

  return lookupTablesCache.get(lookupTableAddressStr)!
}
