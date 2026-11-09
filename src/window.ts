import type { UserInterface } from '@wharfkit/session'

export const SIGNER_ORIGINS = {
  production: 'https://sign.alcor.exchange',
  development: 'https://sign.localhost:8443',
} as const

export type SignerOrigin = (typeof SIGNER_ORIGINS)[keyof typeof SIGNER_ORIGINS]

/** The window loads ~900 KB of modules; on mobile data that can take well over 10 s. */
const HANDSHAKE_MS = 60_000
/** Only for `sign`: login may create a passkey and show 24 words, which honestly takes longer. */
const SIGN_ANSWER_MS = 180_000
const CLOSE_POLL_MS = 400

export class SignerRejected extends Error {
  readonly name = 'SignerRejected'
}

function tryOpen(origin: SignerOrigin): Window | null {
  // A unique name per request: with a fixed one the browser hands back the window
  // already open, which never says `vault:ready` again.
  return window.open(origin, `alcor-sign-${crypto.randomUUID()}`, 'width=440,height=720')
}

/**
 * Safari opens a window only right after a click, and WharfKit awaits nodes before it
 * calls the plugin. When the window is held back, a WharfKit prompt gives the click.
 */
export function openSigner(origin: SignerOrigin, ui: UserInterface | undefined): Promise<Window> {
  const popup = tryOpen(origin)
  if (popup) return Promise.resolve(popup)
  if (!ui) return Promise.reject(new Error('The browser blocked the Alcor Signer window. Allow pop-ups for this site.'))

  return new Promise((resolve, reject) => {
    let opened: Window | null = null
    const prompt = ui.prompt({
      title: 'Open Alcor Signer',
      body: 'The browser held back the signing window. Open it to continue.',
      elements: [
        {
          type: 'button',
          data: {
            label: 'Open Alcor Signer',
            variant: 'primary',
            onClick: () => {
              opened = tryOpen(origin)
              if (opened) prompt.cancel()
            },
          },
        },
      ],
    })
    const settle = () =>
      opened ? resolve(opened) : reject(new SignerRejected('The Alcor Signer window was not opened'))
    prompt.then(settle, settle)
  })
}

/**
 * One request, one answer. Only the window we opened, from the Signer's origin, is heard;
 * `targetOrigin` is always that origin.
 */
export function talk<T>(popup: Window, origin: SignerOrigin, payload: Record<string, unknown>): Promise<T> {
  const reqId = crypto.randomUUID()

  return new Promise<T>((resolve, reject) => {
    let sent = false
    let answer: ReturnType<typeof setTimeout> | undefined

    const finish = (error: Error | null, value?: T) => {
      window.removeEventListener('message', onMessage)
      clearInterval(closeWatch)
      clearTimeout(handshake)
      clearTimeout(answer)
      if (error) reject(error)
      else resolve(value as T)
    }

    const fail = (message: string) => {
      popup.close()
      finish(new Error(message))
    }

    function onMessage(event: MessageEvent) {
      if (event.origin !== origin || event.source !== popup) return
      const data = event.data

      if (data?.type === 'vault:ready' && !sent) {
        sent = true
        clearTimeout(handshake)
        try {
          popup.postMessage({ type: 'vault:request', reqId, ...payload }, origin)
        } catch (error) {
          // DataCloneError: a Proxy or a function in the actions.
          fail(`Could not send the request to Alcor Signer: ${(error as Error).message}`)
          return
        }
        if (payload.kind === 'sign') {
          answer = setTimeout(() => fail('Alcor Signer did not answer. Try again.'), SIGN_ANSWER_MS)
        }
        return
      }

      if (data?.type !== 'vault:result' || data.reqId !== reqId) return

      const { ok, rejected, error, type: _type, reqId: _reqId, ...result } = data
      if (ok) finish(null, result as T)
      else if (rejected) finish(new SignerRejected(error ?? 'Rejected in Alcor Signer'))
      else finish(new Error(error ?? 'Alcor Signer could not sign this'))
    }

    // No hello means the window didn't load, or this site is not one the Signer answers.
    const handshake = setTimeout(
      () => fail(`Alcor Signer did not open in time, or does not accept requests from ${location.origin}`),
      HANDSHAKE_MS
    )

    const closeWatch = setInterval(() => {
      if (popup.closed) finish(new SignerRejected('The Alcor Signer window was closed'))
    }, CLOSE_POLL_MS)

    window.addEventListener('message', onMessage)
  })
}
