/* eslint-disable no-var */

declare global {
  // eslint-disable-next-line vars-on-top
  var __mcpn_cli__:
    | undefined
    | {
      entry: string
      startTime: number
    }
}

export {}
