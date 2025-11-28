import * as vscode from "vscode";
import { info, initLog } from "./log";
import { SerialPort } from "serialport";
import { ReadlineParser } from "serialport";

let panel: vscode.WebviewPanel | undefined;
let port: SerialPort | undefined;
let reconnectTimer: NodeJS.Timeout | undefined;
let lastDeviceId: { vendorId?: string; productId?: string; serialNumber?: string; path?: string } | undefined;
let lastBaudRate: number = 115200;
let isMonitoring: boolean = false;

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
					info("Panel disposed - cleaning up resources");
					
					// Stop reconnect polling
					if (reconnectTimer) {
						clearInterval(reconnectTimer);
						reconnectTimer = undefined;
					}
					
					// Close and cleanup serial port
					if (port) {
						try {
							port.removeAllListeners(); // Remove all event listeners
							port.close();
							info("Closed serial port on panel dispose");
						} catch (err: any) {
							info(`Error closing port on dispose: ${err.message}`);
						}
						port = undefined;
					}
					
					// Reset state
					isMonitoring = false;
					lastDeviceId = undefined;
					panel = undefined;
					
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
							manufacturer: p.manufacturer,
							vendorId: p.vendorId,
							productId: p.productId,
							serialNumber: p.serialNumber,
							pnpId: p.pnpId
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
			lastBaudRate = message.baudRate;
			if (message.deviceId) {
				lastDeviceId = { ...message.deviceId, path: message.port };
			} else {
				lastDeviceId = { path: message.port };
			}
			await startMonitoring(message.port, message.baudRate);
			break;
		}
		case "stop-monitor": {
			stopMonitoring();
			break;
		}
		case "reconnect": {
			await attemptReconnect();
			break;
		}
		case "send-command": {
			if (port && port.isOpen) {
				try {
					// Add newline to command if not present
					const command = message.command.endsWith('\n') ? message.command : message.command + '\n';
					port.write(command, (err) => {
						if (err) {
							info(`Error sending command: ${err.message}`);
							const error: ErrorResponse = {
								type: "error",
								text: `Failed to send command: ${err.message}`
							};
							panel?.webview.postMessage(error);
						} else {
							info(`Sent command: ${message.command}`);
						}
					});
				} catch (err: any) {
					info(`Error sending command: ${err.message}`);
					const error: ErrorResponse = {
						type: "error",
						text: `Failed to send command: ${err.message}`
					};
					panel?.webview.postMessage(error);
				}
			} else {
				const error: ErrorResponse = {
					type: "error",
					text: "Cannot send command: port not connected"
				};
				panel?.webview.postMessage(error);
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

export function deactivate() {
	// Clean up everything when extension is deactivated
	info("Extension deactivating - cleaning up resources");
	
	// Stop reconnect polling
	if (reconnectTimer) {
		clearInterval(reconnectTimer);
		reconnectTimer = undefined;
	}
	
	// Close serial port
	if (port) {
		try {
			port.close();
			info("Closed serial port during deactivation");
		} catch (err: any) {
			info(`Error closing port during deactivation: ${err.message}`);
		}
		port = undefined;
	}
	
	// Dispose panel
	if (panel) {
		panel.dispose();
		panel = undefined;
	}
	
	// Reset state
	isMonitoring = false;
	lastDeviceId = undefined;
	lastBaudRate = 115200;
}

async function startMonitoring(portPath: string, baudRate: number) {
	// Clean up existing port before starting new one
	if (port) {
		info("Cleaning up existing port before starting new monitoring");
		try {
			port.removeAllListeners();
			port.close();
		} catch (err: any) {
			info(`Error cleaning up old port: ${err.message}`);
		}
		port = undefined;
	}
	
	// Stop any existing reconnect timer
	if (reconnectTimer) {
		clearInterval(reconnectTimer);
		reconnectTimer = undefined;
	}
	
	try {
		port = new SerialPort({ path: portPath, baudRate: baudRate, lock: false }, (err) => {
			if (err) {
				info("Error on port " + portPath + ": " + err.message);
				port?.close();
				port = undefined;
				isMonitoring = false;
				const error: ErrorResponse = {
					type: "error",
					text: `Port ${portPath} closed: ${err.message}`
				}
				panel?.webview.postMessage(error);
				
				// Start auto-reconnect polling
				if (!reconnectTimer) {
					startReconnectPolling();
				}
			}
		});
		
		port.on('close', () => {
			info(`Port ${portPath} closed unexpectedly`);
			port = undefined;
			isMonitoring = false;
			const status: ConnectionStatusResponse = {
				type: "connection-status",
				connected: false,
				message: "Device disconnected"
			};
			panel?.webview.postMessage(status);
			
			// Start auto-reconnect polling
			if (!reconnectTimer) {
				startReconnectPolling();
			}
		});
		
		port.on('error', (err) => {
			info(`Port error: ${err.message}`);
			const error: ErrorResponse = {
				type: "error",
				text: `Port error: ${err.message}`
			};
			panel?.webview.postMessage(error);
		});
		
		const lineStream = port.pipe(new ReadlineParser({delimiter: "\r\n"}));
		lineStream.on("data", (chunk: any) => {
			const data: DataResponse = {
				type: "data",
				text: chunk + "\r\n"
			}
			panel?.webview.postMessage(data);
		});
		
		isMonitoring = true;
		info(`Started monitoring port ${portPath} at ${baudRate} baud`);
		
		const status: ConnectionStatusResponse = {
			type: "connection-status",
			connected: true,
			message: "Connected"
		};
		panel?.webview.postMessage(status);
		
	} catch (err: any) {
		info(`Failed to open port ${portPath}: ${err.message}`);
		const error: ErrorResponse = {
			type: "error",
			text: `Failed to open port: ${err.message}`
		};
		panel?.webview.postMessage(error);
		
		// Start auto-reconnect polling
		if (!reconnectTimer) {
			startReconnectPolling();
		}
	}
}

function stopMonitoring() {
	info("Stopping monitoring - cleaning up resources");
	
	// Stop reconnect polling
	if (reconnectTimer) {
		clearInterval(reconnectTimer);
		reconnectTimer = undefined;
	}
	
	// Close and cleanup serial port
	if (port) {
		try {
			port.removeAllListeners(); // Remove all event listeners to prevent memory leaks
			port.close();
			info("Stopped monitoring and closed port");
		} catch (err: any) {
			info(`Error closing port: ${err.message}`);
		}
		port = undefined;
	}
	
	// Reset state
	isMonitoring = false;
	lastDeviceId = undefined;
	
	// Notify webview
	const status: ConnectionStatusResponse = {
		type: "connection-status",
		connected: false,
		message: "Stopped"
	};
	panel?.webview.postMessage(status);
}

function startReconnectPolling() {
	if (reconnectTimer) {
		return; // Already polling
	}
	
	info("Starting auto-reconnect polling every 2 seconds");
	reconnectTimer = setInterval(async () => {
		if (!isMonitoring && lastDeviceId) {
			await attemptReconnect();
		}
	}, 2000); // Poll every 2 seconds
}

async function attemptReconnect() {
	if (!lastDeviceId || isMonitoring) {
		return;
	}
	
	info("Attempting to reconnect to device...");
	const ports = await SerialPort.list();
	
	// Try to find device by USB identifiers
	let matchedPort = undefined;
	
	if (lastDeviceId.vendorId && lastDeviceId.productId) {
		// Match by vendor/product ID (most reliable)
		matchedPort = ports.find(p => 
			p.vendorId === lastDeviceId!.vendorId && 
			p.productId === lastDeviceId!.productId &&
			(!lastDeviceId!.serialNumber || p.serialNumber === lastDeviceId!.serialNumber)
		);
		
		if (matchedPort) {
			info(`Found device by USB ID: ${matchedPort.path} (was ${lastDeviceId.path})`);
		}
	}
	
	// Fallback: try original path
	if (!matchedPort && lastDeviceId.path) {
		matchedPort = ports.find(p => p.path === lastDeviceId!.path);
		if (matchedPort) {
			info(`Found device at original path: ${matchedPort.path}`);
		}
	}
	
	if (matchedPort) {
		info(`Reconnecting to ${matchedPort.path}...`);
		lastDeviceId.path = matchedPort.path; // Update path
		
		// Send updated port list to webview so it can update the dropdown
		const response: PortsResponse = {
			type: "ports-response",
			ports: ports?.map((p) => {
				const port: Port = {
					path: p.path,
					manufacturer: p.manufacturer,
					vendorId: p.vendorId,
					productId: p.productId,
					serialNumber: p.serialNumber,
					pnpId: p.pnpId
				}
				return port;
			}) ?? []
		};
		panel?.webview.postMessage(response);
		
		await startMonitoring(matchedPort.path, lastBaudRate);
	} else {
		info("Device not found, will retry...");
	}
}


