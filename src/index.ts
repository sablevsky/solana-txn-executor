export * from './TxnExecutor'
export * from './types'

const x = async () => {
  throw new Error('Ababa')

  await new Promise((r) => setTimeout(r, 1000))
  return 5
}

const b = await x().catch((err) => console.log('error', err))
console.log(b)
