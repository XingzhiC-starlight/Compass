// What the desktop window's page is given beyond a web page's own (spec §22): a way to hand a
// request for the local database to the main process, which holds the file; a way to ask for
// its main window to be shown; and a way to hear that a thought is to be captured. The page
// gets no Node, no Electron and no disk. This file is CommonJS because a sandboxed preload
// must be, and it is loaded as it stands, unbuilt.
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("compassDesktop", {
  send: (request) => ipcRenderer.invoke("compass:database", request),
  show: () => ipcRenderer.send("compass:show-window"),
  // The listener is called with nothing, and the answer stops the listening.
  onCapture: (listener) => {
    const heard = () => listener();
    ipcRenderer.on("compass:capture", heard);
    return () => ipcRenderer.removeListener("compass:capture", heard);
  },
});
