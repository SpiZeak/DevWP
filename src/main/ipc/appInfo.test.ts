import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ipcMain, app, type IpcMainInvokeEvent } from 'electron'
import { registerAppInfoHandlers } from './appInfo'

vi.mock('electron', () => ({
  ipcMain: {
    handle: vi.fn()
  },
  app: {
    getVersion: vi.fn().mockReturnValue('1.2.3')
  }
}))

describe('App Info IPC Handlers', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('registers the get-app-version handler', () => {
    registerAppInfoHandlers()

    expect(ipcMain.handle).toHaveBeenCalledWith('get-app-version', expect.any(Function))
  })

  it('returns the application version when invoked', async () => {
    registerAppInfoHandlers()

    const handler = vi
      .mocked(ipcMain.handle)
      .mock.calls.find((call) => call[0] === 'get-app-version')?.[1]

    const result = await handler!({} as IpcMainInvokeEvent)

    expect(app.getVersion).toHaveBeenCalled()
    expect(result).toBe('1.2.3')
  })
})
