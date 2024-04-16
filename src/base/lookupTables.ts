import {
  AddressLookupTableAccount,
  Connection,
  PublicKey,
  RpcResponseAndContext,
} from '@solana/web3.js'

//? Map is used for caching
const lookupTablesCache = new Map<
  string,
  Promise<RpcResponseAndContext<AddressLookupTableAccount | null>>
>()

export function getLookupTableAccount(
  lookupTableAddress: PublicKey,
  connection: Connection,
): Promise<RpcResponseAndContext<AddressLookupTableAccount | null>> {
  const lookupTableAddressStr = lookupTableAddress.toBase58()

  if (!lookupTablesCache.has(lookupTableAddressStr)) {
    const lookupTableAccountPromise = connection.getAddressLookupTable(lookupTableAddress)

    lookupTablesCache.set(lookupTableAddressStr, lookupTableAccountPromise)
  }

  return lookupTablesCache.get(lookupTableAddressStr)!
}
