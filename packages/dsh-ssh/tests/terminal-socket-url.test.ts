/**
 * Issue #1744: the terminal tab of the official DSH Desktop client always
 * failed with "connection error" while every HTTP surface of the same panel
 * worked.
 *
 * The desktop shell serves its Web GUI from `dsh-app://app/`. Its protocol
 * handler forwards HTTP requests to the local host, but a custom scheme cannot
 * carry a WebSocket upgrade, so the client deriving `ws://app/...` from
 * `location.host` could never connect. The resolver names the web schemes
 * instead of the known application shells, so any shell an official release
 * ships is covered, and a page that genuinely cannot carry the socket is told
 * so plainly rather than reported as a generic transport error.
 */
import { describe, expect, it } from 'vitest'
import { terminalSocketUrl } from '../src/client/api.ts'

describe('terminal socket URL per page transport (issue #1744)', () => {
  it('operator dials the page origin on a plain http Web GUI', () => {
    // Given a Web GUI served over http from loopback
    // When the terminal URL is built
    // Then it is a ws URL against that exact authority
    expect(terminalSocketUrl({ protocol: 'http:', host: '127.0.0.1:3080' }, '?alias=a&cols=80'))
      .toBe('ws://127.0.0.1:3080/api/dsh-ssh/terminal?alias=a&cols=80')
  })

  it('operator upgrades to wss on an https Web GUI', () => {
    // Given a Web GUI served over TLS
    // When the terminal URL is built
    // Then the socket is the secure variant, not a downgraded plain socket
    expect(terminalSocketUrl({ protocol: 'https:', host: 'dsh.example.com' }, '?session=s1'))
      .toBe('wss://dsh.example.com/api/dsh-ssh/terminal?session=s1')
  })

  it('operator is refused a socket on the desktop app scheme', () => {
    // Given the official desktop shell's page
    // When the terminal URL is built
    // Then nothing is dialled: that scheme forwards HTTP only, so a ws URL
    // could only ever surface as "connection error"
    expect(terminalSocketUrl({ protocol: 'dsh-app:', host: 'app' }, '?alias=a')).toBeUndefined()
  })

  it('operator is refused on any application scheme, not just the reported one', () => {
    // Given the same shape of page under a scheme nobody has seen yet
    // When the terminal URL is built
    // Then it is still refused, because naming the web side covers every shell
    for (const protocol of ['file:', 'app-shell:', 'dsh-app-beta:']) {
      expect(terminalSocketUrl({ protocol, host: 'app' }, '?alias=a'), protocol).toBeUndefined()
    }
  })

  it('operator keeps the network-minted documents on the web side', () => {
    // Given documents a network page can mint, which do reach a real host
    // When the terminal URL is built
    // Then they keep dialing, so only application-delivered pages are refused
    for (const protocol of ['http:', 'https:']) {
      expect(terminalSocketUrl({ protocol, host: 'example.com:3080' }, ''), protocol)
        .toBe((protocol === 'https:' ? 'wss' : 'ws') + '://example.com:3080/api/dsh-ssh/terminal')
    }
  })
})
