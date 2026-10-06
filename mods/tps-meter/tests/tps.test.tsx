import { expect, mock, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import type { On, TurnStepChunk } from 'claude-code'

const STEP = { turnId: 't1', index: 0, model: 'claude-opus-5-5', messageCount: 1 }
const USAGE = { input_tokens: 1, output_tokens: 60, cache_read_input_tokens: 0, cache_creation_input_tokens: 0, model: 'm' }
const PROMPT_HINT = { isDraft: false, isWorking: true, hint: 'esc to interrupt' }
const SESSION_MODE = { modes: ['focus'] }

type Surface = 'terminal' | 'desktop'

// Stands in for the engine's own drawing, which runs only when the plugin passes.
const drawEngineDefaults = (on: On) => {
  on('ui.render', { component: 'PromptHint' }, ($, e) => {
    const { Text } = $.ui.resolve(e)
    return <Text>{`${e.props.hint}${e.props.tail ?? ''}`}</Text>
  })
  on('ui.render', { component: 'SessionMode' }, ($, e) => {
    const { Text } = $.ui.resolve(e)
    return <Text>{e.props.modes.join(' & ')}</Text>
  })
}

const mountReadout = ($: Engine, surface: Surface) =>
  surface === 'terminal'
    ? $.ui.mount({ plugin: 'tps-meter', surface, component: 'PromptHint', props: PROMPT_HINT })
    : $.ui.mount({ plugin: 'tps-meter', surface, component: 'SessionMode', props: SESSION_MODE })

const readout = async (ui: Awaited<ReturnType<typeof mountReadout>>) => {
  const found = await ui.find({ type: 'Text', text: /tok\/s/ })
  return found?.text.match(/[⚡·] [\d.]+ tok\/s/)?.[0]
}

for (const surface of ['terminal', 'desktop'] as const) {
  // Each clock advance with the stream in flight costs the kit over a second of real time to settle.
  test(`${surface}: live estimate while streaming, exact rate at stop`, { timeoutMs: 30000 }, async ($, on) => {
    const clock = mock.clock(on)
    const seen: (string | undefined)[] = []
    drawEngineDefaults(on)

    on('turn.step', async function* () {
      for (let i = 0; i < 4; i++) {
        await clock.sleep(300)
        yield { kind: 'text', index: 0, text: 'abcdefgh' } satisfies TurnStepChunk
      }
      await clock.sleep(300)
      yield { kind: 'stop', stopReason: 'end_turn', usage: USAGE } satisfies TurnStepChunk
      return { turnId: 't1', index: 0, answer: '', toolUses: [], stopReason: 'end_turn', usage: USAGE }
    })

    const ui = await mountReadout($, surface)
    expect(await readout(ui)).toBeUndefined()

    const drained = (async () => {
      for await (const _ of $.turn.step(STEP)) {
      }
    })()
    // Reading the drawing from inside the stream would wait on the stream itself.
    for (let i = 0; i < 5; i++) {
      await clock.advance(300)
      seen.push(await readout(ui))
    }
    await drained

    expect(seen.some(value => value?.startsWith('⚡'))).toBe(true)
    // First text at t=300, stop at t=1500: 60 tokens over 1.2 s.
    expect(await readout(ui)).toBe('· 50.0 tok/s')
    await ui.unmount()
  })
}
