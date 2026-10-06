export type Tps = { value: number; isLive: boolean }

declare module 'claude-code' {
  interface PluginState {
    'tps-meter': { tps: Tps | null }
  }
}
