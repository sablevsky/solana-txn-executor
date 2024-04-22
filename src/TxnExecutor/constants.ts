import { GetPriorityFee } from './types'

//? To define that user has rejected txn (check error.message). 0 -- phantom error message, 1 -- solflare error message
export const USER_REJECTED_TXN_ERR_MESSAGES = ['User rejected the request.', 'Transaction rejected']

export const DEFAULT_CONFIRMATION_TIMEOUT = 60

export const GET_PRIORITY_FEE_PLACEHOLDER: GetPriorityFee = () => Promise.resolve(0)
