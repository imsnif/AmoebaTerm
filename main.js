'use strict'

const electron = require('electron')

const app = electron.app
const ipcMain = electron.ipcMain
const globalShortcut = electron.globalShortcut
const TerminalWindow = require('electron-terminal-window')

const Grid = require('grid')
const grids = {}

const tracker = {
  currentScreenIndex: 0,
  currentWindowIndex: undefined
}

const skippedInitial = {}

function switchScreen() {
  tracker.currentScreenIndex = Object.keys(grids).length > tracker.currentScreenIndex + 1
    ? tracker.currentScreenIndex + 1
    : 0
  tracker.currentWindowIndex = undefined
}

function switchWindow(curScreen, givenIndex) {
  let windowIndex
  try {
    if (typeof givenIndex !== 'undefined' && givenIndex === tracker.currentWindowIndex) {
      const err = new Error('no more windows!')
      err.origin = 'switchWindow'
      throw err
    }
    windowIndex = typeof givenIndex === 'undefined'
      ? tracker.currentWindowIndex - 1
      : givenIndex
    grids[curScreen].getPane(windowIndex)
    tracker.currentWindowIndex = windowIndex
    grids[curScreen].getPane(windowIndex).wrapped.focus()
  } catch (e) {
    if (e.name === 'AssertionError') {
      windowIndex = e.message.match(/^-?\d+/g)[0]
      if (windowIndex < skippedInitial[curScreen]) {
        const lastPaneIndex = grids[curScreen].panes.length - 1
        const lastIndex = grids[curScreen].panes[lastPaneIndex].id
        return switchWindow(curScreen, lastIndex)
      } else {
        return switchWindow(curScreen, windowIndex - 1)
      }
    } else if (e.origin === 'switchWindow') {
      const lastPaneIndex = grids[curScreen].panes.length - 1
      const lastPane = grids[curScreen].panes[lastPaneIndex]
      lastPane.wrapped.focus()
      tracker.currentWindowIndex = lastPane.id
    }
  }
}

function closeWindow(curScreen) {
  if (grids[curScreen].panes.length > 0) {
    grids[curScreen].remove(tracker.currentWindowIndex)
    try {
      grids[curScreen].getPane(tracker.currentWindowIndex - 1)
      tracker.currentWindowIndex = tracker.currentWindowIndex - 1
      grids[curScreen].getPane(tracker.currentWindowIndex).wrapped.focus()
    } catch (e) {
      try {
        const lastPaneIndex = grids[curScreen].panes.length - 1
        const lastPaneId = grids[curScreen].panes[lastPaneIndex].id
        grids[curScreen].getPane(lastPaneId)
        tracker.currentWindowIndex = lastPaneId
        grids[curScreen].getPane(lastPaneId).wrapped.focus()
      } catch (e) {
        console.error('no more windows left!')
        tracker.currentWindowIndex = false
      }
    }
  }
}

function toggleAllShow(curScreen) {
  const curGrid = grids[curScreen]
  curGrid.minimized = curGrid.minimized || false
  if (curGrid.minimized) {
    grids[curGrid].panes.filter(w => w.wrapped && w.wrapped.restore).forEach(w => w.wrapped.restore())
  } else {
    grids[grid].panes.filter(w => w.wrapped && w.wrapped.minimize).forEach(w => w.wrapped.minimize())
  }
  curGrid.minimized = !curGrid.minimized
}

function createWindow (curScreen) {
  try {
    const lastPaneIndex = grids[curScreen].panes.length - 1
    const nextWindowIndex = grids[curScreen].panes.length === skippedInitial[curScreen]
      ? skippedInitial[curScreen]
      : grids[curScreen].panes[lastPaneIndex].id + 1
    grids[curScreen].add(TerminalWindow, {
      id: nextWindowIndex,
      width: 400,
      height: 300,
      frame: false,
      skipTaskbar: true
    })
    tracker.currentWindowIndex = nextWindowIndex
  } catch (e) {
    console.error(e)
  }
}

function changeCurWindow (curScreen, params) {
  const pane = grids[curScreen].getPane(tracker.currentWindowIndex)
  if (params.x || params.y) {
    try {
      pane.changeLocation(
        params.x ? pane.x + parseInt(params.x) : pane.x,
        params.y ? pane.y + parseInt(params.y) : pane.y
      )
    } catch(e) {
      console.error(e)
      // TODO: some visual indication (flash border red?)
    }
  } else { // TODO: support both
    try {
      pane.changeSize(
        params.width ? pane.width + parseInt(params.width) : pane.width,
        params.height ? pane.height + parseInt(params.height) : pane.height
      )
    } catch(e) {
      console.error(e)
      // TODO: some visual indication (flash border red?)
    }
  }
}

