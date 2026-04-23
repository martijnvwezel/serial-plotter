import * as vscode from "vscode";

// Message types for communication between main panel and sidebar
export interface VariableConfigUpdate {
    type: "variable-config-update";
    variableConfig: Record<string, { color: string; visablename: string }>;
    variableMap: Array<[string, number[]]>;
}

export interface VariableConfigChanged {
    type: "variable-config-changed";
    variableConfig: Record<string, { color: string; visablename: string }>;
}

export interface ResetBuffer {
    type: "reset-buffer";
}

export class SidebarProvider implements vscode.WebviewViewProvider {
    public static readonly viewType = "serialplotter.sidebar";

    private _view?: vscode.WebviewView;
    private _extensionUri: vscode.Uri;

    // Cached state to re-send when sidebar becomes visible again
    private _lastVariableConfig: Record<string, { color: string; visablename: string }> = {};
    private _lastVariableMap: Map<string, number[]> = new Map();
    
    // Callback to notify main panel of changes
    public onVariableConfigChanged?: (config: Record<string, { color: string; visablename: string }>) => void;
    public onResetBuffer?: () => void;
    public onDragStart?: (variableKey: string) => void;
    public onSaveSettings?: (settings: { defaultBaudRate: number; autoVariableUpdateOnStart: boolean; defaultScreen: 'plot' | 'raw'; defaultSidebarVisible: boolean; defaultXMode: 'scroll' | 'burst' | 'none' }) => void;
    public onRequestSettings?: () => void;

    constructor(extensionUri: vscode.Uri) {
        this._extensionUri = extensionUri;
    }

    public resolveWebviewView(
        webviewView: vscode.WebviewView,
        _context: vscode.WebviewViewResolveContext,
        _token: vscode.CancellationToken
    ): void | Thenable<void> {
        this._view = webviewView;

        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [this._extensionUri]
        };

        webviewView.webview.html = this._getHtmlContent(webviewView.webview);

        // Re-send cached state when the sidebar becomes visible again (e.g. switching tabs)
        webviewView.onDidChangeVisibility(() => {
            if (webviewView.visible) {
                this._resendState();
            }
        });

        // Send cached state after initial resolve (with a small delay so the script loads)
        setTimeout(() => this._resendState(), 100);

        // Handle messages from the sidebar webview
        webviewView.webview.onDidReceiveMessage((message) => {
            switch (message.type) {
                case "variable-config-changed":
                    if (this.onVariableConfigChanged) {
                        this.onVariableConfigChanged(message.variableConfig);
                    }
                    break;
                case "reset-buffer":
                    if (this.onResetBuffer) {
                        this.onResetBuffer();
                    }
                    break;
                case "drag-start":
                    if (this.onDragStart) {
                        this.onDragStart(message.variableKey);
                    }
                    break;
                case "open-plotter":
                    vscode.commands.executeCommand("serialplotter.open");
                    break;
                case "save-settings":
                    if (this.onSaveSettings) {
                        this.onSaveSettings({ defaultBaudRate: message.defaultBaudRate, autoVariableUpdateOnStart: message.autoVariableUpdateOnStart, defaultScreen: message.defaultScreen, defaultSidebarVisible: message.defaultSidebarVisible, defaultXMode: message.defaultXMode ?? 'scroll' });
                    }
                    break;
                case "request-settings":
                    if (this.onRequestSettings) {
                        this.onRequestSettings();
                    }
                    break;
            }
        });
    }

    // Update sidebar with new variable data from main panel
    public updateVariables(
        variableConfig: Record<string, { color: string; visablename: string }>,
        variableMap: Map<string, number[]>
    ): void {
        // Cache the latest state so we can restore it when the sidebar re-appears
        this._lastVariableConfig = variableConfig;
        this._lastVariableMap = variableMap;

        if (this._view?.visible) {
            const message: VariableConfigUpdate = {
                type: "variable-config-update",
                variableConfig,
                variableMap: Array.from(variableMap.entries())
            };
            this._view.webview.postMessage(message);
        }
    }

    // Re-send cached state to the sidebar webview
    private _resendState(): void {
        if (!this._view?.visible) return;
        if (Object.keys(this._lastVariableConfig).length > 0) {
            const message: VariableConfigUpdate = {
                type: "variable-config-update",
                variableConfig: this._lastVariableConfig,
                variableMap: Array.from(this._lastVariableMap.entries())
            };
            this._view.webview.postMessage(message);
        }
        // Also re-request settings so they display correctly
        if (this.onRequestSettings) {
            this.onRequestSettings();
        }
    }

    // Send current settings to sidebar webview
    public sendSettings(settings: { defaultBaudRate: number; autoVariableUpdateOnStart: boolean; defaultScreen: 'plot' | 'raw'; defaultSidebarVisible: boolean; defaultXMode: 'scroll' | 'burst' | 'none' }): void {
        if (this._view) {
            this._view.webview.postMessage({ type: "settings-response", ...settings });
        }
    }

    private _getHtmlContent(webview: vscode.Webview): string {
        const scriptUri = webview.asWebviewUri(
            vscode.Uri.joinPath(this._extensionUri, "build", "sidebar.js")
        );
        let appVersion = 'DEVELOPMENT';
        try {
            // eslint-disable-next-line @typescript-eslint/no-var-requires
            appVersion = require(vscode.Uri.joinPath(this._extensionUri, 'package.json').fsPath).version || 'DEVELOPMENT';
        } catch {}

        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Serial Plotter Sidebar</title>
    <style>
        * {
            box-sizing: border-box;
        }
        html, body {
            padding: 0;
            margin: 0;
            height: 100%;
            background: transparent;
            font-family: var(--vscode-font-family);
            font-size: var(--vscode-font-size);
            color: var(--vscode-foreground);
        }
    </style>
</head>
<body>
    <div id="sidebar-root"></div>
    <script>window.__APP_VERSION__ = "${appVersion}";</script>
    <script src="${scriptUri}"></script>
</body>
</html>`;
    }
}
