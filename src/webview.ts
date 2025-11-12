
import { LitElement, html, nothing } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { map } from "lit/directives/map.js";
import "./components/raw_data_view";
import "./components/sidebar";
import "./components/plot_screen_fast";

interface VSCodeApi {
	postMessage(data: ProtocolRequests): void;
}
declare function acquireVsCodeApi(): VSCodeApi;
const vscode = acquireVsCodeApi() as VSCodeApi;

@customElement("serial-plotter-app")
class SerialPlotterApp extends LitElement {
  constructor() {
	super();
	this.downloadCSV = this.downloadCSV.bind(this);
  }
	@state()
	ports: Port[] = [];

	@state()
	selected: string | undefined;
	
	@state()
	selectedDevice: Port | undefined;

	@state()
	running: boolean = false;

	@state()
	error?: string;
	
	@state()
	connectionStatus?: string;

  @state()
  private screen: 'raw' | 'plot' = 'plot';
  @state()
  private fastPlot: boolean = true;
  
  @state()
  private plotInstances: number[] = [0]; // Track multiple plot instances
  
  @state()
  private sidebarVisible: boolean = true;

	@state()
	autoVariableUpdate: boolean = true;
	
	@state()
	commandInput: string = "";
	
	@state()
	commandHistory: string[] = [];
	
	@state()
	isRepeating: boolean = false;
	
	private repeatTimer: number | null = null;
	private repeatInterval: number = 1000; // 1 second default

	public lineBuffer: string[] = ["Connecting ..."];
	public variableMap: Map<string, number[]> = new Map<string, number[]>();
	public autoScrollEnabled = true;
	@state()
	public hideData = false;
	@property()
	samplesExceeded = false;

	// Buffer limits - 1GB of data
	private static readonly MAX_BUFFER_BYTES = 1 * 1024 * 1024 * 1024; // 1GB
	private static readonly BYTES_PER_NUMBER = 8; // Each number (float64) is 8 bytes
	private currentBufferBytes = 0;

	// Fake data timer
	private fakeDataTimer: number | null = null;

	@state()
	private variableConfig: Record<string, { color: string; visablename: string }> = {};
	private variableOrder: string[] = [];

  private colorPalette = [
	"#f92672", // pink
	"#a6e22e", // green
	"#66d9ef", // cyan
	"#fd971f", // orange
	"#e6db74", // yellow
	"#9e6ffe", // purple
	"#cc6633", // brown
	"#f8f8f2", // white
	// "#75715e", // comment gray
	"#ae81ff", // violet
	"#f4bf75", // gold
	"#cfcfc2", // light gray
	// "#272822", // background dark
	// "#1e0010", // dark purple
	// "#465457", // blue gray
	"#b6e354"  // lime
  ];

  firstUpdated() {
	// Listen for a custom event from sidebar-view
	const sidebar = this.renderRoot.querySelector('sidebar-view');
	if (sidebar) {
		console.log("Sidebar found, adding event listener");
		
	  sidebar.addEventListener('variable-config-changed', (e: any) => {
		
		this.variableConfig = e.detail;
		// // check why needed extra cons
		// const sidebar_ = document.querySelector('sidebar-view') as any;
		// if (sidebar_ && sidebar_.setVariableConfig === 'function') {
		// 	sidebar_.setVariableConfig(this.variableConfig);
		// }

		// Forward to plot-screen
		const plot = this.renderRoot.querySelector('plot-screen') as any;
		if (plot && typeof plot.setVariableConfig === 'function') {
		  	plot.setVariableConfig(this.variableConfig);
		
			// Also update line colors for each variable
			for (const key of Object.keys(this.variableConfig)) {
				const arr = this.variableMap.get(key);
				if (arr && arr.length > 0 && typeof plot.updateLineColors === 'function') {
					plot.updateLineColors(key, arr[arr.length - 1]);
				}
			}
			plot.renderData();
			plot.render();
		}		

		// Forward to all plot-screen-fast instances
		const plotFastElements = this.renderRoot.querySelectorAll('plot-screen-fast');
		plotFastElements.forEach((plotFast: any) => {
		  if (plotFast && typeof plotFast.setVariableConfig === 'function') {
			plotFast.setVariableConfig(this.variableConfig);
		  }
		});
	  });
	}
	
	// Listen for add-plot events from any plot instance
	this.addEventListener('add-plot', () => {
	  this.handleAddPlot();
	});
	
	// Listen for clear-buffer events from raw-data-view
	this.addEventListener('clear-buffer', () => {
	  this.handleClearBuffer();
	});
  }

