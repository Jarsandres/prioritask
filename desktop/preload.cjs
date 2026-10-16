// @ts-check
const { contextBridge, ipcRenderer } = require("electron");

/**
 * Preload script seguro con contextIsolation activado y nodeIntegration desactivado.
 * Expone de forma controlada y segura las capacidades nativas en window.prioritaskDesktop.
 */
contextBridge.exposeInMainWorld("prioritaskDesktop", {
  isDesktop: true,
  platform: process.platform,
  version: "1.0.0",

  safeStorage: {
    isAvailable: () => ipcRenderer.invoke("safestorage:is-available"),
    encryptString: (plaintext) => {
      if (typeof plaintext !== "string") {
        return Promise.reject(new TypeError("plaintext must be a string"));
      }
      return ipcRenderer.invoke("safestorage:encrypt", plaintext);
    },
    decryptString: (ciphertext) => {
      if (typeof ciphertext !== "string") {
        return Promise.reject(new TypeError("ciphertext must be a string"));
      }
      return ipcRenderer.invoke("safestorage:decrypt", ciphertext);
    },
  },

  ipc: {
    sendRequestSync: () => {
      ipcRenderer.send("desktop:sendRequestSync");
    },
    onWakeup: (callback) => {
      const listener = () => callback();
      ipcRenderer.on("desktop:onWakeup", listener);
      return () => {
        ipcRenderer.removeListener("desktop:onWakeup", listener);
      };
    },
    onAddTask: (callback) => {
      const listener = (_event, task) => callback(task);
      ipcRenderer.on("desktop:onAddTask", listener);
      return () => {
        ipcRenderer.removeListener("desktop:onAddTask", listener);
      };
    },
    quickAddAddTask: (taskData) => {
      ipcRenderer.send("desktop:quickAddAddTask", taskData);
    },
    setMainLogicWindow: (isMain) => {
      ipcRenderer.send("desktop:setMainLogicWindow", Boolean(isMain));
    },
  },
});
