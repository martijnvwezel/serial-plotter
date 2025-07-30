
import { LitElement, html, PropertyValueMap } from "lit";
import { property, customElement, state } from "lit/decorators.js";

@customElement("plot-screen")
export class PlotScreen extends LitElement {
  // Throttle renderData updates
  private renderInterval = 30; // ms, ~20 FPS
  private renderTimer: number | null = null;


  // Allow external updates to add a new line of data (like raw_data_view)
  public addLine(variable: string, value: number) {
    // Only add data if variable is present in variableConfig (i.e., not deleted)
    if (!this.variableConfig.hasOwnProperty(variable)) {
      // Variable is not in config, do not add data
      return;
    }
    // Add or update the graph data for the variable
    let graphData = this.data.get(variable) ?? [];
    graphData.push(value);
    this.data.set(variable, graphData);

    // Ensure reactivity by reassigning the data property
    this.data = new Map(this.data);

    // Maintain color mapping for the variable
    if (!this.dataColors.has(variable)) {
        this.getDataColor(variable);
    }

  }

  // Renamed updateLine to updateLineColors for clarity
  public updateLineColors(variable: string, value: number) {
    // Only add data if variable is present in variableConfig (i.e., not deleted)
    if (!this.variableConfig.hasOwnProperty(variable)) {
      // Variable is not in config, do not add data
      return;
    }
    // Add or update the data for the variable
    let arr = this.data.get(variable) ?? [];
    arr.push(value);
    this.data.set(variable, arr);

    // Ensure reactivity by reassigning the data property
    this.data = new Map(this.data);

    // Maintain color mapping for the variable
    if (!this.dataColors.has(variable)) {
        this.getDataColor(variable);
    }
  }


  /**
   * Config for each variable: { color, visablename }
   */
  @property({ type: Object })
  variableConfig: Record<string, { color: string; visablename: string }> = {};

  // Allow external update of variable config (colors, visablename, etc) from sidebar
  public setVariableConfig(config: Record<string, { color: string; visablename: string }>) {
    
    this.variableConfig = config;
    // Remove data for variables that are no longer in config
    for (const key of Array.from(this.data.keys())) {
      if (!config.hasOwnProperty(key)) {
        this.data.delete(key);
      }
    }
    // Update dataColors map
    const newColors = new Map<string, string>();
    for (const [name, obj] of Object.entries(config)) { // TODO fix auto color fixing
      newColors.set(name, obj.color);
    }
    this.dataColors = newColors;
    // Always update selectedVariables to match config keys from sidebar
    this.selectedVariables = new Set(Object.keys(config));
    this.requestUpdate();
  }

  @property({ type: Map })
  data: Map<string, number[]> = new Map();

  @state()
  dataColors: Map<string, string> = new Map();
  @state()
  selectedVariables: Set<string> = new Set();
  @state()
  autoScroll: boolean = true;
  @state()
  visibleSamples: number = 8196;
  static readonly MIN_VISIBLE_SAMPLES = 10;
  @state()
  scrollOffset: number = (this.visibleSamples - 1) / 2;
  @state()
  stats: Array<{ key: string; min: number | string; max: number | string; current: number | string }> = [];

  @state()
  autoScaleY: boolean = true;
  @state()
  yMin: number | null = null;
  @state()
  yMax: number | null = null;

  private static readonly MIN_Y_HEIGHT = 1e-6;

  // --- Vertical panning state ---
  private isYDragging = false;
  private startDragY = 0;
  private startYMin = 0;
  private startYMax = 0;

