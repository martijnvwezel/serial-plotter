import * as vscode from "vscode";
import { info, initLog } from "./log";
import { SerialPort } from "serialport";
import { ReadlineParser } from "serialport";

let panel: vscode.WebviewPanel | undefined;
let port: SerialPort | undefined;

export async function activate(context: vscode.ExtensionContext) {
	initLog();

	const PANEL_STATE_KEY = 'serialplotter.panelOpen';

	function openPanel() {
		if (panel) {
			panel.reveal(vscode.ViewColumn.One);
		} else {
			panel = vscode.window.createWebviewPanel("serialPlotter", "Serial Plotter", vscode.ViewColumn.One, {
				enableScripts: true,
				localResourceRoots: [vscode.Uri.file(context.extensionPath)],
				retainContextWhenHidden: true
			});

			panel.webview.html = getWebviewContent(panel.webview, context.extensionUri);

			// Persist that the panel is open
			context.globalState.update(PANEL_STATE_KEY, true);

			panel.onDidDispose(
				() => {
					panel = undefined;
					if (port) {
						port.close();
						port = undefined;
						info(`Stopped monitoring port`);
					}
					// Persist that the panel is closed
					context.globalState.update(PANEL_STATE_KEY, false);
				},
				null,
				context.subscriptions
			);

			panel.webview.onDidReceiveMessage(
				(message) => {
					processProtocolMessage(message as ProtocolRequests);
				},
				undefined,
				context.subscriptions
			);
		}
	}

	const command = vscode.commands.registerCommand("serialplotter.open", openPanel);
	context.subscriptions.push(command);

	// Auto-reopen panel if it was open before reload
	if (context.globalState.get(PANEL_STATE_KEY)) {
		openPanel();
	}
}

function getWebviewContent(webview: vscode.Webview, extensionUri: vscode.Uri) {
	const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, "build", "webview.js"));

	return `<!DOCTYPE html>
<html lang="en">
<head>
	<meta charset="UTF-8">
	<meta name="viewport" content="width=device-width, initial-scale=1.0">
	<title>Serial Plotter</title>
	<style>
		* {
			box-sizing: border-box;
		}

		html, body {
			padding: 0;
			margin: 0;
		}

		body {
			padding: 1rem;
		}
	</style>
</head>
<body>
	<script src="${scriptUri}"></script>
</body>
</html>`;
}

async function processProtocolMessage(message: ProtocolRequests) {
	switch (message.type) {
		case "ports": {
			const ports = await SerialPort.list();
			const response: PortsResponse = {
				type: "ports-response",
				ports:
					ports?.map((p) => {
						const port: Port = {
							path: p.path,
							manufacturer: p.manufacturer
						}
						return port;
					}) ?? []
			};
			panel?.webview.postMessage(response);
			info("Listing ports:");
			for (const port of ports) {
				info(JSON.stringify(port));
			}
			break;
		}
		case "start-monitor": {
			if (port) {
				port.close();
				port = undefined;
			}
			port = new SerialPort({ path: message.port, baudRate: message.baudRate, lock: false }, (err) => {
				if (err) {
					info("Error on port " + message.port + ", closing.");
					port?.close();
					port = undefined;
					const error: ErrorResponse = {
						type: "error",
						text: `Port ${message.port} closed`
					}
					panel?.webview.postMessage(error);
				}
			});
			const lineStream = port.pipe(new ReadlineParser({delimiter: "\r\n"}))
			lineStream.on("data", (chunk: any) => {
				const data: DataResponse = {
					type: "data",
					text: chunk + "\r\n"
				}
				panel?.webview.postMessage(data);
			})
			info(`Started monitoring port ${message.port}`);
			break;
		}
		case "stop-monitor": {
			if (port) {
				port.close();
				port = undefined;
				info(`Stopped monitoring port`);
			}
			break;
		}
	   case "save-csv": {
			   const vscode = require('vscode');
			   try {
					   const uri = await vscode.window.showSaveDialog({
							   defaultUri: vscode.Uri.file(message.filename),
							   filters: { 'CSV Files': ['csv'], 'All Files': ['*'] }
					   });
					   if (uri) {
							   const enc = new TextEncoder();
							   await vscode.workspace.fs.writeFile(uri, enc.encode(message.content));
							   panel?.webview.postMessage({ type: 'save-csv-result', success: true, filename: uri.fsPath });
					   } else {
							   panel?.webview.postMessage({ type: 'save-csv-result', success: false });
					   }
			   } catch (e) {
					   panel?.webview.postMessage({ type: 'save-csv-result', success: false });
			   }
			   break;
	   }
	   default:
			   info(`Unknown message: ${JSON.stringify(message, null, 2)}`);
	   }
}

export function deactivate() {}

