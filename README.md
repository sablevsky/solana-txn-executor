# solana-transactions-executor
> A small solution to operate solana transactions: create, sign, send, chunk, support ledger etc.

```bash
yarn add solana-transactions-executor # npm install solana-transactions-executor or pnpm add solana-transactions-executor
```

##
This package is designed to be used on the frontend of your <u>React</u> web3 application to simplify complex transactional interactions. It assumes that you are already using [@solana/web3.js](https://solana-labs.github.io/solana-web3.js/) and [@solana/wallet-adapter-react](https://github.com/solana-labs/wallet-adapter) 


## Usage example
```typescript
const { connection } = useConnection()
const wallet = useWallet()
const isLedger = false

const txnsResults = await new TxnExecutor(
  makeBorrowAction,
  { wallet, connection },
  { signAllChunks: isLedger ? 1 : 40, rejectQueueOnFirstPfError: false },
)
  .addTxnParams(txnParams)
  .on('pfSuccessEach', (results) => {
    //? Some action if the transction is successfull. Triggered after each successfull preflight
  })
  .on('pfSuccessAll', (results) => {
    //? Some action if all transactions are successfull. Triggers after all successfull preflights
  })
  .on('pfError', (error) => {
    //? Some action on a failed transaction. Triggers for each transaction error
  })
  .execute()

const makeBorrowAction: MakeBorrowAction = async (ixnParams, walletAndConnection) => {
  const { instructions, signers, additionalResult } = await getIxnsAndSignersByBorrowType({
    ixnParams,
    type: borrowType,
    walletAndConnection,
  })

  return {
    instructions,
    signers,
    additionalResult,
    lookupTables: [new web3.PublicKey(LOOKUP_TABLE)],
  }
}
```

## Execution process
* Create new instance of `TxnExecutor`
* Add params for your transaction(s)
* Add event handlers if needed
* Execute transaction(s)
### Contructor params:
* `makeActionFn: MakeActionFn<TParams, TResult>` - function that accepts params `<TParams>` to build your transaction results `<TResult>`
* `walletAndConnection: WalletAndConnection` - Wallet and Connection objects: `{wallet, connection}`
* `options?: Partial<ExecutorOptions>` - Additional contructor options

Additional contructor options:
```typescript
export type ExecutorOptions = {
  commitment: Commitment
  signAllChunks: number //? Specify how many trasactions you want to sign per chunk using signAllTransactions method (use 1 for ledger because it doesn't support signAllTransactions method)
  skipPreflight: boolean //? if you want to skipPreflight on sendTransaction
  preflightCommitment: Commitment
  rejectQueueOnFirstPfError: boolean //? Stop sending other txns after first preflight error. Mostly relevant for the ledger
  chunkCallOfActionFn: boolean //? If true -- call makeActionFn for each chunk (between wallet approve). If false -- call makeActionFn for all txnsParams at once
}

```

### Transaction(s) params
To pass parameters to `MakeActionFn<TParams, TResult>` to create a transaction, use the `addTxnParam` or `addTxnParams` methods. You may chain `addTxnParam` calls or pass txn params via array into `addTxnParams`. The number of sent transactions will depend on the number of parameters `TParams`.

### Event hanlders
* `beforeFirstApprove: () => void` - Triggers before first chunk approve
* `beforeApproveEveryChunk: () => void` - Triggers after beforeFirstApprove and before each chunk approve
* `pfSuccessAll: (result: SendTxnsResult<TResult>) => void` - Triggers if all chunks were successfully sent
* `pfSuccessSome: (result: SendTxnsResult<TResult>) => void` - Triggers if at least one chunk was successfully sent
* `pfSuccessEach: (result: SendTxnsResult<TResult>) => void` - Triggers after successfull send of each chunk
* `pfError: (error: TxnError) => void` - Triggers on any error