  handleCanvasWheel(event: WheelEvent) {
    if (this.autoScaleY) return;
    event.preventDefault();
    const delta = event.deltaY;
    // If shift is held, pan, else zoom
    if (event.shiftKey) {
      // Pan y
      if (this.yMax === null || this.yMin === null) return;
      const range = (this.yMax - this.yMin);
      const pan = range * 0.1 * (delta > 0 ? 1 : -1);
      let newYMin = this.yMin + pan;
      let newYMax = this.yMax + pan;
      // Enforce minimum height
      if (newYMax - newYMin < PlotScreen.MIN_Y_HEIGHT) {
        const center = (newYMax + newYMin) / 2;
        newYMin = center - PlotScreen.MIN_Y_HEIGHT / 2;
        newYMax = center + PlotScreen.MIN_Y_HEIGHT / 2;
      }
      this.yMin = newYMin;
      this.yMax = newYMax;
    } else {
      // Zoom y
      if (this.yMax === null || this.yMin === null) return;
      const center = (this.yMax + this.yMin) / 2;
      let range = (this.yMax - this.yMin);
      const zoom = delta > 0 ? 1.2 : 0.8;
      range *= zoom;
      // Enforce minimum height
      if (range < PlotScreen.MIN_Y_HEIGHT) {
        range = PlotScreen.MIN_Y_HEIGHT;
      }
      this.yMin = center - range / 2;
      this.yMax = center + range / 2;
    }
    this.requestUpdate();
  }

  handleAutoScaleYClick() {
    this.autoScaleY = true;
    this.yMin = null;
    this.yMax = null;
    this.requestUpdate();
  }

  @state()
  updated(changedProps: PropertyValueMap<any> | Map<PropertyKey, unknown>) {

    super.updated?.(changedProps);
    // Auto-enable all variables when data changes
    if (changedProps.has('data')) {
      const allVars = Array.from(this.data.keys());
      if (allVars.length > 0) {
        // If nothing selected, select all by default
        if (this.selectedVariables.size === 0) {
          this.selectedVariables = new Set(allVars);
        } else {
          // Add any new variables to the selection
          let changed = false;
          for (const v of allVars) {
            if (!this.selectedVariables.has(v)) {
              this.selectedVariables.add(v);
              changed = true;
            }
          }
          if (changed) this.selectedVariables = new Set(this.selectedVariables);
        }
      }
    }
  }

  getDataColor(variable: string): string {
    return this.dataColors.get(variable) || '#fff';
  }

  toggleVariableSelection(e: Event) {
    const input = e.target as HTMLInputElement;
    const variable = input.value;
    const newSet = new Set(this.selectedVariables);
    if (input.checked) {
      newSet.add(variable);
    } else {
      newSet.delete(variable);
    }
    this.selectedVariables = newSet;
  }

  handleAddPlot() {
    this.dispatchEvent(new CustomEvent('add-plot', { bubbles: true, composed: true }));
  }

  canvas!: HTMLCanvasElement;
  ctx!: CanvasRenderingContext2D;
  @property()
  padding = 10;
  @property()
  lineWidth = 2;
  @property()
  maxSamples = 10000000;

  isDragging = false;
  startDragX = 0;
  startScrollOffset = 0;

  createRenderRoot(): Element | ShadowRoot {
      return this;
  }

  handleClose() {
      this.remove();
  }

  firstUpdated(_changedProperties: PropertyValueMap<any> | Map<PropertyKey, unknown>): void {
    super.firstUpdated(_changedProperties);
    this.canvas = this.querySelector<HTMLCanvasElement>("canvas")!;
    this.ctx = this.canvas.getContext("2d")!;
    this.canvas.addEventListener("mousedown", this.handleMouseDown.bind(this));
    this.canvas.addEventListener("mousemove", this.handleMouseMove.bind(this));
    this.canvas.addEventListener("mouseup", this.handleMouseUp.bind(this));
    this.canvas.addEventListener("mouseleave", this.handleMouseUp.bind(this));
    this.canvas.addEventListener("wheel", this.handleCanvasWheel.bind(this), { passive: false });
    if (this.selectedVariables.size === 0) {
      for (const name of this.data.keys()) {
        this.selectedVariables.add(name);
      }
    }
    this.renderData();
  }

  handleMouseDown(event: MouseEvent) {
    if (!this.autoScroll) {
      this.isDragging = true;
      this.startDragX = event.clientX;
      this.startScrollOffset = this.scrollOffset;
    }
    // Enable vertical panning if autoScaleY is off
    if (!this.autoScaleY) {
      this.isYDragging = true;
      this.startDragY = event.clientY;
      this.startYMin = this.yMin ?? 0;
      this.startYMax = this.yMax ?? 1;
    }
  }

