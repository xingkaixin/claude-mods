import { expect, mock, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import type { On, TurnStepChunk } from 'claude-code'

const STEP = { turnId: 't1', index: 0, model: 'claude-opus-5-5', messageCount: 1 }
const USAGE = { input_tokens: 1, output_tokens: 60, cache_read_input_tokens: 0, cache_creation_input_tokens: 0, model: 'm' }
const PROMPT_HINT = { isDraft: false, isWorking: true, hint: 'esc to interrupt' }
const ABOVE_PROMPT = { hasSurvey: false, isWorking: true, maxRows: 12, bodyColumns: 80, scroll: { offset: 0, bodyRows: 12 }, view: {} }

type Surface = 'terminal' | 'desktop'

// Stands in for the engine's own drawing, which runs only when the plugin passes.
const drawEngineDefaults = (on: On) => {
  on('ui.render', { component: 'PromptHint' }, ($, e) => {
    const { Text } = $.ui.resolve(e)
    return <Text>{`${e.props.hint}${e.props.tail ?? ''}`}</Text>
  })
  on('ui.render', { component: 'AbovePrompt' }, ($, e) => {
    const { Box } = $.ui.resolve(e)
    return <Box />
  })
}

const mountReadout = ($: Engine, surface: Surface) =>
  surface === 'terminal'
    ? $.ui.mount({ plugin: 'tps-meter', surface, component: 'PromptHint', props: PROMPT_HINT })
    : $.ui.mount({ plugin: 'tps-meter', surface, component: 'AbovePrompt', props: ABOVE_PROMPT })

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
    // Request sent at t=0, stop at t=1500: 60 tokens over 1.5 s.
    expect(await readout(ui)).toBe('· 40.0 tok/s')
    await ui.unmount()
  })
}
