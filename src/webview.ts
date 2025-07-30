
import { LitElement, html, nothing } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { map } from "lit/directives/map.js";
import "./components/raw_data_view";
import "./components/sidebar";
import "./components/plot_screen";
import "./components/variables_view_";

interface VSCodeApi {
	postMessage(data: ProtocolRequests): void;
}
declare function acquireVsCodeApi(): VSCodeApi;
const vscode = acquireVsCodeApi() as VSCodeApi;

@customElement("serial-plotter-app")
class SerialPlotterApp extends LitElement {
	@state()
	ports: Port[] = [];

	@state()
	selected: string | undefined;

	@state()
	running: boolean = false;

	@state()
	error?: string;

	@state()
	private screen: 'raw' | 'plot' = 'plot';

	@state()
	autoVariableUpdate: boolean = true;

	public lineBuffer: string[] = ["Connecting ..."];
	public variableMap: Map<string, number[]> = new Map<string, number[]>();
	public autoScrollEnabled = true;
	@state()
	public hideData = false;
	@property()
	samplesExceeded = false;

	// Variable config: { name: { color: string } }
	private variableConfig: Record<string, { color: string }> = {};
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
	"#75715e", // comment gray
	"#ae81ff", // violet
	"#f4bf75", // gold
	"#cfcfc2", // light gray
	"#272822", // background dark
	"#1e0010", // dark purple
	"#465457", // blue gray
	"#b6e354"  // lime
  ];

  firstUpdated() {
	// Listen for a custom event from sidebar-view
	const sidebar = this.renderRoot.querySelector('sidebar-view');
	if (sidebar) {
	  sidebar.addEventListener('variable-config-changed', (e: any) => {
		this.variableConfig = e.detail;
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
		}
	  });
	}
  }


	private stopped = false;

	createRenderRoot(): Element | ShadowRoot {
		return this;
	}

	connectedCallback(): void {
		super.connectedCallback();
		this.load();
	}

	load() {
		// Always add a fake port option
		const callback = (ev: { data: ProtocolResponse }) => {
			const message = ev.data;
			if (message.type == "ports-response") {
				const previouslySelected = this.selected;
				this.ports = [
					// ...message.ports,
					// remove ttyS from message.ports
					...message.ports.filter(p => !p.path.startsWith('/dev/ttyS')),
					{ path: '/dev/fake_serial', manufacturer: 'Simulated' }
				];
				if (previouslySelected) {
					const matchingPort = this.ports.find((p) => p.path === previouslySelected);
					if (matchingPort) {
						this.selected = matchingPort.path;
					}
				}
				if (!this.selected) this.selected = this.ports[this.ports.length - 1]?.path ?? undefined;
			}
			if (message.type == "error") {
				if (this.running) {
					this.handleStartStop();
				}
				this.error = "Could not open port or device disconnected";
			}
			if (message.type == "data") {
				this.handleSerialData(message.text);
			}
		};
		window.addEventListener("message", callback);
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
			if (t % (dt * 100) === 0) {
				const now = new Date();
				const ts = now.toLocaleTimeString('en-US', { hour12: false }) + '.' + now.getMilliseconds().toString().padStart(3, '0');
				const header = `[${ts}] header   sin1:'${fakeColors[0]}' sin2:'${fakeColors[1]}' sin3:'${fakeColors[2]}'`;
				this.processData(header, true);
			}
			const now = new Date();
			const ts = now.toLocaleTimeString('en-US', { hour12: false }) + '.' + now.getMilliseconds().toString().padStart(3, '0');
			const s1 = Math.sin(t).toFixed(4);
			const s2 = Math.sin(t + Math.PI / 2).toFixed(4);
			const s3 = Math.sin(t + Math.PI).toFixed(4);
			const line = `[${ts}] ${s1}\t${s2}\t${s3}`;
			this.processData(line, false);
			t += dt;
			if (!this.stopped && this.running) setTimeout(sendFakeData, 30);
		};
		sendFakeData();
	}

	handlePortChange(e: Event) {
		const target = e.target as HTMLSelectElement;
		this.selected = target.value;
	}

	handleRefresh() {
		vscode.postMessage({ type: "ports" });
	}

	handleStartStop() {
		if (!this.selected) return;
		this.error = "";
		this.running = !this.running;
		this.stopped = !this.running;
		if (this.running) {
			this.lineBuffer = ["Connecting ..."];
			this.variableMap = new Map();
			if (this.selected === '/dev/fake_serial') {
				this.handleFakeData();
			} else {
				this.startSerial();
			}
		} else {
			this.stopSerial();
		}
	}

	startSerial() {
		window.addEventListener("message", (ev: { data: ProtocolResponse }) => {
			const message = ev.data;
			if (message.type == "error") {
				// FIXME
			}
			if (message.type == "data") {
				this.handleSerialData(message.text);
			}
		});
		const baudRate = this.getBaudRate();
		const request: StartMonitorPortRequest = {
			type: "start-monitor",
			port: this.selected!,
			baudRate: baudRate
		};
		vscode.postMessage(request);
	}

	stopSerial() {
		const request: StopMonitorPortRequest = {
			type: "stop-monitor"
		};
		vscode.postMessage(request);
		this.stopped = true;
	}

	getBaudRate(): number {
		const baudSelect = this.querySelector<HTMLInputElement>("#baud");
		return baudSelect ? Number.parseInt(baudSelect.value) : 9600;
	}

	private handleSerialData(text: string) {
		this.processData(text, false);
	}

	private processData(data: string, isHeaderLine = false) {
		if (this.stopped) return;
		const lines = Array.isArray(data) ? data : data.split(/\r?\n/).filter((line) => line.trim() !== "");
		// Always show header in the raw text area
		if (isHeaderLine) {
			this.lineBuffer.push(data);
		} else {
			this.lineBuffer.push(...lines);
		}
		this.lineBuffer = [...this.lineBuffer];
		// Live update the raw-data-view if present
		const rawDataView = this.renderRoot.querySelector('raw-data-view') as any;
		if (rawDataView && typeof rawDataView.addLine === 'function') {
			if (isHeaderLine) {
				rawDataView.addLine([data]);
			} else {
				rawDataView.addLine(lines);
			}
		}
		lines.forEach((line) => {
			line = line.replace(/^\[[^\]]+\]\s*/, ""); // Remove timestamp at the start
			// Always check for header in the line (case-insensitive, anywhere in the line)
			const headerMatch = line.match(/header\b/i);
			if (headerMatch) {
				this.parseHeaderLine(line);
				this.variableMap = new Map();
				return;
			}
			// No header: update variables dynamically
			const parts = line.split(/[ \t,;]+/).filter(Boolean);
			// Only allow adding new variables if variableConfig has fewer than parts.length
			const maxVars = Object.keys(this.variableConfig).length;
			parts.forEach((val: string, idx: number) => {
				let name = this.variableOrder[idx] || `line${idx + 1}`;
				if (this.autoVariableUpdate) {
					const color = this.colorPalette[idx % this.colorPalette.length];
					if (maxVars < (idx + 1)) {
						name = 'line' + (idx + 1);
					}
					if (!this.variableConfig[name]) {
						this.variableConfig[name] = { color };
						this.variableOrder.push(name);
					}
				}
				// Add data to the variable
				let arr = this.variableMap.get(name) ?? [];
				const numVal = parseFloat(val);
				arr.push(!isNaN(numVal) ? numVal : 0);
				if (arr.length > 1000000) {
					arr = arr.slice(-1000000);
					this.samplesExceeded = true;
				}
				this.variableMap.set(name, arr);
			});
		});

		const plotScreen = document.querySelector("plot-screen") as any;
			if (plotScreen) {
				const sidebar = document.querySelector('sidebar-view') as any;
				plotScreen.setVariableConfig(sidebar.getVariableConfig());
			}
	}

	private parseHeaderLine(line: string) {
		let line_low = line.toLowerCase();
		const headerMatch = line_low.match(/^header\s+(.*)$/i);
		if (!headerMatch) return;
		const rest = headerMatch[1];
		const regex = /(\w+)(?::'([^']+)')?/g;
		let match;
		this.variableConfig = {};
		this.variableOrder = [];
		let colorIdx = 0;
		while ((match = regex.exec(rest)) !== null) {
			const name = match[1];
			let color = match[2];
			if (!color) {
				color = this.colorPalette[colorIdx % this.colorPalette.length];
				colorIdx++;
			}
			this.variableConfig[name] = { color };
			this.variableOrder.push(name);
		}
	}

	private handleScreenToggle() {
		this.screen = this.screen === 'raw' ? 'plot' : 'raw';
	}

	private handleAutoVariableUpdateToggle() {
		this.autoVariableUpdate = !this.autoVariableUpdate;
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
			   width: 260px;
			   min-width: 180px;
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
			(p) => html` <option value="${p.path}" ?selected="${this.selected === p.path}">${p.path + (p.manufacturer ? " - " + p.manufacturer : "")}</option> `
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
			</div>
			<div style="display: flex; align-items: center; gap: 0.5rem;">
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
			</div>
		 </div>
		 ${this.error ? html`<div class="error-message">${this.error}</div>` : nothing}
		 <div class="main-layout">
			<div class="sidebar">
				<sidebar-view id="sidebar" .variableMap=${this.variableMap} .variableConfig=${this.variableConfig}></sidebar-view>
			</div>
			<div class="main-content" style="display: flex; flex-direction: column; height: 100%;">
		   ${this.screen === 'raw'
			   ? html`<raw-data-view id="rawdataview"
					   .autoScrollEnabled=${this.autoScrollEnabled}
					   .hideData=${this.hideData}
					   .lineBuffer=${this.lineBuffer}
					   ></raw-data-view>`
			   : html`<plot-screen id="plotscreen"
					   .data=${this.variableMap}
					   .variableConfig=${this.variableConfig}
					   ></plot-screen>`}
			</div>
		 </div>
	  `;
	}
}


// Mount the new app element
document.body.append(document.createElement('serial-plotter-app'));