  handleMouseMove(event: MouseEvent) {
    if (this.isDragging && !this.autoScroll) {
      const deltaX = event.clientX - this.startDragX;
      const pixelsPerSample = this.canvas.clientWidth / (this.visibleSamples - 1);
      this.scrollOffset = this.startScrollOffset - deltaX / pixelsPerSample;
    }
    // Vertical panning for y-axis
    if (this.isYDragging && !this.autoScaleY) {
      const deltaY = event.clientY - this.startDragY;
      const canvas = this.canvas;
      const dpr = window.devicePixelRatio;
      const h = canvas.clientHeight * dpr;
      const yRange = (this.startYMax - this.startYMin);
      // Move yMin/yMax by a fraction of the y-range based on drag
      const panFrac = deltaY / h;
      let newYMin = this.startYMin + panFrac * yRange;
      let newYMax = this.startYMax + panFrac * yRange;
      // Enforce minimum height
      if (newYMax - newYMin < PlotScreen.MIN_Y_HEIGHT) {
        const center = (newYMax + newYMin) / 2;
        newYMin = center - PlotScreen.MIN_Y_HEIGHT / 2;
        newYMax = center + PlotScreen.MIN_Y_HEIGHT / 2;
      }
      this.yMin = newYMin;
      this.yMax = newYMax;
      this.requestUpdate();
    }
  }

  handleMouseUp() {
    this.isDragging = false;
    this.isYDragging = false;
  }

  handleVisibleSamplesChange(e: Event) {
      const target = e.target as HTMLInputElement;
      this.visibleSamples = parseInt(target.value, 10);
  }

  handleAutoScrollChange(e: Event) {
      const checkbox = e.target as HTMLInputElement;
      this.autoScroll = checkbox.checked;
      const maxSamples = Math.max(...Array.from(this.data.values()).map((line) => line.length));
      this.scrollOffset = maxSamples - this.visibleSamples / 2;
  }

