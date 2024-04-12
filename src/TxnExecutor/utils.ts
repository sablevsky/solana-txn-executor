import { USER_REJECTED_TXN_ERR_MESSAGES } from './constants'
import { TxnError } from './types'

export const didUserRejectTxnSigning = (error: TxnError) => {
  const { message } = error
  return USER_REJECTED_TXN_ERR_MESSAGES.includes(message)
}
