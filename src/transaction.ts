import { Serializer, type ABICacheInterface, type Action, type Transaction } from '@wharfkit/session'

/** The Signer forces these empty; dropping them quietly would sign something else. */
export function assertSignable(transaction: Transaction) {
  if (transaction.context_free_actions.length) throw new Error('Alcor Signer does not sign context-free actions')
  if (transaction.transaction_extensions.length) throw new Error('Alcor Signer does not sign transaction extensions')
  if (transaction.delay_sec.toNumber()) throw new Error('Alcor Signer does not sign delayed transactions')
}

/**
 * Action data as JSON: the Signer encodes it again with ABIs it checks itself.
 * Bytes would not survive postMessage anyway.
 */
export function plainActions(actions: Action[], abiCache: ABICacheInterface) {
  return Promise.all(
    actions.map(async (action) => {
      const abi = await abiCache.getAbi(action.account)
      return Serializer.objectify({
        account: action.account,
        name: action.name,
        authorization: action.authorization,
        data: action.decodeData(abi),
      })
    })
  )
}

/**
 * The same actions, byte for byte. A difference means the Signer's ABI encodes the data
 * differently from the app's, and the app should not push what it did not ask for.
 */
export function assertSameActions(requested: Transaction, signed: Transaction) {
  const same =
    requested.actions.length === signed.actions.length &&
    requested.actions.every((action, index) => action.equals(signed.actions[index]))
  if (!same) throw new Error('Alcor Signer returned other actions than the app asked to sign')
}