  renderData() {

    if (!this.isConnected) {
      return;
    }

    // Throttle updates: only schedule next render after interval
    if (this.renderTimer !== null) {
      clearTimeout(this.renderTimer);
    }
    this.renderTimer = window.setTimeout(() => this.renderData(), this.renderInterval);

    // --- Canvas drawing (same as before) ---
    const canvas = this.canvas;
    const ctx = this.ctx;
    const dpr = window.devicePixelRatio;
    const w = canvas.clientWidth * dpr;
    const h = canvas.clientHeight * dpr;

    if (canvas.width != w || canvas.height != h) {
      canvas.width = canvas.clientWidth * dpr;
      canvas.height = canvas.clientHeight * dpr;
    }

    ctx.clearRect(0, 0, w, h);

    let min = Number.POSITIVE_INFINITY;
    let max = Number.NEGATIVE_INFINITY;

    const maxSamples = Math.max(0, ...Array.from(this.data.values()).map((line) => line.length));
    const startSample = Math.max(0, Math.floor(this.scrollOffset - this.visibleSamples / 2));
    const endSample = Math.min(Math.ceil(this.scrollOffset + this.visibleSamples / 2), maxSamples - 1);

    // --- Stats calculation for visible window ---
    const newStats = Array.from(this.data.entries())
      .map(([key, values]) => {
        if (!values.length) return { key, min: 'N/A', max: 'N/A', current: 'N/A' };
        const visible = values.slice(startSample, endSample + 1).filter(v => typeof v === 'number' && !isNaN(v));
        if (!visible.length) return { key, min: 'N/A', max: 'N/A', current: 'N/A' };
        const minV = Math.min(...visible);
        const maxV = Math.max(...visible);
        const current = visible[visible.length - 1];
        return { key, min: minV, max: maxV, current };
      });
    // Only update and requestUpdate if stats changed
    const statsChanged = JSON.stringify(this.stats) !== JSON.stringify(newStats);
    if (statsChanged) {
      this.stats = newStats;
      this.requestUpdate();
    }

    // --- Canvas drawing (unchanged) ---
    for (const [name, line] of this.data.entries()) {
      if (!this.selectedVariables.has(name) || line.length < 2) continue;
      for (let i = startSample; i <= endSample; i++) {
        const value = line[i];
        min = Math.min(min, value);
        max = Math.max(max, value);
      }
    }
    // Only update yMin/yMax from data if autoScaleY is enabled
    if (this.autoScaleY) {
      this.yMin = min;
      this.yMax = max;
    } else if (this.yMin === null || this.yMax === null) {
      // If manual mode but yMin/yMax not set, initialize to data range
      this.yMin = min;
      this.yMax = max;
    }

    const yMin = this.yMin ?? min;
    const yMax = this.yMax ?? max;
    const height = yMax - yMin;
    const padding = this.padding;
    const lineWidth = this.lineWidth;
    const baseFontSize = 12;
    const scaledFontSize = baseFontSize * dpr;
    const labelPadding = scaledFontSize;
    const scaleY = height !== 0 ? (h - padding * 2 - labelPadding * 2) / height : 1;

    const pixelsPerSample = (w - padding * 2) / (this.visibleSamples - 1);

    if (this.autoScroll && maxSamples > this.visibleSamples) {
      const targetScrollOffset = maxSamples - this.visibleSamples / 2;
      this.scrollOffset = this.scrollOffset * 0.4 + targetScrollOffset * 0.6;
    }

    ctx.save();
    const labelHeight = 50;
    const numYLabels = Math.floor(h / labelHeight);
    ctx.fillStyle = "#aaa";
    ctx.font = `${scaledFontSize}px Arial`;
    ctx.textAlign = "left";

    ctx.strokeStyle = "rgba(255, 255, 255, 0.1)";
    ctx.lineWidth = 1 * dpr;
    for (let i = 0; i <= numYLabels; i++) {
      const yValue = yMin + (i / numYLabels) * height;
      const y = h - labelPadding - padding - (yValue - yMin) * scaleY;
      ctx.beginPath();
      ctx.moveTo(padding, y);
      ctx.lineTo(w - padding, y);
      ctx.stroke();
      ctx.fillText(yValue.toFixed(2), 5 * dpr, y + scaledFontSize / 2);
    }
    ctx.restore();

    ctx.save();
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    ctx.fillStyle = "#aaa";
    ctx.font = `${scaledFontSize}px Arial`;

    const labelWidthPx = 96 * dpr;
    const numXLabels = Math.floor(w / labelWidthPx);
    const step = Math.ceil(this.visibleSamples / numXLabels);

    for (let i = startSample; i <= endSample; i++) {
      const x = padding + (i - this.scrollOffset + this.visibleSamples / 2) * pixelsPerSample;

      if (x >= padding && x <= w - padding && i % step === 0) {
        ctx.fillText(i.toString(), x, h - labelPadding);
      }
    }
    ctx.restore();

    for (const [name, line] of this.data.entries()) {
      if (!this.selectedVariables.has(name) || line.length < 2) continue;

      ctx.strokeStyle = this.getDataColor(name);
      ctx.lineWidth = lineWidth;
      ctx.save();
      ctx.beginPath();
      let hasStarted = false;

      for (let i = startSample; i <= endSample && i < line.length; i++) {
        const value = line[i];
        if (value != null) {
          const x = padding + (i - this.scrollOffset + this.visibleSamples / 2) * pixelsPerSample;
          const y = h - labelPadding - padding - (value - yMin) * scaleY;

          if (!hasStarted) {
            ctx.moveTo(x, y);
            hasStarted = true;
          } else {
            ctx.lineTo(x, y);
          }
        }
      }

      ctx.stroke();
      ctx.restore();
    }
  }

