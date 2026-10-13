import { atom, read, update } from 'claude-code'
import type { Register } from 'claude-code'

import type { Tps } from '../types'

const tps = atom({ plugin: 'tps-meter', key: 'tps' } as const, null)

const PUBLISH_INTERVAL_MS = 250
// Below this the elapsed time is mostly jitter, not a meaningful rate.
const MIN_ELAPSED_MS = 200

export const register: Register = on => {
  // Seeded with the usual English ratio; recalibrated from each step's real usage.
  let charsPerToken = 4

  on('turn.step', async function* ($, e, next) {
    if (e.agentId !== undefined) {
      return yield* next(e)
    }

    const startedAt = await $.clock.now()
    let lastPublishAt = 0
    let chars = 0
    let hasOutput = false
    let hasThinking = false

    const publish = (value: Tps) => update($, tps, () => value)

    for await (const chunk of next(e)) {
      if (chunk.kind === 'text' || chunk.kind === 'thinking' || chunk.kind === 'input') {
        const now = await $.clock.now()
        hasOutput = true
        hasThinking ||= chunk.kind === 'thinking'
        chars += chunk.kind === 'input' ? chunk.json.length : chunk.text.length

        const elapsed = now - startedAt
        if (elapsed >= MIN_ELAPSED_MS && now - lastPublishAt >= PUBLISH_INTERVAL_MS) {
          lastPublishAt = now
          await publish({ value: chars / charsPerToken / (elapsed / 1000), isLive: true })
        }
      }

      if (chunk.kind === 'stop' && hasOutput) {
        const elapsed = (await $.clock.now()) - startedAt
        const tokens = chunk.usage?.output_tokens ?? 0

        // output_tokens counts thinking even when its text is withheld, which would skew the ratio.
        if (tokens > 0 && chars > 0 && !hasThinking) {
          charsPerToken = chars / tokens
        }

        if (tokens > 0 && elapsed >= MIN_ELAPSED_MS) {
          await publish({ value: tokens / (elapsed / 1000), isLive: false })
        } else {
          const last = await read($, tps)
          if (last?.isLive) await publish({ ...last, isLive: false })
        }
      }

      yield chunk
    }
  })

  const label = (current: Tps) => `${current.isLive ? '⚡' : '·'} ${current.value.toFixed(1)} tok/s`

  on('ui.render', { component: 'PromptHint' }, async ($, e, next) => {
    const current = await read($, tps)
    if (current === null || e.surface !== 'terminal') {
      return next(e)
    }

    return next({ ...e, props: { ...e.props, tail: `  ${label(current)}` } })
  })

  // Only the terminal draws PromptHint's tail. The desktop draws a SessionMode tree in its footer,
  // but not a rewritten `modes`, so the readout is drawn as our own tree around the engine's.
  on('ui.render', { component: 'SessionMode' }, async ($, e, next) => {
    if (e.surface === 'terminal') {
      return next(e)
    }

    const current = await read($, tps)
    const { Box, Text } = $.ui.resolve(e)
    const below = await next(e)

    return (
      <Box flexDirection="row" alignItems="center" gap={1}>
        <Text dimColor>{current === null ? '– tok/s' : label(current)}</Text>
        {below}
      </Box>
    )
  })
}