function maxSize (curScreen, params) {
  const pane = grids[curScreen].getPane(tracker.currentWindowIndex)
  pane.maxSize(params)
}

function maxLoc (curScreen, params) {
  const pane = grids[curScreen].getPane(tracker.currentWindowIndex)
  pane.maxLoc(params)
}

app.on('ready', () => {
  const displays = electron.screen.getAllDisplays()
  displays.forEach((display, i) => {
    const bounds = display.bounds
    const workArea = display.workArea
    const gridOffset = {x: display.bounds.x, y: display.bounds.y}
    const grid = new Grid(bounds.width, bounds.height, gridOffset)
    skippedInitial[i] = 0
    if (workArea.y > bounds.y) {
      grid.add(null, {
        id: 'taskbarTop',
        width: bounds.width,
        height: workArea.y,
        x: 0,
        y: 0
      })
      skippedInitial[i] += 1
    } else if (workArea.x > bounds.x) {
      grid.add(null, {
        id: 'taskBarLeft',
        width: workArea.x,
        height: bounds.height,
        x: 0,
        y: 0
      })
      skippedInitial[i] += 1
    } else if (workArea.height < bounds.height) {
      grid.add(null, {
        id: 'taskBarBottom',
        width: bounds.width,
        height: bounds.height - workArea.height,
        x: 0,
        y: workArea.height
      })
      skippedInitial[i] += 1
    } else if (workArea.width < bounds.width) {
      grid.add(null, {
        id: 'taskBarRight',
        width: bounds.width - workArea.width,
        height: bounds.height,
        x: workArea.width,
        y: 0
      })
      skippedInitial[i] += 1
    }
    grids[i] = grid
  })

  globalShortcut.register('Super+W', () => createWindow(tracker.currentScreenIndex))
  globalShortcut.register('Super+S', () => switchScreen(tracker.currentScreenIndex))
  globalShortcut.register('Super+A', () => toggleAllShow(tracker.currentScreenIndex))
  globalShortcut.register('Super+Q', () => switchWindow(tracker.currentScreenIndex))
  globalShortcut.register('Super+X', () => closeWindow(tracker.currentScreenIndex))
  globalShortcut.register('Super+CommandOrControl+H', () => changeCurWindow(tracker.currentScreenIndex, {x: '-30'}))
  globalShortcut.register('Super+CommandOrControl+J', () => changeCurWindow(tracker.currentScreenIndex, {y: '30'}))
  globalShortcut.register('Super+CommandOrControl+K', () => changeCurWindow(tracker.currentScreenIndex, {y: '-30'}))
  globalShortcut.register('Super+CommandOrControl+L', () => changeCurWindow(tracker.currentScreenIndex, {x: '30'}))
  globalShortcut.register('Super+Alt+H', () => changeCurWindow(tracker.currentScreenIndex, {width: '-30'}))
  globalShortcut.register('Super+Alt+J', () => changeCurWindow(tracker.currentScreenIndex, {height: '30'}))
  globalShortcut.register('Super+Alt+K', () => changeCurWindow(tracker.currentScreenIndex, {height: '-30'}))
  globalShortcut.register('Super+Alt+L', () => changeCurWindow(tracker.currentScreenIndex, {width: '30'}))
  globalShortcut.register('Super+Shift+J', () => maxSize(tracker.currentScreenIndex, {down: true}))
  globalShortcut.register('Super+Shift+K', () => maxSize(tracker.currentScreenIndex, {up: true}))
  globalShortcut.register('Super+Shift+L', () => maxSize(tracker.currentScreenIndex, {right: true}))
  globalShortcut.register('Super+Shift+H', () => maxSize(tracker.currentScreenIndex, {left: true}))
  globalShortcut.register('Super+H', () => maxLoc(tracker.currentScreenIndex, {left: true}))
  globalShortcut.register('Super+J', () => maxLoc(tracker.currentScreenIndex, {down: true}))
  globalShortcut.register('Super+K', () => maxLoc(tracker.currentScreenIndex, {up: true}))
  globalShortcut.register('Super+L', () => maxLoc(tracker.currentScreenIndex, {right: true}))
})
