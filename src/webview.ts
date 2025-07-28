declare global {
	interface HTMLElementTagNameMap {
		'sidebar-view': SidebarView;
	}
}

class SidebarView extends HTMLElement {
	private _variableConfig: Record<string, { color: string }> = {};

	setVariableConfig(config: Record<string, { color: string }>) {
		this._variableConfig = { ...config };
		// Optionally trigger a re-render or update if needed
		this.dispatchEvent(new CustomEvent('variable-config-updated', { detail: this._variableConfig }));
	}

	getVariableConfig(): Record<string, { color: string }> {
		return { ...this._variableConfig };
	}
}

if (!customElements.get('sidebar-view')) {
	customElements.define('sidebar-view', SidebarView);
}
// DEBUG MODE: Set to true to enable fake serial port with 3 sine waves
const DEBUG = true;
import { LitElement, PropertyValueMap, html, nothing } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { map } from "lit/directives/map.js";
import "./components/raw_data_view";
import "./components/sidebar";
import "./components/plot_screen";

interface VSCodeApi {
	postMessage(data: ProtocolRequests): void;
}
declare function acquireVsCodeApi(): VSCodeApi;
const vscode = acquireVsCodeApi() as VSCodeApi;

@customElement("port-selector")
class PortSelector extends LitElement {
	@state()
	ports: Port[] = [];

	@state()
	selected: string | undefined;

	@state()
	running: boolean = false;

	@state()
	error?: string;

