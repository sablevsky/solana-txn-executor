import { BlockhashWithExpiryBlockHeight, ExecutorOptions } from '../types'
import { Connection } from '@solana/web3.js'

export type ConfirmTransactionsProps = {
  signatures: string[]
  connection: Connection
  blockhashWithExpiryBlockHeight: BlockhashWithExpiryBlockHeight
  options: ExecutorOptions
}

export type ConfirmTransactionsResult = {
  confirmed: string[]
  failed: string[]
}

export const confirmTransactions = async ({
  signatures,
  connection,
  blockhashWithExpiryBlockHeight,
  options,
}: ConfirmTransactionsProps) => {
  const { blockhash, lastValidBlockHeight } = blockhashWithExpiryBlockHeight

  const results = await Promise.allSettled(
    signatures.map(
      async (signature) =>
        await connection.confirmTransaction(
          {
            signature,
            lastValidBlockHeight,
            blockhash,
          },
          options.confirmOptions.commitment,
        ),
    ),
  )

  return results.reduce(
    (acc: ConfirmTransactionsResult, result, idx) => {
      const signature = signatures[idx]

      if (result.status === 'rejected') {
        acc.failed.push(signature)
        return acc
      }

      if (result.status === 'fulfilled' && result.value.value.err) {
        acc.failed.push(signature)
        return acc
      }

      acc.confirmed.push(signature)
      return acc
    },
    {
      confirmed: [],
      failed: [],
    },
  )
}