  private handleAddPlot() {
	// Add a new plot instance with a unique ID
	const newId = Math.max(...this.plotInstances, 0) + 1;
	this.plotInstances = [...this.plotInstances, newId];
  }
  
  private handleClearBuffer() {
	console.log("Clearing main line buffer");
	this.lineBuffer = [];
	
	// Also clear the raw-data-view's internal buffer
	const rawDataView = this.renderRoot.querySelector('raw-data-view') as any;
	if (rawDataView) {
		rawDataView.lineBuffer = [];
	}
	
	this.requestUpdate();
  }


	private stopped = false;

	createRenderRoot(): HTMLElement {
		return this as unknown as HTMLElement;
	}

	connectedCallback(): void {
		super.connectedCallback();
		this.load();
	}

	   private _messageCallback?: (ev: { data: ProtocolResponse }) => void;

	   load() {
			   // Always add a fake port option
			   this._messageCallback = (ev: { data: ProtocolResponse }) => {
					   const message = ev.data;
					   if (message.type == "ports-response") {
							   const previouslySelected = this.selected;
							   this.ports = [
									   ...message.ports.filter(p => !p.path.startsWith('/dev/ttyS')),
									   { path: '/dev/fake_serial', manufacturer: 'Simulated' }
							   ];
							   if (previouslySelected) {
									   const matchingPort = this.ports.find((p) => p.path === previouslySelected);
									   if (matchingPort) {
											   this.selected = matchingPort.path;
											   this.selectedDevice = matchingPort;
									   }
							   }
							   if (!this.selected) {
								   this.selected = this.ports[this.ports.length - 1]?.path ?? undefined;
								   this.selectedDevice = this.ports[this.ports.length - 1];
							   }
					   }
					   if (message.type == "error") {
							   if (this.running) {
									   this.handleStartStop();
							   }
							   this.error = message.text;
					   }
					   if (message.type == "connection-status") {
						   if (message.connected) {
							   this.connectionStatus = message.message || "Connected";
							   this.error = undefined;
						   } else {
							   this.connectionStatus = message.message || "Disconnected";
						   }
					   }
					   if (message.type == "data") {
							this.handleSerialData(message.text);
					   }
			   };
			   window.addEventListener("message", this._messageCallback);
			   vscode.postMessage({ type: "ports" });
	   }

	handleFakeData() {
		this.error = "";
		this.running = true;
		this.stopped = false;
		this.lineBuffer = ["Connecting ..."];
		this.variableMap = new Map();
		let t = 0;
		const dt = 0.05;
		const fakeColors = [
			this.colorPalette[0],
			this.colorPalette[1],
			this.colorPalette[2]
		];
		const sendFakeData = () => {
			if (this.stopped) return;
			if (t % (dt * 100) === 0) {
				const now = new Date();
				const ts = now.toLocaleTimeString('en-US', { hour12: false }) + '.' + now.getMilliseconds().toString().padStart(3, '0');
				const header = `[${ts}] header   sin1:'${fakeColors[0]}' sin2:'${fakeColors[1]}' sin3:'${fakeColors[2]}'`;
				this.processData(header);
			}
			const now = new Date();
			const ts = now.toLocaleTimeString('en-US', { hour12: false }) + '.' + now.getMilliseconds().toString().padStart(3, '0');
			const s1 = Math.sin(t).toFixed(4);
			const s2 = Math.sin(t + Math.PI / 2).toFixed(4);
			const s3 = Math.sin(t + Math.PI).toFixed(4);
			const line = `[${ts}] ${s1}\t${s2}\t${s3}`;
			this.processData(line);
			t += dt;
			if (!this.stopped && this.running) {
				this.fakeDataTimer = window.setTimeout(sendFakeData, 30);
			}
		};
		sendFakeData();
	}

	handlePortChange(e: Event) {
		const target = e.target as HTMLSelectElement;
		this.selected = target.value;
		this.selectedDevice = this.ports.find(p => p.path === target.value);
	}

	handleRefresh() {
		vscode.postMessage({ type: "ports" });
	}

	// Calculate total buffer size in bytes
	private calculateBufferSize(): number {
		let totalSamples = 0;
		for (const arr of this.variableMap.values()) {
			totalSamples += arr.length;
		}
		return totalSamples * SerialPlotterApp.BYTES_PER_NUMBER;
	}

