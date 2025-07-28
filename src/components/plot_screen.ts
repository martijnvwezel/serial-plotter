import { LitElement, html, PropertyValueMap } from "lit";
import { property } from "lit/decorators.js";
import { customElement, state } from "lit/decorators.js";

@customElement("plot-screen")
export class PlotScreen extends LitElement {
  // Allow external updates to add a new line of data (like raw_data_view)
  public addLine(variable: string, value: number) {
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

    // Log the graph data
    console.log(`[PlotScreen] Graph data added for variable '${variable}': ${value}`);
    console.log(`[PlotScreen] Current graph data state:`, this.data);
  }

  // Renamed updateLine to updateLineColors for clarity
  public updateLineColors(variable: string, value: number) {
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

    // Log the new data
    console.log(`[PlotScreen] New data added for variable '${variable}': ${value}`);
  }

  // Allow external update of variable config (colors, etc) from sidebar
  public setVariableConfig(config: Record<string, { color: string }>) {

    // Update dataColors map
    const newColors = new Map<string, string>();
    for (const [name, obj] of Object.entries(config)) {
      newColors.set(name, obj.color);
    }
    this.dataColors = newColors;
    // Optionally, update selectedVariables to match config keys
    // this.selectedVariables = new Set(newColors.keys());
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
  visibleSamples: number = 2048;
  @state()
  scrollOffset: number = (this.visibleSamples - 1) / 2;


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
  ////////////////////////////////////////////////
// below is old code so if a function exist check if the part is needed
/////////////////////////////////////////////////
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

  // handleAutoScrollChange(e: Event) {
  //   this.autoScroll = (e.target as HTMLInputElement).checked;
  // }

  // handleVisibleSamplesChange(e: Event) {
  //   this.visibleSamples = Number((e.target as HTMLInputElement).value);
  // }

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
  maxSamples = 1000000;

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
      if (this.selectedVariables.size === 0) {
          for (const name of this.data.keys()) {
              this.selectedVariables.add(name);
          }
      }
      this.renderData();
  }

  // getDataColor(name: string): string {
  //     if (this.dataColors.has(name)) return this.dataColors.get(name)!;

  //     const palette = [
  //         "#FF5733",
  //         "#33FF57",
  //         "#3357FF",
  //         "#F39C12",
  //         "#9B59B6",
  //         "#1ABC9C",
  //         "#E74C3C",
  //         "#3498DB",
  //         "#2ECC71",
  //         "#E67E22",
  //         "#8E44AD",
  //         "#16A085",
  //         "#C0392B",
  //         "#2980B9",
  //         "#27AE60",
  //         "#D35400"
  //     ];

  //     const index = Array.from(this.data.keys()).indexOf(name) % palette.length;
  //     const color = palette[index];

  //     this.dataColors.set(name, color);
  //     return color;
  // }

  // toggleVariableSelection(event: Event) {
  //     const checkbox = event.target as HTMLInputElement;
  //     const variable = checkbox.value;

  //     if (checkbox.checked) {
  //         this.selectedVariables.add(variable);
  //     } else {
  //         this.selectedVariables.delete(variable);
  //     }
  // }

  handleMouseDown(event: MouseEvent) {
      if (!this.autoScroll) {
          this.isDragging = true;
          this.startDragX = event.clientX;
          this.startScrollOffset = this.scrollOffset;
      }
  }

  handleMouseMove(event: MouseEvent) {
      if (this.isDragging && !this.autoScroll) {
          const deltaX = event.clientX - this.startDragX;
          const pixelsPerSample = this.canvas.clientWidth / (this.visibleSamples - 1);
          this.scrollOffset = this.startScrollOffset - deltaX / pixelsPerSample;
      }
  }

  handleMouseUp() {
      this.isDragging = false;
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

      requestAnimationFrame(() => this.renderData());

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

      const maxSamples = Math.max(...Array.from(this.data.values()).map((line) => line.length));
      const startSample = Math.max(0, Math.floor(this.scrollOffset - this.visibleSamples / 2));
      const endSample = Math.min(Math.ceil(this.scrollOffset + this.visibleSamples / 2), maxSamples - 1);

      for (const [name, line] of this.data.entries()) {
          if (!this.selectedVariables.has(name) || line.length < 2) continue;
          for (let i = startSample; i <= endSample; i++) {
              const value = line[i];
              min = Math.min(min, value);
              max = Math.max(max, value);
          }
      }

      const height = max - min;
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
          const yValue = min + (i / numYLabels) * height;
          const y = h - labelPadding - padding - (yValue - min) * scaleY;
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
                  const y = h - labelPadding - padding - (value - min) * scaleY;

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
    // Compute statistics for each variable
    const stats = Array.from(this.data.entries())
      .map(([key, values]) => {
        if (!values.length) return null;
        const min = Math.min(...values);
        const max = Math.max(...values);
        const current = values[values.length - 1];
        return { key, min, max, current };
      })
      .filter((stat): stat is { key: string; min: number; max: number; current: number } => stat !== null);

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
              ${stats.map(stat => html`
                <tr>
                  <td style="padding: 0.3em 0.7em; color: ${this.getDataColor(stat.key)}; font-weight: 600;">${stat.key}</td>
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
            min="10"
            max="1000"
            .value="${String(this.visibleSamples)}"
            @input=${this.handleVisibleSamplesChange}
            style="flex-grow: 1; max-width: 350px; outline: none;"
          />
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