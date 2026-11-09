// The Signer takes only a network's name and refuses one it doesn't know.
// Mirrors CHAINS in alcor-signer/public/chain.js.
const CHAINS: Record<string, string> = {
  '1064487b3cd1a897ce03ae5b6a865651747e2e152090f99c1d19d44e01aea5a4': 'wax',
  '4667b205c6838ef70ff7988f6e8257e8be0e1284a2f59699054a018f743b1d11': 'telos',
  '384da888112027f0321850a169f737c33e53b388aad48b5adace4bab97f437e0': 'xpr',
  'aca376f206b8fc25a6ed44dbdc66547c36c6c33e3a119ffbeaef943642f0e906': 'vaulta',
}

export const SUPPORTED_CHAIN_IDS = Object.keys(CHAINS)

export function chainName(chainId: string): string {
  const name = CHAINS[chainId]
  if (!name) throw new Error(`Alcor Signer does not sign on chain ${chainId}`)
  return name
}
