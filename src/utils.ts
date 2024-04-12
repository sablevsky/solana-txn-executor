import { chain } from 'lodash'

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
