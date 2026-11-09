# @alcorexchange/wallet-plugin-alcor-signer

[Alcor Signer](https://sign.alcor.exchange) for [WharfKit Session Kit](https://wharfkit.com). Alcor Signer is a passkey wallet for WAX, Telos, XPR Network and Vaulta: Face ID, Touch ID or a security key, with no extension to install.

> **Early access.** Alcor Signer answers only sites it was told about. Send us the exact origins your app runs on (production and staging) before you integrate.

## Install

```sh
yarn add @alcorexchange/wallet-plugin-alcor-signer
```

## Use

```ts
import { SessionKit } from '@wharfkit/session'
import { WebRenderer } from '@wharfkit/web-renderer'
import { WalletPluginAlcorSigner } from '@alcorexchange/wallet-plugin-alcor-signer'

const sessionKit = new SessionKit({
  appName: 'yourapp',
  chains: [{ id: '1064487b3cd1a897ce03ae5b6a865651747e2e152090f99c1d19d44e01aea5a4', url: 'https://wax.greymass.com' }],
  ui: new WebRenderer(),
  walletPlugins: [new WalletPluginAlcorSigner()],
})
```

Login and signing open a window on `sign.alcor.exchange`. The person picks the account and confirms each transaction there.

## What to know

- **The Signer builds the transaction.** It takes your actions and sets TAPOS and expiration from its own nodes. The plugin hands back that transaction with the signatures, and Session Kit pushes it. This needs `allowModify`, which is on by default. The plugin checks that the actions are byte-for-byte the ones you sent, and fails otherwise.
- **Refused up front:** context-free actions, transaction extensions, `delay_sec`. Permission changes (`updateauth`, `linkauth`, `setcode`, `setabi`, `eosio.msig`) are never signed for an app.
- **Your own resources.** The Signer does not pay CPU or NET for other apps.
- **Pop-ups.** Safari opens a window only right after a click. If the window is held back, the plugin shows a button in the WharfKit dialog that opens it.
- **Browser only.** The key is a passkey on the person's device, so there is no server-side or Node.js signing.

## Develop

```sh
yarn test
```

`new WalletPluginAlcorSigner({ signerOrigin: SIGNER_ORIGINS.development })` talks to a local Signer on `https://sign.localhost:8443`. The local Signer answers only `https://localhost:3000`, `https://127.0.0.1:3000` and `https://[::1]:3000`.
