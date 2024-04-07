import { Commitment, VersionedTransaction } from '@solana/web3.js'
import axios from 'axios'
import bs58 from 'bs58'

type SendTransactionBanx = (params: {
  transaction: VersionedTransaction
  blockhash: string
  lastValidBlockHeight: number
  preflightCommitment?: Commitment
  commitment?: Commitment
  minContextSlot?: number
  skipPreflight?: boolean
}) => Promise<void>

const BACKEND_BASE_URL = 'https://api.banx.gg'

export const sendTransactionBanx: SendTransactionBanx = async ({
  transaction,
  blockhash,
  lastValidBlockHeight,
  preflightCommitment,
  commitment,
  minContextSlot,
  skipPreflight,
}): Promise<void> => {
  try {
    // const x = transaction.serialize()

    // const y = VersionedTransaction.deserialize(x)

    // const ixns = transaction.message.getAccountKeys()

    // // eslint-disable-next-line no-console
    // console.log(ixns)

    await axios.post(`${BACKEND_BASE_URL}/activity/tx`, {
      transaction: bs58.encode(transaction.serialize()),
      blockhash,
      lastValidBlockHeight,
      preflightCommitment,
      commitment,
      minContextSlot,
      skipPreflight,
    })
  } catch (error) {
    return
  }
}
