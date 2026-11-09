import {
  AbstractWalletPlugin,
  ChainId,
  Checksum256,
  Logo,
  PermissionLevel,
  ResolvedSigningRequest,
  Serializer,
  Signature,
  SigningRequest,
  Transaction,
  WalletPluginMetadata,
  type APIClient,
  type LoginContext,
  type TransactContext,
  type WalletPlugin,
  type WalletPluginConfig,
  type WalletPluginLoginResponse,
  type WalletPluginSignResponse,
} from '@wharfkit/session'

import { SUPPORTED_CHAIN_IDS, chainName } from './chains.js'
import { LOGO } from './logo.js'
import { assertSameActions, assertSignable, plainActions } from './transaction.js'
import { SIGNER_ORIGINS, SignerRejected, openSigner, talk, type SignerOrigin } from './window.js'

export { SIGNER_ORIGINS, SignerRejected, type SignerOrigin }

export interface WalletPluginAlcorSignerOptions {
  /** `SIGNER_ORIGINS.development` to work against a local Signer. */
  signerOrigin?: SignerOrigin
}

interface LoginResult {
  publicKey: string
  account: string
}

interface SignResult {
  signatures: string[]
  serializedTransaction: number[]
}

export class WalletPluginAlcorSigner extends AbstractWalletPlugin implements WalletPlugin {
  readonly config: WalletPluginConfig = {
    requiresChainSelect: true,
    requiresPermissionSelect: false,
    supportedChains: SUPPORTED_CHAIN_IDS,
  }

  readonly metadata = WalletPluginMetadata.from({
    name: 'Alcor Signer',
    description: 'A passkey wallet: Face ID, Touch ID or a security key, nothing to install',
    logo: Logo.from(LOGO),
    homepage: 'https://sign.alcor.exchange',
  })

  private readonly origin: SignerOrigin

  constructor(options: WalletPluginAlcorSignerOptions = {}) {
    super()
    const origin = options.signerOrigin ?? SIGNER_ORIGINS.production
    if (!Object.values(SIGNER_ORIGINS).includes(origin)) {
      throw new Error(`Unknown Alcor Signer origin ${origin}`)
    }
    this.origin = origin
  }

  get id() {
    return 'alcor-signer'
  }

  async login(context: LoginContext): Promise<WalletPluginLoginResponse> {
    if (!context.chain) throw new Error('Pick a network before signing in with Alcor Signer')
    const chain = chainName(String(context.chain.id))

    // The person picks the account in the Signer window: one passkey can hold several.
    const popup = await openSigner(this.origin, context.ui)
    const login = await talk<LoginResult>(popup, this.origin, { kind: 'login', chain })
    if (typeof login.account !== 'string' || typeof login.publicKey !== 'string') {
      throw new Error('Alcor Signer answered without an account')
    }

    const permission = await permissionOf(context.getClient(context.chain), login.account, login.publicKey)
    this.data = { publicKey: login.publicKey }

    return {
      chain: Checksum256.from(context.chain.id),
      permissionLevel: PermissionLevel.from({ actor: login.account, permission }),
    }
  }

  /**
   * The Signer builds the transaction itself (TAPOS, expiration) from its own nodes and
   * returns it with the signatures, so the transaction pushed is the Signer's, not ours.
   * Needs `allowModify`, which Session Kit has on by default.
   */
  async sign(resolved: ResolvedSigningRequest, context: TransactContext): Promise<WalletPluginSignResponse> {
    const publicKey = this.data.publicKey
    if (typeof publicKey !== 'string') throw new Error('Sign in with Alcor Signer again')

    const chain = chainName(String(resolved.chainId))
    const requested = resolved.transaction
    assertSignable(requested)

    const actions = await plainActions(requested.actions, context.abiCache)
    const popup = await openSigner(this.origin, context.ui)
    const answer = await talk<SignResult>(popup, this.origin, { kind: 'sign', chain, publicKey, actions })

    const transaction = Serializer.decode({
      data: Uint8Array.from(answer.serializedTransaction),
      type: Transaction,
    })
    assertSameActions(requested, transaction)

    const header = {
      expiration: transaction.expiration,
      ref_block_num: transaction.ref_block_num,
      ref_block_prefix: transaction.ref_block_prefix,
      max_net_usage_words: transaction.max_net_usage_words,
      max_cpu_usage_ms: transaction.max_cpu_usage_ms,
      delay_sec: transaction.delay_sec,
    }
    const request = await SigningRequest.create({ transaction }, context.esrOptions)

    return {
      signatures: answer.signatures.map((signature) => Signature.from(signature)),
      resolved: new ResolvedSigningRequest(
        request,
        context.permissionLevel,
        transaction,
        { ...resolved.resolvedTransaction, ...header },
        ChainId.from(resolved.chainId)
      ),
    }
  }
}

/** Prefers `active`: owner is there to survive a lost key, not to trade with. */
async function permissionOf(client: APIClient, account: string, publicKey: string): Promise<string> {
  const { accounts } = await client.v1.chain.get_accounts_by_authorizers({ keys: [publicKey] })
  const permissions = accounts
    .filter((entry) => String(entry.account_name) === account)
    .map((entry) => String(entry.permission_name))

  if (!permissions.length) throw new Error(`${account} is not authorized by this passkey`)
  return permissions.includes('active') ? 'active' : permissions[0]
}