  render() {
    // Compute statistics for each variable for the visible window
    const maxSamples = Math.max(0, ...Array.from(this.data.values()).map((line) => line.length));
    // Clamp visibleSamples to maxSamples if needed
    // Always enforce a minimum visibleSamples
    let visibleSamples = Math.max(PlotScreen.MIN_VISIBLE_SAMPLES, Math.min(this.visibleSamples, maxSamples > 0 ? maxSamples : this.visibleSamples));
    if (visibleSamples !== this.visibleSamples) {
      this.visibleSamples = visibleSamples;
    }
    const startSample = Math.max(0, Math.floor(this.scrollOffset - visibleSamples / 2));
    const endSample = Math.min(Math.ceil(this.scrollOffset + visibleSamples / 2), maxSamples - 1);
    // Only show stats for variables present in variableConfig
    const filteredStats = this.stats.filter(stat => this.variableConfig.hasOwnProperty(stat.key));
    // Helper to get visablename if present
    const getDisplayName = (key: string) => {
      if (this.variableConfig && this.variableConfig[key] && this.variableConfig[key].visablename) {
        return this.variableConfig[key].visablename;
      }
      return key;
    };
    return html`
      <div style="display: flex; flex-direction: column; gap: 1.2rem; width: 100%; border: 1px solid #aaa; border-radius: 4px; padding: 1.2rem 1.2rem 1.8rem 1.2rem; background: #232323;">
        <!-- Statistics Table -->
        <div style="margin-bottom: 0.5rem;">
          <table style="width: 100%; border-collapse: collapse; font-size: 1rem;">
            <thead>
              <tr style="background: #232323; color: #aaa;">
                <th style="padding: 0.3em 0.7em; border-bottom: 1px solid #444; text-align: left;">Variable</th>
                <th style="padding: 0.3em 0.7em; border-bottom: 1px solid #444; text-align: right;">Min</th>
                <th style="padding: 0.3em 0.7em; border-bottom: 1px solid #444; text-align: right;">Max</th>
                <th style="padding: 0.3em 0.7em; border-bottom: 1px solid #444; text-align: right;">Current</th>
              </tr>
            </thead>
            <tbody>
              ${filteredStats.map(stat => html`
                <tr>
                  <td style="padding: 0.3em 0.7em; color: ${this.getDataColor(stat.key)}; font-weight: 600;">${getDisplayName(stat.key)}</td>
                  <td style="padding: 0.3em 0.7em; text-align: right;">${stat.min}</td>
                  <td style="padding: 0.3em 0.7em; text-align: right;">${stat.max}</td>
                  <td style="padding: 0.3em 0.7em; text-align: right;">${stat.current}</td>
                </tr>
              `)}
            </tbody>
          </table>
        </div>
        <!-- Controls -->
        <div style="display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.5rem;">
          <label>Auto-scroll</label>
          <input type="checkbox" .checked="${this.autoScroll}" @change=${this.handleAutoScrollChange} />
          <label>Zoom</label>
          <input
            type="range"
            min="10 "
            max="${Math.max(10, maxSamples)}"
            .value="${String(visibleSamples)}"
            @input=${this.handleVisibleSamplesChange}
            style="flex-grow: 1; max-width: 350px; outline: none;"
          />
          <label style="margin-left: 1em;">
            <input type="checkbox" .checked="${this.autoScaleY}" @change=${(e: Event) => {
              this.autoScaleY = (e.target as HTMLInputElement).checked;
              if (this.autoScaleY) {
                this.yMin = 0;
                this.yMax = 100;
              }
              this.requestUpdate();
            }} />
            Auto-scale Y
          </label>
        </div>
        <!-- Plot Area -->
        <div style="resize: vertical; overflow: auto; width: 100%; height: 400px; background: #181818; border-radius: 6px; border: 1px solid #444;">
          <canvas style="display: block; width: 100%; height: 100%;"></canvas>
        </div>
        <!-- Add Plot Button (styled like webview) -->
        <div style="display: flex; justify-content: flex-start; margin-top: 1.8rem;">
          <button @click=${this.handleAddPlot}
            id="addplot"
            style="align-self: flex-start; background: #5a5a5a; color: #c3c1c1ff; border: 1px solid #888; border-radius: 6px; padding: 0.45rem 1.1rem; font-size: 1rem; font-weight: 600; letter-spacing: 0.03em; min-width: 8.5rem; cursor: pointer; transition: border 0.2s, box-shadow 0.2s;">
            Add plot
          </button>
        </div>
      </div>
    `;
  }
}