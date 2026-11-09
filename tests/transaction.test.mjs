import assert from 'node:assert/strict'
import { test } from 'node:test'
import { ABI, Name, Serializer, Transaction } from '@wharfkit/session'

import { assertSameActions, assertSignable, plainActions } from '../lib/transaction.js'

const abi = ABI.from({
  version: 'eosio::abi/1.2',
  structs: [
    {
      name: 'transfer',
      base: '',
      fields: [
        { name: 'from', type: 'name' },
        { name: 'to', type: 'name' },
        { name: 'quantity', type: 'asset' },
        { name: 'memo', type: 'string' },
      ],
    },
    {
      name: 'order',
      base: '',
      fields: [
        { name: 'owner', type: 'name' },
        { name: 'legs', type: 'extended_asset[]' },
        { name: 'deadline', type: 'time_point_sec' },
        { name: 'limit', type: 'uint64?' },
        { name: 'key', type: 'public_key' },
      ],
    },
  ],
  actions: [
    { name: 'transfer', type: 'transfer', ricardian_contract: '' },
    { name: 'order', type: 'order', ricardian_contract: '' },
  ],
})

const abiCache = { getAbi: async () => abi }
const authorization = [{ actor: 'alice', permission: 'active' }]

const header = {
  expiration: '2026-11-10T00:00:00',
  ref_block_num: 1,
  ref_block_prefix: 2,
  max_net_usage_words: 0,
  max_cpu_usage_ms: 0,
  delay_sec: 0,
}

const requested = Transaction.from(
  {
    ...header,
    actions: [
      {
        account: 'eosio.token',
        name: 'transfer',
        authorization,
        data: { from: 'alice', to: 'bob', quantity: '1.00000000 WAX', memo: 'hi' },
      },
      {
        account: 'eosio.token',
        name: 'order',
        authorization,
        data: {
          owner: 'alice',
          legs: [{ quantity: '0.5000 TLM', contract: 'alien.worlds' }],
          deadline: '2026-11-10T00:00:00',
          limit: null,
          key: 'PUB_K1_6MRyAjQq8ud7hVNYcfnVPJqcVpscN5So8BhtHuGYqET5BoDq63',
        },
      },
    ],
  },
  abi
)

/** What alcor-signer/public/sign.js `buildTransaction` does with the actions it gets. */
function signerBuild(actions, overrides = {}) {
  const abis = [{ contract: Name.from('eosio.token'), abi }]
  return Transaction.from({ ...header, ref_block_num: 99, ...overrides, actions, context_free_actions: [], transaction_extensions: [] }, abis)
}

test('actions survive postMessage and the Signer encoding byte for byte', async () => {
  const plain = structuredClone(await plainActions(requested.actions, abiCache))
  const built = signerBuild(plain)
  assert.notEqual(String(built.id), String(requested.id))
  assertSameActions(requested, Serializer.decode({ data: Serializer.encode({ object: built }).array, type: Transaction }))
})

test('other actions are refused', async () => {
  const plain = await plainActions(requested.actions, abiCache)
  plain[0].data.to = 'mallory'
  assert.throws(() => assertSameActions(requested, signerBuild(plain)), /other actions/)
  assert.throws(() => assertSameActions(requested, signerBuild(plain.slice(1))), /other actions/)
})

test('what the Signer would drop is refused up front', () => {
  assertSignable(requested)
  assert.throws(() => assertSignable(Transaction.from({ ...requested, delay_sec: 5 })), /delayed/)
  assert.throws(
    () => assertSignable(Transaction.from({ ...requested, transaction_extensions: [{ type: 1, data: '00' }] })),
    /extensions/
  )
})