	// Trim oldest data to stay within buffer limit
	private trimBufferToLimit(): void {
		const currentSize = this.calculateBufferSize();
		if (currentSize <= SerialPlotterApp.MAX_BUFFER_BYTES) {
			this.currentBufferBytes = currentSize;
			return;
		}

		// Calculate how many samples to remove
		const bytesToRemove = currentSize - SerialPlotterApp.MAX_BUFFER_BYTES;
		const samplesToRemove = Math.ceil(bytesToRemove / SerialPlotterApp.BYTES_PER_NUMBER);
		
		// Remove samples equally from all variables
		const numVariables = this.variableMap.size;
		if (numVariables === 0) return;
		
		const samplesPerVariable = Math.ceil(samplesToRemove / numVariables);
		
		for (const [key, arr] of this.variableMap.entries()) {
			if (arr.length > samplesPerVariable) {
				this.variableMap.set(key, arr.slice(samplesPerVariable));
			}
		}
		
		this.currentBufferBytes = this.calculateBufferSize();
		this.samplesExceeded = true;
	}

	handleStartStop() {
		if (!this.selected) return;
		this.error = "";
		this.running = !this.running;
		this.stopped = !this.running;
		if (this.running) {
			// this.lineBuffer = [];
			// this.variableMap = new Map();
			// this.currentBufferBytes = 0;
			// this.samplesExceeded = false;
			// Add message event listener if not present
			if (this._messageCallback) {
					window.addEventListener("message", this._messageCallback);
			}
			if (this.selected === '/dev/fake_serial') {
					this.handleFakeData();
			} else {
					this.startSerial();
			}
		} else {
			// Clear fake data timer if running
			if (this.fakeDataTimer !== null) {
				clearTimeout(this.fakeDataTimer);
				this.fakeDataTimer = null;
			}
			// Stop command repeat if running
			if (this.isRepeating) {
				this.isRepeating = false;
				if (this.repeatTimer !== null) {
					clearInterval(this.repeatTimer);
					this.repeatTimer = null;
				}
			}
			this.stopSerial();
			// Clear data when stopping to prevent memory leak
			// this.lineBuffer = [];
			// this.variableMap = new Map();
			// this.currentBufferBytes = 0;
			// this.samplesExceeded = false;
		}
	}

	startSerial() {
		const baudRate = this.getBaudRate();
		const request: StartMonitorPortRequest = {
			type: "start-monitor",
			port: this.selected!,
			baudRate: baudRate,
			deviceId: this.selectedDevice ? {
				vendorId: this.selectedDevice.vendorId,
				productId: this.selectedDevice.productId,
				serialNumber: this.selectedDevice.serialNumber
			} : undefined
		};
		vscode.postMessage(request);
	}

   stopSerial() {
			const request: StopMonitorPortRequest = {
					type: "stop-monitor"
			};
			vscode.postMessage(request);
			// Remove all 'message' event listeners (defensive, in case of duplicates)
			// Remove the known callback
			if (this._messageCallback) {
				window.removeEventListener("message", this._messageCallback);
			}
	  // Defensive: remove any other 'message' listeners that might have been added
	  // (This is a workaround for possible duplicates; in a real app, track all added callbacks)
	  // getEventListeners is only available in Chromium DevTools, not in production browsers
	  // So we must guard against its absence
	  if (typeof window !== 'undefined' && typeof (window as any).getEventListeners === 'function') {
		  const listeners = (window as any).getEventListeners(window).message;
		  if (listeners) {
			  for (const l of listeners) {
				  window.removeEventListener("message", l.listener);
			  }
		  }
	  }
			this.stopped = true;
   }

	getBaudRate(): number {
		const baudSelect = this.querySelector<HTMLInputElement>("#baud");
		return baudSelect ? Number.parseInt(baudSelect.value) : 9600;
	}

	private handleSerialData(text: string) {
		this.processData(text);
	}

