import { USER_REJECTED_TXN_ERR_MESSAGES } from './constants'
import { TxnError } from './types'
import { chain } from 'lodash'

export const didUserRejectTxnSigning = (error: TxnError) => {
  const { message } = error
  return USER_REJECTED_TXN_ERR_MESSAGES.includes(message)
}

export const filterFulfilledResultsValues = <T>(results: PromiseSettledResult<T>[]): T[] =>
  chain(results)
    .map((result) => (result.status === 'fulfilled' ? result.value : null))
    .compact()
    .value()

export const filterRejectedResultsReasons = <T>(results: PromiseSettledResult<T>[]): T[] =>
  chain(results)
    .map((result) => (result.status === 'rejected' ? result.reason : null))
    .compact()
    .value()

export const wait = (time: number) => new Promise((resolve) => setTimeout(resolve, time))
