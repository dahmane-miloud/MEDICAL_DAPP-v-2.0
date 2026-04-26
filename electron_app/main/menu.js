const { Menu, shell, dialog } = require('electron');

function createMenu(mainWindow) {
    const template = [{
            label: 'File',
            submenu: [{
                    label: 'Open File',
                    accelerator: 'CmdOrCtrl+O',
                    click: async() => {
                        const result = await dialog.showOpenDialog(mainWindow, {
                            properties: ['openFile']
                        });
                        if (!result.canceled) {
                            mainWindow.webContents.send('file-opened', result.filePaths[0]);
                        }
                    }
                },
                {
                    label: 'Save',
                    accelerator: 'CmdOrCtrl+S',
                    click: () => {
                        mainWindow.webContents.send('save-file');
                    }
                },
                { type: 'separator' },
                {
                    label: 'Exit',
                    accelerator: 'CmdOrCtrl+Q',
                    click: () => {
                        mainWindow.close();
                    }
                }
            ]
        },
        {
            label: 'Edit',
            submenu: [
                { label: 'Undo', accelerator: 'CmdOrCtrl+Z', role: 'undo' },
                { label: 'Redo', accelerator: 'CmdOrCtrl+Y', role: 'redo' },
                { type: 'separator' },
                { label: 'Cut', accelerator: 'CmdOrCtrl+X', role: 'cut' },
                { label: 'Copy', accelerator: 'CmdOrCtrl+C', role: 'copy' },
                { label: 'Paste', accelerator: 'CmdOrCtrl+V', role: 'paste' }
            ]
        },
        {
            label: 'View',
            submenu: [
                { label: 'Reload', accelerator: 'CmdOrCtrl+R', role: 'reload' },
                { label: 'Toggle Developer Tools', accelerator: 'F12', role: 'toggleDevTools' },
                { type: 'separator' },
                { label: 'Zoom In', accelerator: 'CmdOrCtrl+Plus', role: 'zoomIn' },
                { label: 'Zoom Out', accelerator: 'CmdOrCtrl+-', role: 'zoomOut' },
                { label: 'Reset Zoom', accelerator: 'CmdOrCtrl+0', role: 'resetZoom' }
            ]
        },
        {
            label: 'Help',
            submenu: [{
                    label: 'Documentation',
                    click: () => {
                        shell.openExternal('https://github.com/yourusername/medichain');
                    }
                },
                {
                    label: 'About',
                    click: () => {
                        dialog.showMessageBox(mainWindow, {
                            type: 'info',
                            title: 'About MediChain',
                            message: 'MediChain - Medical Records System',
                            detail: 'Version 1.0.0\nA secure medical records system using SSI, IPFS, and Blockchain.'
                        });
                    }
                }
            ]
        }
    ];

    return Menu.buildFromTemplate(template);
}

module.exports = { createMenu };