	private processData(data: string) {
		if (this.stopped) return;

		const lines = Array.isArray(data) ? data : data.split(/\r?\n/).filter((line) => line.trim() !== "");
		// Always show header in the raw text area

		this.lineBuffer.push(...lines);

		// Live update the raw-data-view if present
		const rawDataView = this.renderRoot.querySelector('raw-data-view') as any;
		if (rawDataView) {
			// Use addLine to properly trigger re-render with current timestamp setting
			rawDataView.addLine(lines);
		}
		const sidebar = document.querySelector('sidebar-view') as any;
		if (sidebar) {
			this.variableConfig = sidebar.getVariableConfig();
			this.variableOrder = Object.keys(this.variableConfig);
		}
		let variables_updated = false;
		lines.forEach((line) => {
			line = line.replace(/^\[[^\]]+\]\s*/, ""); // Remove timestamp at the start
			line = line.replace(/[\r\n]+/g, ""); //remove new lines \r \n
			// Always check for header in the line (case-insensitive, anywhere in the line)
			const headerMatch = line.match(/header\b/i);
			if (headerMatch) {
				this.parseHeaderLine(line);
				console.log("FOUND header this is now config", this.variableConfig);
				
				this.variableMap = new Map();
				const sidebar = document.querySelector('sidebar-view') as any;
				if (sidebar) {
					sidebar.setVariableConfig(this.variableConfig);
					sidebar.render();
				}

				const plotScreen = document.querySelector("plot-screen") as any;
				if (plotScreen) {
					plotScreen.setVariableConfig(sidebar.getVariableConfig());
					plotScreen.renderData();
				}
				const plotScreenFast = document.querySelector("plot-screen-fast") as any;
				if (plotScreenFast) {
					plotScreenFast.setVariableConfig(sidebar.getVariableConfig());
					plotScreenFast.renderData();
				}
				return;
			}
			// No header: update variables dynamically
			const parts = line.split(/[ \t,;]+/).filter(Boolean);
			// Only allow addin g new variables if variableConfig has fewer than parts.length
			const maxVars = Object.keys(this.variableConfig).length;
			let skip = false;
			let name = "";
			
			parts.forEach((val: string, idx: number) => {
				val = val.replace(/[{}]/g, ''); // remove { and } from val
				
				
				
				if (val.includes(':')) {
					name = val.split(':')[0];					
					if (this.autoVariableUpdate && !this.variableConfig[name]) {
						const color = this.colorPalette[idx % this.colorPalette.length];
						this.variableConfig[name] = { color, visablename: name };
						this.variableOrder.push(name);
						variables_updated = true;
					}
					skip = true;
					return
				}
				
							
					if (maxVars < (idx + 1)) {
						name = 'line' + (idx + 1);
					}
					else{
						name = this.variableOrder[idx]
					}
					if (this.autoVariableUpdate && !this.variableConfig[name]) {
						const color = this.colorPalette[idx % this.colorPalette.length];
						this.variableConfig[name] = { color, visablename: name };
						this.variableOrder.push(name);
						variables_updated = true;
					}

				// name = this.variableOrder[idx] || `line${idx + 1}`;
				// Add data to the variable
				let arr = this.variableMap.get(name) ?? [];
				const numVal = parseFloat(val);
				arr.push(!isNaN(numVal) ? numVal : 0);
				this.variableMap.set(name, arr);
				
				// Check buffer size and trim if necessary
				this.currentBufferBytes += SerialPlotterApp.BYTES_PER_NUMBER;
				if (this.currentBufferBytes > SerialPlotterApp.MAX_BUFFER_BYTES) {
					this.trimBufferToLimit();
				}

			});
		
		});


			if (sidebar && variables_updated) {
				sidebar.setVariableConfig(this.variableConfig);
				sidebar.setVariableMap(this.variableMap);
				sidebar.render();
			}

