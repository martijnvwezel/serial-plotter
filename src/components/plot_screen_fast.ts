import { LitElement, html, PropertyValueMap } from "lit";
import { property, customElement, state } from "lit/decorators.js";

// Import PixiJS (for WebGL rendering)
import * as PIXI from "pixi.js";
console.log("PixiJS version (runtime):", PIXI.VERSION); 

@customElement("plot-screen-fast")
export class PlotScreenFast extends LitElement {
  @property({ type: Object })
  variableConfig: Record<string, { color: string; visablename: string }> = {};
  @property({ type: Map })
  data: Map<string, number[]> = new Map();
  @state()
  selectedVariables: Set<string> = new Set(); //
  @state()
  visibleSamples: number = 8196;
  @state()
  scrollOffset: number = (this.visibleSamples - 1) / 2;
  @state()
  autoScroll: boolean = true;


  app?: PIXI.Application;
  plotContainer?: PIXI.Container;
  canvasDiv?: HTMLDivElement | null;


  // Sync selectedVariables with variableConfig keys
  public setVariableConfig(config: Record<string, { color: string; visablename: string }>) {
    this.variableConfig = config;
    this.selectedVariables = new Set(Object.keys(config));
    this.renderData();
  }

  // Allow external update of data (for reactivity)
  public setData(data: Map<string, number[]>) {
    this.data = new Map(data);
    this.renderData();
  }

  createRenderRoot(): Element | ShadowRoot {
    return this;
  }

  async firstUpdated(_changedProperties: PropertyValueMap<any> | Map<PropertyKey, unknown>) {
    
    super.firstUpdated(_changedProperties);
    this.canvasDiv = this.renderRoot.querySelector<HTMLDivElement>(".pixi-canvas-div");
    if (!this.canvasDiv || this.canvasDiv.offsetWidth === 0 || this.canvasDiv.offsetHeight === 0) {
      setTimeout(() => this.firstUpdated(_changedProperties), 30);
      return;
    }
    console.log("PixiJS version (runtime):", PIXI.VERSION); 
    if (!this.app) {
      await this.initPixi();
    }
    // If no data, plot some fake data for testing
    if (this.data.size === 0) {
      const fakeX = Array.from({length: 200}, (_, i) => i);
      const fakeY = fakeX.map(x => 50 * Math.sin(x * 0.1));
      this.data = new Map([
        ["sin", fakeY],
        ["cos", fakeX.map(x => 50 * Math.cos(x * 0.1))]
      ]);
      this.variableConfig = {
        sin: { color: "#ff0000", visablename: "sin" },
        cos: { color: "#00ff00", visablename: "cos" }
      };
      this.selectedVariables = new Set(["sin", "cos"]);
    }
    this.renderData();
  }

  initPixi() {
    if (this.app || !this.canvasDiv) return;
    this.app = new PIXI.Application({
      resizeTo: this.canvasDiv as HTMLElement,
      backgroundColor: 0x181818,
      antialias: true,
      resolution: window.devicePixelRatio || 1,
    });
    // Support both PixiJS v7 (app.view) and v8+ (app.canvas)
    const pixiCanvas = (this.app as any).canvas || (this.app as any).view;
    if (!this.canvasDiv.contains(pixiCanvas)) {
      this.canvasDiv.appendChild(pixiCanvas);
    }
    this.plotContainer = new PIXI.Container();
    this.app.stage.addChild(this.plotContainer);
  }

  renderData() {
    if (!this.app || !this.plotContainer) return;
    this.plotContainer.removeChildren();
    const w = this.app.renderer.width;
    const h = this.app.renderer.height;
    console.log('PixiJS canvas size:', w, h);
    // Draw debug rectangle (red border)
    const debugRect = new PIXI.Graphics();
    debugRect.lineStyle(4, 0xff0000, 1);
    debugRect.drawRect(0, 0, w, h);
    this.plotContainer.addChild(debugRect);
    // Draw debug diagonal line (green)
    const debugLine = new PIXI.Graphics();
    debugLine.lineStyle(3, 0x00ff00, 1);
    debugLine.moveTo(0, 0);
    debugLine.lineTo(w, h);
    this.plotContainer.addChild(debugLine);
    // ...existing code for data-driven lines...
    const padding = 10;
    const labelPadding = 24;
    const maxSamples = Math.max(0, ...Array.from(this.data.values()).map((line) => line.length));
    const startSample = Math.max(0, Math.floor(this.scrollOffset - this.visibleSamples / 2));
    const endSample = Math.min(Math.ceil(this.scrollOffset + this.visibleSamples / 2), maxSamples - 1);
    let min = Number.POSITIVE_INFINITY;
    let max = Number.NEGATIVE_INFINITY;
    for (const [name, line] of this.data.entries()) {
      if (!this.selectedVariables.has(name) || line.length < 2) continue;
      for (let i = startSample; i <= endSample; i++) {
        const value = line[i];
        min = Math.min(min, value);
        max = Math.max(max, value);
      }
    }
    const yMin = min;
    const yMax = max;
    const height = yMax - yMin;
    const scaleY = height !== 0 ? (h - padding * 2 - labelPadding * 2) / height : 1;
    const pixelsPerSample = (w - padding * 2) / (this.visibleSamples - 1);
    for (const [name, line] of this.data.entries()) {
      if (!this.selectedVariables.has(name) || line.length < 2) continue;
      let color = this.variableConfig[name]?.color || "#ffffff";
      // PixiJS expects color as number, so convert if string
      let colorNum = typeof color === "string" && color.startsWith("#") ? parseInt(color.slice(1), 16) : color;
      const g = new PIXI.Graphics();
      g.lineStyle(2, colorNum, 1);
      let hasStarted = false;
      for (let i = startSample; i <= endSample && i < line.length; i++) {
        const value = line[i];
        const x = padding + (i - this.scrollOffset + this.visibleSamples / 2) * pixelsPerSample;
        const y = h - labelPadding - padding - (value - yMin) * scaleY;
        if (!hasStarted) {
          g.moveTo(x, y);
          hasStarted = true;
        } else {
          g.lineTo(x, y);
        }
      }
      this.plotContainer.addChild(g);
    }
  }

  render() {
    return html`
      <div class="pixi-canvas-div" style="width: 100%; height: 400px; background: #181818; border-radius: 6px; border: 1px solid #444;"></div>
    `;
  }
}