	plotter?: SerialPlotter;

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
					...message.ports,
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
		};
		window.addEventListener("message", callback);
		vscode.postMessage({ type: "ports" });
	}

	handleFakeData() {
		this.error = "";
		this.running = true;
		this.plotter?.remove();
		this.plotter = undefined;
		this.plotter = new SerialPlotter({ path: '/dev/fake_serial', manufacturer: 'Simulated' }, 115200);
		document.body.append(this.plotter);
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
		if (this.running) {
			this.plotter?.remove();
			this.plotter = undefined;
			const baudRate = this.querySelector<HTMLInputElement>("#baud")?.value;
			this.plotter = new SerialPlotter(this.ports.find((p) => p.path === this.selected)!, baudRate ? Number.parseInt(baudRate) : 9600);
			// Preserve the user's autoVariableUpdate toggle state
			this.plotter.autoVariableUpdate = this.autoVariableUpdate;
			document.body.append(this.plotter);
		} else {
			this.plotter?.stop();
		}
	}


	@state()
	private screen: 'raw' | 'plot' = 'plot';

	@state()
	autoVariableUpdate: boolean = true;

	private handleScreenToggle() {
		this.screen = this.screen === 'raw' ? 'plot' : 'raw';
	}

	private handleAutoVariableUpdateToggle() {
		this.autoVariableUpdate = !this.autoVariableUpdate;
		if (this.plotter) {
			this.plotter.autoVariableUpdate = this.autoVariableUpdate;
		}
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
			   <sidebar-view .variableMap=${this.plotter?.variableMap ?? new Map()}></sidebar-view>
			</div>
			<div class="main-content" style="display: flex; flex-direction: column; height: 100%;">
			   ${this.screen === 'raw'
				? html`<raw-data-view id="rawdataview"
						.autoScrollEnabled=${this.plotter?.autoScrollEnabled ?? true}
						.hideData=${this.plotter?.hideData ?? false}
					 ></raw-data-view>`
				: html`<plot-screen .data=${this.plotter?.variableMap ?? new Map()}></plot-screen>`}
			</div>
		 </div>
	  `;
	}
}

@customElement("serial-plotter")
class SerialPlotter extends LitElement {
	// Helper to update sidebar-view with variable config
	private updateSidebarVariableConfig() {
		const sidebar = document.querySelector('sidebar-view') as any;
		if (sidebar && typeof sidebar.setVariableConfig === 'function') {
			sidebar.setVariableConfig(this.variableConfig);
		}

		const plotScreen = document.querySelector('plot-screen') as any;
		if (plotScreen && typeof plotScreen.setVariableConfig === 'function') {
			plotScreen.setVariableConfig(this.variableConfig);
		}
	}


	public autoVariableUpdate: boolean = true;
	public lineBuffer: string[] = ["Connecting ..."];
	public variableMap: Map<string, number[]> = new Map<string, number[]>();
	private stopped = false;
	public autoScrollEnabled = true;
	@state()
	public hideData = false;
	@property()
	samplesExceeded = false;

	// Variable config: { name: { color: string } }
	private variableConfig: Record<string, { color: string }> = {};
	private variableOrder: string[] = [];

	private colorPalette = [
		"#b86b4b", // muted orange
		"#4bb86b", // muted green
		"#4b6bb8", // muted blue
		"#b89b4b", // muted yellow
		"#7d5fa6", // muted purple
		"#4bb8a6", // muted teal
		"#b84b4b", // muted red
		"#4b8ab8", // muted cyan
		"#6bb84b", // muted lime
		"#b88a4b", // muted brown
		"#6b4bb8", // muted violet
		"#4bb88a", // muted aquamarine
		"#b84b6b", // muted pink
		"#4b6bb8", // muted blue (repeat for palette)
		"#4bb86b", // muted green (repeat)
		"#b86b4b"  // muted orange (repeat)
	];

	private parseHeaderLine(line: string) {
		// Example: header   line1:'green' line2:'#a5654' lINE_grap:'red'
		// make  lower text line 

		// remove time part first ] found should be delete with the space behidn it 

		let line_low = line.toLowerCase();
		// delete teh time part the first 15 chars 


		const headerMatch = line_low.match(/^header\s+(.*)$/i);

		if (!headerMatch) return;
		// log the headermatch 

		const rest = headerMatch[1];
		// Match: name:'color' or just name
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
		// Log the new variables and their colors
		console.log("[SerialPlotter] Parsed header. Variables and colors:", this.variableConfig);
	}

	private parseDataLine(line: string): Record<string, number | null> | null {
		if (!this.variableOrder.length) return null;
		// Split by tab, comma, semicolon, or whitespace
		const parts = line.split(/[\t,;\s]+/).filter(Boolean);
		if (parts.length < 1) return null;
		const result: Record<string, number | null> = {};
		for (let i = 0; i < this.variableOrder.length; ++i) {
			const name = this.variableOrder[i];
			const val = parts[i];
			result[name] = val !== undefined ? parseFloat(val) : null;
		}
		return result;
	}

	constructor(readonly port: Port, readonly baudRate: number) {
		super();
	}

	start() {
		const raw = this.querySelector<HTMLElement>("#raw")!;
		const rawParent = raw.parentElement!;
		const variables = this.querySelector<VariablesView>("#variables")!;

		if (this.port.path === '/dev/fake_serial') {
			// Simulate 3 sine waves
			let t = 0;
			const dt = 0.05;
			const fakeColors = [
				this.colorPalette[0], // muted orange
				this.colorPalette[1], // muted green
				this.colorPalette[2]  // muted blue
			];
			const sendFakeData = () => {
				// header line every 100 samples
				if (t % (dt * 100) === 0) {
					const now = new Date();
					const ts = now.toLocaleTimeString('en-US', { hour12: false }) + '.' + now.getMilliseconds().toString().padStart(3, '0');
					const header = `[${ts}] header   sin1:'${fakeColors[0]}' sin2:'${fakeColors[1]}' sin3:'${fakeColors[2]}'`;
					this.processData(header, raw, variables, true);
				}
				const now = new Date();
				const ts = now.toLocaleTimeString('en-US', { hour12: false }) + '.' + now.getMilliseconds().toString().padStart(3, '0');
				const s1 = Math.sin(t).toFixed(4);
				const s2 = Math.sin(t + Math.PI / 2).toFixed(4);
				const s3 = Math.sin(t + Math.PI).toFixed(4);
				const line = `[${ts}] ${s1}\t${s2}\t${s3}`;
				this.processData(line, raw, variables, false);
				t += dt;
				if (!this.stopped) setTimeout(sendFakeData, 30);
			};
			sendFakeData();
			return;
		}

		window.addEventListener("message", (ev: { data: ProtocolResponse }) => {
			const message = ev.data;
			if (message.type == "error") {
				// FIXME
			}
			if (message.type == "data") {
				// Add timestamp to each line as soon as it arrives
				const addTimestamp = (line: string) => {
					const now = new Date();
					const ts = now.toLocaleTimeString('en-US', { hour12: false }) + '.' + now.getMilliseconds().toString().padStart(3, '0');
					return `[${ts}] ${line}`;
				};
				const lines = message.text.split(/\r?\n/).filter(l => l.length > 0);
				const stampedText = lines.map(addTimestamp).join("\n");
				this.processData(stampedText, raw, variables);
				if (this.autoScrollEnabled) {
					rawParent.scrollTop = rawParent.scrollHeight;
				}
			}
		});

		const request: StartMonitorPortRequest = {
			type: "start-monitor",
			port: this.port.path,
			baudRate: this.baudRate
		};
		vscode.postMessage(request);
		raw.textContent = this.lineBuffer.filter((line) => this.hideData && line.trim().startsWith(">")).join("\n");
	}

	processData(data: string, raw: HTMLElement, variables: VariablesView, isHeaderLine = false) {
		if (this.stopped) return;
		const first = this.variableMap.size == 0;
		// Accept both single line and multi-line input
		const lines = Array.isArray(data) ? data : data.split(/\r?\n/).filter((line) => line.trim() !== "");

		// Add lines to the persistent raw-data-view
		const rawDataView = document.querySelector('raw-data-view') as any;
		if (rawDataView && typeof rawDataView.addLine === 'function') {
			// Always show header line as a visible line
			if (isHeaderLine) {
				rawDataView.addLine([data]);
			} else {
				rawDataView.addLine(lines);
			}
		}

		// Always show header in the raw text area
		if (isHeaderLine) {
			this.lineBuffer.push(data);
		} else {
			this.lineBuffer.push(...lines);
		}
		this.lineBuffer = [...this.lineBuffer];
		if (this.lineBuffer.length > 100000) {
			this.lineBuffer = this.lineBuffer.slice(-100000);
		}


		let headerFound = false;
		lines.forEach((line) => {
			line = line.replace(/^\[[^\]]+\]\s*/, ""); // Remove timestamp at the start
			// Always check for header in the line (case-insensitive, anywhere in the line)
			const headerMatch = line.match(/header\b/i);
			if (headerMatch) {
				console.log("[SerialPlotter] Header found");
				this.parseHeaderLine(line);
				this.variableMap = new Map();
				headerFound = true;
				variables.data = new Map();
				variables.requestUpdate();
				this.updateSidebarVariableConfig();
				
				return;
			} 
			// No header: update variables dynamically
			const parts = line.split(/[ \t,;]+/).filter(Boolean);

			// Only allow adding new variables if variableConfig has fewer than parts.length
			const maxVars = Object.keys(this.variableConfig).length;
			parts.forEach((val: string, idx: number) => {
				let  name = this.variableOrder[idx+1] || `line${idx + 1}`;
				// log name of the variable, pllot idx val name and parts length 
				// Automatically determine variable config if not already present
				if (this.autoVariableUpdate ) {
					if (maxVars < (idx + 1)) {
						name = 'line' + (idx + 1);
					}
					const color = this.colorPalette[idx % this.colorPalette.length];
					this.variableConfig[name] = { color };
					this.variableOrder.push(name);
					this.updateSidebarVariableConfig();
					console.log(`[SerialPlotter] Auto-determined variable: ${name}, color: ${color}`);
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

		lines.forEach((line) => {
			line = line.replace(/^\[[^\]]+\]\s*/, ""); // Remove timestamp at the start
			// Always check for header in the line (case-insensitive, anywhere in line)
			const headerMatch = line.match(/header\b/i);
			if (!headerMatch) {
				// 

			}
		});

		//console.log("[Webview] Updating plot screen with new data:", this.variableMap);
		
	}

	stop() {
		const request: StopMonitorPortRequest = {
			type: "stop-monitor"
		};
		vscode.postMessage(request);
		this.stopped = true;
	}

	createRenderRoot(): Element | ShadowRoot {
		return this;
	}

	firstUpdated(_changedProperties: PropertyValueMap<any> | Map<PropertyKey, unknown>): void {
		super.firstUpdated(_changedProperties);
		this.start();
	}

	handlePauseAutoScroll() {
		this.autoScrollEnabled = this.querySelector<HTMLInputElement>("#autoscroll")?.checked ?? true;
	}

	handleHideShowData() {
		this.hideData = this.querySelector<HTMLInputElement>("#hidedata")?.checked ?? true;
	}

	handleClearRaw() {
		this.lineBuffer.length = 0;
		const raw = this.querySelector<HTMLElement>("#raw")!;
		raw.textContent = this.lineBuffer.filter((line) => this.hideData ? !line.trim().startsWith(">") : true).slice(-1000).join("\n");
	}

	handleAddPlot() {
		// PlotView is removed; add plot logic should be handled in plot_screen if needed.
	}

	render() {
		return html`
			<div id="root" style="display: flex; flex-direction: column; gap: 1rem; width: 100%; padding-top: 1rem;">
				${this.samplesExceeded ? html`<div style="border: 1px solid #300; background: #cc000087; color: #aaa; padding: 1rem;"></div>` : nothing}
				<div style="display: flex; flex-direction: column; gap: 1rem; width: 100%; border: 1px solid #aaa; border-radius: 4px; padding: 1rem;">
					<div style="display: flex; gap: 1rem; justify-items: center; align-items: center;">
						<span style="font-size: 1.25rem; font-weight: 600">Raw</span>
						<label><input id="autoscroll" type="checkbox" @change=${this.handlePauseAutoScroll} checked />Auto-scroll</label>
						<label><input id="hidedata" type="checkbox" @change=${this.handleHideShowData} />Hide data lines</label>
						<button id="clearraw" @click=${this.handleClearRaw}>Clear</button>
					</div>
					<pre style="resize: vertical; overflow: auto; height: 10rem; width: 100%; margin: 0;"><code id="raw"></code></pre>
				</div>
				<variables-view id="variables" .data=${this.variableMap}></variables-view>
				<plot-view .data=${this.variableMap}></plot-view>
				<button id="addplot" @click=${this.handleAddPlot} style="align-self: flex-start">Add plot</button>
			</div>
		`;
	}
}

@customElement("variables-view")
class VariablesView extends LitElement {
	@property()
	data: Map<string, number[]> = new Map<string, number[]>();

	private minMax: Map<string, { min: number; max: number }> = new Map();

	createRenderRoot(): Element | ShadowRoot {
		return this;
	}

	// Calculate min and max for each variable before each update
	willUpdate(_changedProperties: PropertyValueMap<any> | Map<PropertyKey, unknown>): void {
		this.data.forEach((values, key) => {
			if (values.length > 0) {
				const currentMin = Math.min(...values);
				const currentMax = Math.max(...values);
				this.minMax.set(key, {
					min: currentMin,
					max: currentMax
				});
			}
		});
	}

	render() {
		return html`
			<div style="display: flex; flex-direction: column; gap: 1rem; width: 100%; border: 1px solid #aaa; border-radius: 4px; padding: 1rem;">
				<span style="font-size: 1.25rem; font-weight: 600">Variables</span>
				<table style="width: 100%; border-collapse: collapse; table-layout: auto;">
					<thead>
						<tr>
							<th style="border: 1px dashed #aaa; padding: 0.5rem; white-space: nowrap; text-align: center;">Name</th>
							<th style="border: 1px dashed #aaa; padding: 0.5rem; white-space: nowrap; text-align: center;">Min</th>
							<th style="border: 1px dashed #aaa; padding: 0.5rem; white-space: nowrap; text-align: center;">Max</th>
							<th style="border: 1px dashed #aaa; padding: 0.5rem; white-space: nowrap; text-align: center;">Current</th>
						</tr>
					</thead>
					<tbody>
						${Array.from(this.data.entries()).map(([key, values]) => {
			const current = values[values.length - 1];
			const minMax = this.minMax.get(key) || { min: 0, max: 0 };

			return html`
								<tr>
									<td style="border: 1px dashed #aaa; padding: 0.5rem; white-space: nowrap; text-align: center;">${key}</td>
									<td style="border: 1px dashed #aaa; padding: 0.5rem; white-space: nowrap; text-align: center;">${minMax.min}</td>
									<td style="border: 1px dashed #aaa; padding: 0.5rem; white-space: nowrap; text-align: center;">${minMax.max}</td>
									<td style="border: 1px dashed #aaa; padding: 0.5rem; white-space: nowrap; text-align: center;">${current}</td>
								</tr>
							`;
		})}
					</tbody>
				</table>
			</div>
		`;
	}
}

// ...PlotView removed. All plotting logic should be in plot_screen component now.

document.body.append(new PortSelector());

