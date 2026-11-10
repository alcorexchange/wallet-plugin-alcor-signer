import { SessionKit, type Session } from '@wharfkit/session'
import { WebRenderer } from '@wharfkit/web-renderer'

import { SIGNER_ORIGINS, WalletPluginAlcorSigner } from '../src/index.js'

const WAX = {
  id: '1064487b3cd1a897ce03ae5b6a865651747e2e152090f99c1d19d44e01aea5a4',
  url: 'https://wax.greymass.com',
}

const sessionKit = new SessionKit({
  appName: 'signertest',
  chains: [WAX],
  ui: new WebRenderer(),
  walletPlugins: [new WalletPluginAlcorSigner({ signerOrigin: SIGNER_ORIGINS.development })],
})

const $ = (id: string) => document.getElementById(id) as HTMLButtonElement
const log = document.getElementById('log') as HTMLPreElement
let session: Session | undefined

function show(text: string) {
  log.textContent = text
  console.info('[example]', text)
}

function setSession(next: Session | undefined) {
  session = next
  $('transfer').disabled = !session
  $('logout').disabled = !session
  show(session ? `Logged in as ${session.permissionLevel} on WAX` : 'Not logged in')
}

$('login').onclick = async () => {
  try {
    setSession((await sessionKit.login()).session)
  } catch (error) {
    show(`Login failed: ${(error as Error).message}`)
  }
}

$('transfer').onclick = async () => {
  if (!session) return
  try {
    const result = await session.transact({
      action: {
        account: 'eosio.token',
        // An existing balance row makes this a no-op: no tokens move, no RAM is used.
        name: 'open',
        authorization: [session.permissionLevel],
        data: { owner: session.actor, symbol: '8,WAX', ram_payer: session.actor },
      },
    })
    show(`Sent: ${result.response?.transaction_id ?? '(no id)'}`)
  } catch (error) {
    show(`Signing failed: ${(error as Error).message}`)
  }
}

$('logout').onclick = async () => {
  await sessionKit.logout()
  setSession(undefined)
}

sessionKit.restore().then(setSession, (error) => show(`Restore failed: ${error.message}`))