			const plotScreen = document.querySelector("plot-screen") as any;
			if (plotScreen) {
				sidebar.setVariableConfig(this.variableConfig);
				sidebar.updated(this.variableMap);
				sidebar.render();

				plotScreen.setVariableConfig(sidebar.getVariableConfig());
				plotScreen.renderData();
			}
			const plotScreenFast = document.querySelector("plot-screen-fast") as any;
			if (plotScreenFast) {
				plotScreenFast.setVariableConfig(sidebar.getVariableConfig());
				plotScreenFast.renderData();
			}
	}

	private parseHeaderLine(line: string) {
		let line_low = line.toLowerCase();
		const headerMatch = line_low.match(/^header\s+(.*)$/i);
		if (!headerMatch) return;
		const rest = headerMatch[1];
		// Accepts: headerA:'green', headerA:green, headerA:"#4d5e4d", headerA:rgb(0,255,0), headerA:rgba(1,2,3,0.5), etc.
		// Handles quoted, unquoted, hex, named, and rgb/rgba with or without spaces
		const regex = /(\w+):\s*(?:'([^']+)'|"([^"]+)"|(#\w+)|((?:rgba?|RGBA?)\s*\([^)]*\))|([a-zA-Z]+))/g;
		let match;
		this.variableConfig = {};
		this.variableOrder = []; 
		let colorIdx = 0;
	   while ((match = regex.exec(rest)) !== null) {
		   const name = match[1];
		   // Prefer single-quoted, then double-quoted, then hex, then rgb/rgba, then named
		   let color =
			   match[2] || // single-quoted
			   match[3] || // double-quoted
			   match[4] || // #hex
			   match[5] || // rgb/rgba
			   match[6] || // named
			   this.colorPalette[colorIdx % this.colorPalette.length];

		   if (color) {
			   color = color.trim();
			   // Normalize rgb/rgba: remove spaces, fix double commas, clamp to 4 components
			   const rgbRegex = /^rgba?\s*\(([^)]+)\)$/i;
			   const rgbMatch = color.match(rgbRegex);
			   if (rgbMatch) {
				   let comps = rgbMatch[1].split(',').map(s => s.trim()).filter(s => s !== "");
				   comps = comps.slice(0, 4);
				   if (comps.length === 3) {
					   color = `rgb(${comps.join(",")})`;
				   } else if (comps.length === 4) {
					   color = `rgba(${comps.join(",")})`;
				   } else {
					   color = this.colorPalette[colorIdx % this.colorPalette.length];
				   }
			   }
		   } else {
			   color = this.colorPalette[colorIdx % this.colorPalette.length];
		   }
		   this.variableConfig[name] = { color, visablename: name };
		   this.variableOrder.push(name);
		   colorIdx++;
	   }
	}

	private handleScreenToggle() {
		this.screen = this.screen === 'raw' ? 'plot' : 'raw';
	}

	private handleAutoVariableUpdateToggle() {
		this.autoVariableUpdate = !this.autoVariableUpdate;
	}
	
	private handleSidebarToggle() {
		this.sidebarVisible = !this.sidebarVisible;
	}
	
	private handleReconnect() {
		vscode.postMessage({ type: "reconnect" });
	}
	
	private handleCommandInput(e: Event) {
		const input = e.target as HTMLInputElement;
		this.commandInput = input.value;
	}
	
	private handleSendCommand() {
		if (!this.commandInput.trim()) return;
		
		vscode.postMessage({ 
			type: "send-command",
			command: this.commandInput
		});
		
		// Add to history if not already present
		if (!this.commandHistory.includes(this.commandInput)) {
			this.commandHistory = [this.commandInput, ...this.commandHistory].slice(0, 10); // Keep last 10 commands
		}
	}
	
	private handleRepeatToggle() {
		this.isRepeating = !this.isRepeating;
		
		if (this.isRepeating) {
			// Start repeating
			this.handleSendCommand(); // Send immediately
			this.repeatTimer = window.setInterval(() => {
				this.handleSendCommand();
			}, this.repeatInterval);
		} else {
			// Stop repeating
			if (this.repeatTimer !== null) {
				clearInterval(this.repeatTimer);
				this.repeatTimer = null;
			}
		}
	}
	
	private handleRepeatIntervalChange(e: Event) {
		const input = e.target as HTMLInputElement;
		this.repeatInterval = parseInt(input.value) || 1000;
		
		// Restart repeat timer with new interval if currently repeating
		if (this.isRepeating && this.repeatTimer !== null) {
			clearInterval(this.repeatTimer);
			this.repeatTimer = window.setInterval(() => {
				this.handleSendCommand();
			}, this.repeatInterval);
		}
	}
	
	private handleHistorySelect(e: Event) {
		const select = e.target as HTMLSelectElement;
		if (select.value) {
			this.commandInput = select.value;
			this.requestUpdate();
		}
	}
	   private downloadCSV() {
			   // Convert lineBuffer to CSV string
			   if (!this.lineBuffer || this.lineBuffer.length === 0) return;
			   // Remove any ANSI color codes and join lines
			   const csv = this.lineBuffer.map(line => line.replace(/\x1b\[[0-9;]*m/g, "")).join("\n");
			   // Generate filename
			   const now = new Date();
			   const yyyy = now.getFullYear();
			   const mm = String(now.getMonth() + 1).padStart(2, '0');
			   const dd = String(now.getDate()).padStart(2, '0');
			   const filename = `${yyyy}-${mm}-${dd}-muino-data_dump.csv`;
			   // Send message to extension host to save file
			   vscode.postMessage({
					   type: 'save-csv',
					   filename,
					   content: csv
			   });
	   }
private showToast(message: string) {
	let toast = document.createElement('div');
	toast.textContent = message;
	toast.style.position = 'fixed';
	toast.style.top = '24px';
	toast.style.right = '32px';
	toast.style.background = '#232323ee';
	toast.style.color = '#fff';
	toast.style.padding = '0.8em 1.6em';
	toast.style.borderRadius = '8px';
	toast.style.fontSize = '1.1em';
	toast.style.boxShadow = '0 2px 12px #0008';
	toast.style.zIndex = '9999';
	toast.style.transition = 'opacity 0.3s';
	toast.style.opacity = '1';
	document.body.appendChild(toast);
	setTimeout(() => {
		toast.style.opacity = '0';
		setTimeout(() => document.body.removeChild(toast), 300);
	}, 2000);
}
	render() {
		return html`
		 <style>
			:host {
			   --color-infill-dark: #545454;
			}
			.header {
			   display: flex;
			   flex-direction: row;
			   align-items: center;
			   justify-content: space-between;
			   background: #232323;
			   padding: 1rem 2rem 1rem 1rem;
			   border-bottom: 1px solid #444;
			}
			.header-controls {
			   display: flex;
			   flex-direction: row;
			   gap: 1.5rem;
			   align-items: center;
			}
			.selector-group {
			   display: flex;
			   flex-direction: column;
			   gap: 0.25rem;
			}
			.selector-label, .connect-label {
			   font-size: 1rem;
			   color: #e0e0e0;
			   font-weight: 500;
			   margin-bottom: 0.15rem;
			}
			select, button {
			   background: #5a5a5a;
			   color: #c3c1c1ff;
			   border: 1px solid #888;
			   border-radius: 6px;
			   padding: 0.45rem 1.1rem;
			   font-size: 1rem;
			   height: 2.4rem;
			   box-sizing: border-box;
			   transition: border 0.2s, box-shadow 0.2s;
			}
			select:focus, button:focus {
			   outline: none;
			   border: 1.5px solid #b0b0b0;
			   box-shadow: 0 0 0 2px #54545455;
			}
			select:disabled, button:disabled {
			   opacity: 0.6;
			}
			button {
			   font-weight: 600;
			   letter-spacing: 0.03em;
			   min-width: 8.5rem;
			   cursor: pointer;
			}
			.toggle-btn {
			   min-width: unset;
			   padding: 0.45rem 0.7rem;
			   margin-left: 1.5rem;
			   display: flex;
			   align-items: center;
			   gap: 0.5em;
			}
			.main-layout {
			   display: flex;
			   flex-direction: row;
			   height: calc(100vh - 70px);
			}
			.sidebar {
			   width: 320px;
			   min-width: 280px;
			   background: #232323;
			   border-right: 1px solid #444;
			   padding: 1rem 0.5rem 1rem 1rem;
			   height: 100%;
			   box-sizing: border-box;
			}
			.main-content {
			   flex: 1;
			   padding: 1.5rem;
			   overflow: auto;
			}
			.error-message {
			   border: 1px solid #300;
			   background: #cc000087;
			   color: #aaa;
			   padding: 1rem;
			   border-radius: 6px;
			   margin-top: 1rem;
			}
		 </style>
		 <div class="header">
			<div class="header-controls">
			   <div class="selector-group">
				  <span class="selector-label">Port</span>
				  <select id="port" @focus="${this.handleRefresh}" @change="${this.handlePortChange}" ?disabled="${this.running}">
					 ${map(
			this.ports,
			(p) => {
				const displayName = p.path === '/dev/fake_serial' 
					? `${p.path} - Simulated`
					: p.manufacturer 
						? `${p.path} - ${p.manufacturer}${p.vendorId ? ` (${p.vendorId}:${p.productId})` : ''}`
						: p.path;
				return html`<option value="${p.path}" ?selected="${this.selected === p.path}">${displayName}</option>`;
			}
		)}
				  </select>
			   </div>
			   <div class="selector-group">
				  <span class="selector-label">Baud Rate</span>
				  <select id="baud" default="115200" ?disabled="${this.running}">
					 <option value="110">110</option>
					 <option value="300">300</option>
					 <option value="600">600</option>
					 <option value="1200">1200</option>
					 <option value="2400">2400</option>
					 <option value="4800">4800</option>
					 <option value="9600">9600</option>
					 <option value="14400">14400</option>
					 <option value="19200">19200</option>
					 <option value="38400">38400</option>
					 <option value="57600">57600</option>
					 <option value="115200" selected>115200</option>
					 <option value="128000">128000</option>
					 <option value="256000">256000</option>
					 <option value="460800">460800</option>
					 <option value="921600">921600</option>
				  </select>
			   </div>
			   <div style="display: flex; flex-direction: column; align-items: flex-start; gap: 0.25rem; margin-left: 1.5rem;">
				  <span class="connect-label">Connect</span>
				  <button id="start" @click="${this.handleStartStop}">
					 ${this.running
				? html`<svg style="vertical-align: middle; margin-right: 0.5em;" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#e74c3c" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect x="6" y="6" width="12" height="12" rx="2" fill="#e74c3c"/></svg>Stop`
				: html`<svg style="vertical-align: middle; margin-right: 0.5em;" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#2ecc71" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polygon points="5 3 19 12 5 21 5 3" fill="#2ecc71"/></svg>Start`}
				  </button>
			   </div>
			   ${this.connectionStatus ? html`
			   <div style="display: flex; flex-direction: column; align-items: flex-start; gap: 0.25rem; margin-left: 1rem;">
				  <span class="selector-label">Status</span>
				  <div style="display: flex; align-items: center; gap: 0.5rem; height: 2.4rem;">
					 <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="${this.connectionStatus.includes('Connected') ? '#2ecc71' : '#e74c3c'}" stroke-width="2">
						<circle cx="12" cy="12" r="10" fill="${this.connectionStatus.includes('Connected') ? '#2ecc71' : '#e74c3c'}" opacity="0.3"/>
					 </svg>
					 <span style="color: #e0e0e0; font-size: 0.95rem;">${this.connectionStatus}</span>
				  </div>
			   </div>
			   ` : nothing}
			   ${!this.running && this.connectionStatus && !this.connectionStatus.includes('Connected') ? html`
			   <div style="display: flex; flex-direction: column; align-items: flex-start; gap: 0.25rem; margin-left: 1rem;">
				  <span class="selector-label">Action</span>
				  <button class="toggle-btn" @click="${this.handleReconnect}" title="Try to reconnect" style="height: 2.4rem;">
					 <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#aaa" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
						<path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.2"/>
					 </svg>
					 Reconnect
				  </button>
			   </div>
			   ` : nothing}
			</div>
			<div style="display: flex; align-items: center; gap: 0.5rem;">
			   <button class="toggle-btn" @click="${this.downloadCSV}" title="Download data">
				 <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#aaa" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right: 0.5em;">
				   <path d="M12 3v14m0 0l-4-4m4 4l4-4"/>
				   <rect x="4" y="17" width="16" height="4" rx="2" fill="#aaa" opacity="0.2"/>
				 </svg>
				 Download CSV
			   </button>

			   <button class="toggle-btn" @click="${this.handleScreenToggle}" title="Switch view">
				  ${this.screen === 'raw'
				? html`<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#aaa" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" fill="#aaa" opacity="0.2"/><polyline points="8 12 12 16 16 12" stroke="#aaa" fill="none"/></svg> Raw`
				: html`<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#aaa" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" fill="#aaa" opacity="0.2"/><polyline points="16 12 12 8 8 12" stroke="#aaa" fill="none"/></svg> Plot`}
			   </button>
			   <button class="toggle-btn" @click="${this.handleAutoVariableUpdateToggle}" title="Toggle auto variable update">
				  ${this.autoVariableUpdate
				? html`<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#2ecc71" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10" stroke="#2ecc71" stroke-width="2" fill="#2ecc71" opacity="0.2"/><path d="M8 12l2 2 4-4" stroke="#2ecc71" stroke-width="2" fill="none"/></svg> Auto Variable Update: On`
				: html`<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#e74c3c" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10" stroke="#e74c3c" stroke-width="2" fill="#e74c3c" opacity="0.2"/><line x1="8" y1="8" x2="16" y2="16" stroke="#e74c3c" stroke-width="2"/><line x1="16" y1="8" x2="8" y2="16" stroke="#e74c3c" stroke-width="2"/></svg> Auto Variable Update: Off`}
			   </button>
			   <button class="toggle-btn" @click="${this.handleSidebarToggle}" title="Toggle sidebar visibility">
				  ${this.sidebarVisible
				? html`<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#aaa" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" fill="#aaa" opacity="0.2"/><line x1="9" y1="3" x2="9" y2="21" stroke="#aaa"/></svg> Hide Sidebar`
				: html`<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#aaa" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" fill="#aaa" opacity="0.2"/><line x1="9" y1="3" x2="9" y2="21" stroke="#aaa"/></svg> Show Sidebar`}
			   </button>
			</div>
		 </div>
		 ${this.error ? html`<div class="error-message">${this.error}</div>` : nothing}
		 
		 <!-- Serial Command Sender -->
		 ${this.running ? html`
		 <div style="background: #232323; padding: 0.75rem 2rem; border-bottom: 1px solid #444;">
			<div style="display: flex; align-items: center; gap: 0.75rem;">
			   <label style="color: #e0e0e0; font-size: 0.9rem; white-space: nowrap;">Command:</label>
			   <input 
				  type="text" 
				  .value="${this.commandInput}"
				  @input="${this.handleCommandInput}"
				  @keydown="${(e: KeyboardEvent) => {
					  if (e.key === 'Enter' && !this.isRepeating) {
						  this.handleSendCommand();
					  }
				  }}"
				  placeholder="Enter command to send..."
				  style="flex: 1; background: #5a5a5a; color: #c3c1c1ff; border: 1px solid #888; border-radius: 6px; padding: 0.5rem; font-size: 1rem; font-family: monospace;"
			   />
			   ${this.commandHistory.length > 0 ? html`
			   <select 
				  @change="${this.handleHistorySelect}"
				  style="min-width: 200px; background: #5a5a5a; color: #c3c1c1ff; border: 1px solid #888; border-radius: 6px; padding: 0.5rem; font-size: 0.9rem;">
				  <option value="">History...</option>
				  ${this.commandHistory.map(cmd => html`<option value="${cmd}">${cmd}</option>`)}
			   </select>
			   ` : nothing}
			   <label style="color: #e0e0e0; font-size: 0.9rem; white-space: nowrap;">Repeat (ms):</label>
			   <input 
				  type="number" 
				  .value="${this.repeatInterval}"
				  @input="${this.handleRepeatIntervalChange}"
				  min="100"
				  step="100"
				  ?disabled="${!this.isRepeating}"
				  style="width: 100px; background: #5a5a5a; color: #c3c1c1ff; border: 1px solid #888; border-radius: 6px; padding: 0.5rem; font-size: 0.9rem;"
			   />
			   <button 
				  @click="${this.handleSendCommand}"
				  ?disabled="${!this.commandInput.trim() || this.isRepeating}"
				  style="background: #2ecc71; color: white; border: 1px solid #27ae60; border-radius: 6px; padding: 0.5rem 1rem; font-size: 0.95rem; font-weight: 600; cursor: pointer; white-space: nowrap; transition: all 0.2s;">
				  Send
			   </button>
			   <button 
				  @click="${this.handleRepeatToggle}"
				  ?disabled="${!this.commandInput.trim()}"
				  style="background: ${this.isRepeating ? '#e74c3c' : '#3498db'}; color: white; border: 1px solid ${this.isRepeating ? '#c0392b' : '#2980b9'}; border-radius: 6px; padding: 0.5rem 1rem; font-size: 0.95rem; font-weight: 600; cursor: pointer; white-space: nowrap; transition: all 0.2s;">
				  ${this.isRepeating ? '⏹ Stop' : '🔁 Repeat'}
			   </button>
			</div>
		 </div>
		 ` : nothing}
		 
		 <div class="main-layout">
			${this.sidebarVisible ? html`
			<div class="sidebar">
				<sidebar-view id="sidebar" .variableMap=${this.variableMap} .variableConfig=${this.variableConfig}></sidebar-view>
			</div>
			` : nothing}
		   <div class="main-content" style="display: flex; flex-direction: column; gap: 1rem; height: 100%;">
		  ${this.screen === 'raw'
			 ? html`<raw-data-view id="rawdataview"
					 .autoScrollEnabled=${this.autoScrollEnabled}
					 .hideData=${this.hideData}
					 .lineBuffer=${this.lineBuffer}
					 ></raw-data-view>`
			 : this.plotInstances.map(id => html`
					<plot-screen-fast 
						key=${id}
						.data=${this.variableMap}
						.variableConfig=${this.variableConfig}
					></plot-screen-fast>
				`)
			   }
		   </div>
		 </div>
	  `;
	}
}


// Listen for save result from extension host
window.addEventListener('message', (event) => {
	   const msg = event.data;
	   if (msg && msg.type === 'save-csv-result') {
			   if (msg.success) {
					   const filename = msg.filename || 'CSV file';
					   const app = document.querySelector('serial-plotter-app') as any;
					   if (app && typeof app.showToast === 'function') {
							   app.showToast(`CSV saved: ${filename}`);
					   }
			   } else {
					   const app = document.querySelector('serial-plotter-app') as any;
					   if (app && typeof app.showToast === 'function') {
							   app.showToast('Failed to save CSV');
					   }
			   }
	   }
});

// Mount the new app element
document.body.append(document.createElement('serial-plotter-app'));
