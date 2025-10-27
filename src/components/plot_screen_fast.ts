import { LitElement, html, PropertyValueMap } from "lit";
import { property, customElement, state } from "lit/decorators.js";

// Import PixiJS (for WebGL rendering)
import * as PIXI from "pixi.js"; 

@customElement("plot-screen-fast")
export class PlotScreenFast extends LitElement {
  // Throttle renderData updates
  private renderInterval = 30; // ms, ~30 FPS
  private renderTimer: number | null = null;

  @property({ type: Object })
  variableConfig: Record<string, { color: string; visablename: string }> = {};
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
  scrollOffset: number = 8196 / 2; // Initialize to half of visibleSamples
  @state()
  stats: Array<{ 
    key: string; 
    min: number | string; 
    max: number | string; 
    mean: number | string;
    median: number | string;
    slope: number | string;
    peakToPeak: number | string;
    peakToPeakWidth: number | string;
    current: number | string;
  }> = [];
  
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
  
  // --- Horizontal panning state ---
  private isDragging = false;
  private startDragX = 0;
  private startScrollOffset = 0;

  @property()
  padding = 10;
  @property()
  lineWidth = 2;
  @property()
  maxSamples = 1000000;

  app?: PIXI.Application;
  plotContainer?: PIXI.Container;
  canvasDiv?: HTMLDivElement | null;
  private resizeObserver?: ResizeObserver;

  // Allow external updates to add a new line of data (like raw_data_view)
  public addLine(variable: string, value: number) {
    // Only add data if variable is present in variableConfig (i.e., not deleted)
    if (!this.variableConfig.hasOwnProperty(variable)) {
      return;
    }
    let graphData = this.data.get(variable) ?? [];
    graphData.push(value);
    this.data.set(variable, graphData);

    // Maintain color mapping for the variable
    if (!this.dataColors.has(variable)) {
      this.getDataColor(variable);
    }
  }

  // Renamed updateLine to updateLineColors for clarity
  public updateLineColors(variable: string, value: number) {
    // Only add data if variable is present in variableConfig (i.e., not deleted)
    if (!this.variableConfig.hasOwnProperty(variable)) {
      return;
    }
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

  handleClose() {
    this.remove();
  }

  handleVisibleSamplesChange(e: Event) {
    const target = e.target as HTMLInputElement;
    this.visibleSamples = parseInt(target.value, 10);
    this.renderData();
  }

  handleAutoScrollChange(e: Event) {
    const checkbox = e.target as HTMLInputElement;
    this.autoScroll = checkbox.checked;
    const maxSamples = Math.max(...Array.from(this.data.values()).map((line) => line.length));
    this.scrollOffset = maxSamples - this.visibleSamples / 2;
    this.renderData();
  }

  handleAutoScaleYClick() {
    this.autoScaleY = true;
    this.yMin = null;
    this.yMax = null;
    this.renderData();
  }

  // Mouse event handlers for panning
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
    if (this.isDragging && !this.autoScroll && this.canvasDiv) {
      const deltaX = event.clientX - this.startDragX;
      const pixelsPerSample = this.canvasDiv.clientWidth / (this.visibleSamples - 1);
      this.scrollOffset = this.startScrollOffset - deltaX / pixelsPerSample;
      this.renderData();
    }
    // Vertical panning for y-axis
    if (this.isYDragging && !this.autoScaleY && this.canvasDiv) {
      const deltaY = event.clientY - this.startDragY;
      const dpr = window.devicePixelRatio;
      const h = this.canvasDiv.clientHeight * dpr;
      const yRange = (this.startYMax - this.startYMin);
      const panFrac = deltaY / h;
      let newYMin = this.startYMin + panFrac * yRange;
      let newYMax = this.startYMax + panFrac * yRange;
      // Enforce minimum height
      if (newYMax - newYMin < PlotScreenFast.MIN_Y_HEIGHT) {
        const center = (newYMax + newYMin) / 2;
        newYMin = center - PlotScreenFast.MIN_Y_HEIGHT / 2;
        newYMax = center + PlotScreenFast.MIN_Y_HEIGHT / 2;
      }
      this.yMin = newYMin;
      this.yMax = newYMax;
      this.renderData();
    }
  }

  handleMouseUp() {
    this.isDragging = false;
    this.isYDragging = false;
  }

  // Improved wheel handler with zoom at mouse position
  handleCanvasWheel(event: WheelEvent) {
    event.preventDefault();
    
    if (event.shiftKey) {
      // Shift + wheel: Pan Y-axis
      if (this.autoScaleY) return;
      if (this.yMax === null || this.yMin === null) return;
      const range = (this.yMax - this.yMin);
      const pan = range * 0.1 * (event.deltaY > 0 ? 1 : -1);
      let newYMin = this.yMin + pan;
      let newYMax = this.yMax + pan;
      if (newYMax - newYMin < PlotScreenFast.MIN_Y_HEIGHT) {
        const center = (newYMax + newYMin) / 2;
        newYMin = center - PlotScreenFast.MIN_Y_HEIGHT / 2;
        newYMax = center + PlotScreenFast.MIN_Y_HEIGHT / 2;
      }
      this.yMin = newYMin;
      this.yMax = newYMax;
    } else if (event.ctrlKey || event.metaKey) {
      // Ctrl/Cmd + wheel: Zoom Y-axis at mouse position
      // Disable auto-scale Y immediately when user starts zooming
      if (this.autoScaleY) {
        this.autoScaleY = false;
        // Initialize yMin/yMax to current data range if not set
        if (this.yMin === null || this.yMax === null) {
          let min = Number.POSITIVE_INFINITY;
          let max = Number.NEGATIVE_INFINITY;
          const maxSamples = Math.max(0, ...Array.from(this.data.values()).map((line) => line.length));
          const startSample = Math.max(0, Math.floor(this.scrollOffset - this.visibleSamples / 2));
          const endSample = Math.min(Math.ceil(this.scrollOffset + this.visibleSamples / 2), maxSamples - 1);
          
          for (const [name, line] of this.data.entries()) {
            if (!this.selectedVariables.has(name) || line.length < 2) continue;
            for (let i = startSample; i <= endSample; i++) {
              const value = line[i];
              if (value != null && !isNaN(value) && isFinite(value)) {
                min = Math.min(min, value);
                max = Math.max(max, value);
              }
            }
          }
          this.yMin = min;
          this.yMax = max;
        }
      }
      
      if (this.yMax === null || this.yMin === null) return;
      
      const rect = (event.target as HTMLElement).getBoundingClientRect();
      const mouseY = event.clientY - rect.top;
      const relativeY = 1 - (mouseY / rect.height); // 0 at bottom, 1 at top
      const mouseValueY = this.yMin + relativeY * (this.yMax - this.yMin);
      
      let range = (this.yMax - this.yMin);
      const zoomFactor = event.deltaY > 0 ? 1.1 : 0.9;
      range *= zoomFactor;
      
      if (range < PlotScreenFast.MIN_Y_HEIGHT) {
        range = PlotScreenFast.MIN_Y_HEIGHT;
      }
      
      // Keep mouse position at same value
      this.yMin = mouseValueY - relativeY * range;
      this.yMax = mouseValueY + (1 - relativeY) * range;
    } else {
      // Normal wheel: Zoom X-axis at mouse position
      const rect = (event.target as HTMLElement).getBoundingClientRect();
      const mouseX = event.clientX - rect.left;
      const relativeX = mouseX / rect.width; // 0 at left, 1 at right
      
      const oldVisible = this.visibleSamples;
      const zoomFactor = event.deltaY > 0 ? 1.1 : 0.9;
      let newVisible = Math.max(PlotScreenFast.MIN_VISIBLE_SAMPLES, oldVisible * zoomFactor);
      
      const maxSamples = Math.max(...Array.from(this.data.values()).map((line) => line.length));
      if (maxSamples > 0) {
        newVisible = Math.min(newVisible, maxSamples);
      }
      
      // Adjust scroll offset to keep mouse position fixed
      const mouseSample = this.scrollOffset - this.visibleSamples / 2 + relativeX * this.visibleSamples;
      this.visibleSamples = newVisible;
      this.scrollOffset = mouseSample + newVisible / 2 - relativeX * newVisible;
      this.autoScroll = false;
    }
    
    this.renderData();
  }

  // Drag and drop handlers
  handleDragOver(event: DragEvent) {
    event.preventDefault();
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = 'copy';
    }
  }

  handleDrop(event: DragEvent) {
    event.preventDefault();
    if (event.dataTransfer) {
      const variableKey = event.dataTransfer.getData('application/x-variable-key') || 
                          event.dataTransfer.getData('text/plain');
      
      if (variableKey && this.variableConfig.hasOwnProperty(variableKey)) {
        // Find the maximum data length across all variables
        const maxLength = Math.max(0, ...Array.from(this.data.values()).map((line) => line.length));
        
        // Get the current data for the variable
        let varData = this.data.get(variableKey) ?? [];
        
        // If this variable has less data than others, pad it with null values
        // This makes it sync with the timeline and start plotting from current position
        if (varData.length < maxLength) {
          const nullPadding = new Array(maxLength - varData.length).fill(null);
          varData = [...nullPadding, ...varData];
          this.data.set(variableKey, varData);
        }
        
        // Toggle the variable selection (show it if hidden, or just keep it shown)
        const newSet = new Set(this.selectedVariables);
        if (!newSet.has(variableKey)) {
          newSet.add(variableKey);
          this.selectedVariables = newSet;
          this.renderData();
        }
        // Could also dispatch an event to notify that a variable was dropped
        this.dispatchEvent(new CustomEvent('variable-dropped', {
          detail: { variableKey },
          bubbles: true,
          composed: true
        }));
      }
    }
  }


  // Sync selectedVariables with variableConfig keys
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
    for (const [name, obj] of Object.entries(config)) {
      newColors.set(name, obj.color);
    }
    this.dataColors = newColors;
    // DON'T auto-select all variables - only show what's been dragged in
    // Remove any selected variables that are no longer in config
    const currentSelected = new Set(this.selectedVariables);
    for (const key of currentSelected) {
      if (!config.hasOwnProperty(key)) {
        this.selectedVariables.delete(key);
      }
    }
    this.requestUpdate();
  }

  // Allow external update of data (for reactivity)
  public setData(data: Map<string, number[]>) {
    this.data = new Map(data);
    this.renderData();
  }

  createRenderRoot(): Element | ShadowRoot {
    return this;
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    // Clean up ResizeObserver
    if (this.resizeObserver && this.canvasDiv) {
      this.resizeObserver.unobserve(this.canvasDiv);
      this.resizeObserver.disconnect();
    }
    // Clean up PixiJS app
    if (this.app) {
      this.app.destroy(true, { children: true, texture: true });
      this.app = undefined;
    }
  }

  @state()
  updated(changedProps: PropertyValueMap<any> | Map<PropertyKey, unknown>) {
    super.updated?.(changedProps);
    // DON'T auto-enable variables - only show what's been explicitly dragged in
  }

  async firstUpdated(_changedProperties: PropertyValueMap<any> | Map<PropertyKey, unknown>) {
    
    super.firstUpdated(_changedProperties);
    this.canvasDiv = this.renderRoot.querySelector<HTMLDivElement>(".pixi-canvas-div");
    if (!this.canvasDiv || this.canvasDiv.offsetWidth === 0 || this.canvasDiv.offsetHeight === 0) {
      setTimeout(() => this.firstUpdated(_changedProperties), 30);
      return;
    }
    if (!this.app) {
      await this.initPixi();
    }
    
    // Add event listeners
    if (this.canvasDiv) {
      this.canvasDiv.addEventListener("mousedown", this.handleMouseDown.bind(this));
      this.canvasDiv.addEventListener("mousemove", this.handleMouseMove.bind(this));
      this.canvasDiv.addEventListener("mouseup", this.handleMouseUp.bind(this));
      this.canvasDiv.addEventListener("mouseleave", this.handleMouseUp.bind(this));
      this.canvasDiv.addEventListener("wheel", this.handleCanvasWheel.bind(this), { passive: false });
      
      // Add drag and drop event listeners
      this.canvasDiv.addEventListener("dragover", this.handleDragOver.bind(this));
      this.canvasDiv.addEventListener("drop", this.handleDrop.bind(this));
    }
    
    // DON'T auto-select variables - graphs start empty
    
    this.renderData();
  }

  async initPixi() {
    if (this.app || !this.canvasDiv) return;
    try {
      // Create PixiJS Application with async pattern
      this.app = new PIXI.Application();
      await this.app.init({
        width: this.canvasDiv.clientWidth,
        height: this.canvasDiv.clientHeight,
        background: 0x181818,
        antialias: true,
        resolution: window.devicePixelRatio || 1,
        autoDensity: true,
      });
      // Support both PixiJS v7 (app.view) and v8+ (app.canvas)
      const pixiCanvas = (this.app as any).canvas || (this.app as any).view;
      if (pixiCanvas && !this.canvasDiv.contains(pixiCanvas)) {
        this.canvasDiv.appendChild(pixiCanvas);
      }
      this.plotContainer = new PIXI.Container();
      if (this.app && this.app.stage) {
        this.app.stage.addChild(this.plotContainer);
      }
      
      // Set up ResizeObserver to handle container resizing
      this.resizeObserver = new ResizeObserver(() => {
        if (this.app && this.canvasDiv) {
          this.app.renderer.resize(this.canvasDiv.clientWidth, this.canvasDiv.clientHeight);
          this.renderData();
        }
      });
      this.resizeObserver.observe(this.canvasDiv);
    } catch (error) {
      console.error("Failed to initialize PixiJS:", error);
    }
  }

  renderData() {
    if (!this.app || !this.plotContainer || !this.isConnected) return;
    
    // Throttle updates: only schedule next render after interval
    if (this.renderTimer !== null) {
      clearTimeout(this.renderTimer);
    }
    this.renderTimer = window.setTimeout(() => this.renderData(), this.renderInterval);
    
    this.plotContainer.removeChildren();
    const w = this.app.renderer.width;
    const h = this.app.renderer.height;
    
    if (w === 0 || h === 0) return;
    
    const padding = this.padding;
    const labelPadding = 24;
    const maxSamples = Math.max(0, ...Array.from(this.data.values()).map((line) => line.length));
    const startSample = Math.max(0, Math.floor(this.scrollOffset - this.visibleSamples / 2));
    const endSample = Math.min(Math.ceil(this.scrollOffset + this.visibleSamples / 2), maxSamples - 1);
    
    // --- Stats calculation for visible window ---
    const newStats = Array.from(this.data.entries())
      .map(([key, values]) => {
        if (!values.length) {
          return { key, min: 'N/A', max: 'N/A', mean: 'N/A', median: 'N/A', slope: 'N/A', peakToPeak: 'N/A', peakToPeakWidth: 'N/A', current: 'N/A' };
        }
        const visible = values.slice(startSample, endSample + 1).filter(v => typeof v === 'number' && !isNaN(v));
        if (!visible.length) {
          return { key, min: 'N/A', max: 'N/A', mean: 'N/A', median: 'N/A', slope: 'N/A', peakToPeak: 'N/A', peakToPeakWidth: 'N/A', current: 'N/A' };
        }
        
        const minV = Math.min(...visible);
        const maxV = Math.max(...visible);
        const current = visible[visible.length - 1];
        
        // Calculate mean
        const mean = visible.reduce((sum, v) => sum + v, 0) / visible.length;
        
        // Calculate median
        const sorted = [...visible].sort((a, b) => a - b);
        const median = sorted.length % 2 === 0
          ? (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2
          : sorted[Math.floor(sorted.length / 2)];
        
        // Peak to peak height (value difference)
        const peakToPeak = maxV - minV;
        
        // Peak to peak width (sample distance between min and max)
        const visibleWithIndices = values.slice(startSample, endSample + 1);
        const minIndex = visibleWithIndices.findIndex(v => v === minV);
        const maxIndex = visibleWithIndices.findIndex(v => v === maxV);
        const peakToPeakWidth = Math.abs(maxIndex - minIndex);
        
        // Calculate slope between min and max peaks
        // Slope = (change in value) / (change in samples)
        let slope: number | string = 'N/A';
        if (peakToPeakWidth > 0) {
          slope = (maxV - minV) / peakToPeakWidth;
        }
        
        return { key, min: minV, max: maxV, mean, median, slope, peakToPeak, peakToPeakWidth, current };
      });
    // Only update and requestUpdate if stats changed
    const statsChanged = JSON.stringify(this.stats) !== JSON.stringify(newStats);
    if (statsChanged) {
      this.stats = newStats;
      this.requestUpdate();
    }
    
    let min = Number.POSITIVE_INFINITY;
    let max = Number.NEGATIVE_INFINITY;
    for (const [name, line] of this.data.entries()) {
      if (!this.selectedVariables.has(name) || line.length < 2) continue;
      for (let i = startSample; i <= endSample; i++) {
        const value = line[i];
        if (value != null && !isNaN(value) && isFinite(value)) {
          min = Math.min(min, value);
          max = Math.max(max, value);
        }
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
    const scaleY = height !== 0 ? (h - padding * 2 - labelPadding * 2) / height : 1;
    const yAxisOffset = 60; // Increased offset for Y-axis labels
    const pixelsPerSample = (w - padding * 2 - yAxisOffset) / (this.visibleSamples - 1);
    
    // Auto-scroll logic
    if (this.autoScroll) {
      if (maxSamples > this.visibleSamples) {
        // If we have more samples than visible, scroll to show the latest
        const targetScrollOffset = maxSamples - this.visibleSamples / 2;
        this.scrollOffset = this.scrollOffset * 0.4 + targetScrollOffset * 0.6;
      } else {
        // If we have fewer samples than visible, keep scrollOffset at visibleSamples/2
        // so that sample 0 starts at x = leftBoundary
        this.scrollOffset = this.visibleSamples / 2;
      }
    } else {
      // When auto-scroll is off, if we have fewer samples than visible window,
      // clamp scrollOffset to ensure samples stay in view
      if (maxSamples < this.visibleSamples) {
        const minScroll = this.visibleSamples / 2;
        const maxScroll = maxSamples - this.visibleSamples / 2;
        if (maxScroll < minScroll) {
          // Very few samples - center them
          this.scrollOffset = this.visibleSamples / 2;
        } else {
          this.scrollOffset = Math.max(minScroll, Math.min(maxScroll, this.scrollOffset));
        }
      }
    }
    
    // Draw Y-axis grid and labels
    const labelHeight = 50;
    const numYLabels = Math.floor(h / labelHeight);
    const gridLines = new PIXI.Graphics();
    
    for (let i = 0; i <= numYLabels; i++) {
      const yValue = yMin + (i / numYLabels) * height;
      const y = h - labelPadding - padding - (yValue - yMin) * scaleY;
      gridLines.moveTo(padding + yAxisOffset, y);
      gridLines.lineTo(w - padding, y);
    }
    gridLines.stroke({ width: 1, color: 0x333333, alpha: 0.3 });
    this.plotContainer.addChild(gridLines);
    
    // Create a clipping mask for the data area (between Y-axis and right edge)
    const clipMask = new PIXI.Graphics();
    clipMask.rect(
      padding + yAxisOffset,
      padding,
      w - padding * 2 - yAxisOffset,
      h - padding * 2 - labelPadding
    );
    clipMask.fill({ color: 0xffffff });
    this.plotContainer.addChild(clipMask);
    
    // Draw zero line if it's in the visible range (prominent white line)
    if (yMin <= 0 && yMax >= 0) {
      const zeroY = h - labelPadding - padding - (0 - yMin) * scaleY;
      const zeroLine = new PIXI.Graphics();
      zeroLine.moveTo(padding + yAxisOffset, zeroY);
      zeroLine.lineTo(w - padding, zeroY);
      zeroLine.stroke({ width: 2, color: 0xeeeeee, alpha: 0.7 });
      this.plotContainer.addChild(zeroLine);
    }
    
    // Draw X and Y axis lines
    const axisLines = new PIXI.Graphics();
    
    // Y-axis (left side)
    const leftX = padding + yAxisOffset;
    axisLines.moveTo(leftX, padding);
    axisLines.lineTo(leftX, h - labelPadding - padding);
    
    // X-axis (bottom)
    const bottomY = h - labelPadding - padding;
    axisLines.moveTo(padding + yAxisOffset, bottomY);
    axisLines.lineTo(w - padding, bottomY);
    
    axisLines.stroke({ width: 2, color: 0x888888, alpha: 0.8 });
    this.plotContainer.addChild(axisLines);
    
    // Draw Y-axis labels using PixiJS Text
    for (let i = 0; i <= numYLabels; i++) {
      const yValue = yMin + (i / numYLabels) * height;
      const y = h - labelPadding - padding - (yValue - yMin) * scaleY;
      const text = new PIXI.Text({
        text: yValue.toFixed(2),
        style: {
          fontSize: 14,
          fill: 0xcccccc,
          align: 'right'
        }
      });
      text.anchor.set(1, 0.5);
      text.x = padding + yAxisOffset - 5;
      text.y = y;
      this.plotContainer.addChild(text);
    }
    
    // Draw X-axis labels
    const labelWidthPx = 96;
    const numXLabels = Math.floor(w / labelWidthPx);
    const step = Math.ceil(this.visibleSamples / numXLabels);
    
    for (let i = startSample; i <= endSample; i++) {
      const x = padding + yAxisOffset + (i - this.scrollOffset + this.visibleSamples / 2) * pixelsPerSample;
      if (x >= padding + yAxisOffset && x <= w - padding && i % step === 0) {
        const text = new PIXI.Text({
          text: i.toString(),
          style: {
            fontSize: 14,
            fill: 0xaaaaaa,
            align: 'center'
          }
        });
        text.anchor.set(0.5, 0);
        text.x = x;
        text.y = h - labelPadding + 4;
        this.plotContainer.addChild(text);
      }
    }
    
    // Create a container for data lines with clipping mask
    const dataLinesContainer = new PIXI.Container();
    dataLinesContainer.mask = clipMask;
    this.plotContainer.addChild(dataLinesContainer);
    
    // Draw data lines
    for (const [name, line] of this.data.entries()) {
      if (!this.selectedVariables.has(name) || line.length < 2) continue;
      let color = this.variableConfig[name]?.color || this.getDataColor(name) || "#ffffff";
      // PixiJS expects color as number, so convert if string
      let colorNum = typeof color === "string" && color.startsWith("#") ? parseInt(color.slice(1), 16) : color;
      
      const leftBoundary = padding + yAxisOffset;
      const rightBoundary = w - padding;
      
      const g = new PIXI.Graphics();
      let pathStarted = false;
      
      for (let i = startSample; i <= endSample && i < line.length; i++) {
        const value = line[i];
        
        // Check if this point has a valid value
        const isValidPoint = value != null && !isNaN(value) && isFinite(value);
        
        if (isValidPoint) {
          const x = padding + yAxisOffset + (i - this.scrollOffset + this.visibleSamples / 2) * pixelsPerSample;
          const y = h - labelPadding - padding - (value - yMin) * scaleY;
          
          // Draw the point even if slightly outside bounds to ensure line continuity
          // The clipping mask will hide parts outside the graph area
          if (!pathStarted) {
            g.moveTo(x, y);
            pathStarted = true;
          } else {
            g.lineTo(x, y);
          }
        } else {
          // Stop drawing when we hit a null/NaN value
          pathStarted = false;
        }
      }
      
      // Stroke the entire path
      g.stroke({ width: this.lineWidth, color: colorNum });
      dataLinesContainer.addChild(g);
    }
  }

  render() {
    // Compute statistics for each variable for the visible window
    const maxSamples = Math.max(0, ...Array.from(this.data.values()).map((line) => line.length));
    // Clamp visibleSamples to maxSamples if needed
    let visibleSamples = Math.max(PlotScreenFast.MIN_VISIBLE_SAMPLES, Math.min(this.visibleSamples, maxSamples > 0 ? maxSamples : this.visibleSamples));
    if (visibleSamples !== this.visibleSamples) {
      this.visibleSamples = visibleSamples;
    }
    
    // Only show stats for variables present in variableConfig
    const filteredStats = this.stats.filter(stat => this.variableConfig.hasOwnProperty(stat.key));
    
    // Helper to get visablename if present
    const getDisplayName = (key: string) => {
      if (this.variableConfig && this.variableConfig[key] && this.variableConfig[key].visablename) {
        return this.variableConfig[key].visablename;
      }
      return key;
    };
    
    // Helper to format numbers properly
    const formatValue = (value: number | string): string => {
      if (typeof value === 'string') return value; // Return 'N/A' as-is
      if (!isFinite(value) || isNaN(value)) return 'N/A';
      
      // Round to 4 significant digits to avoid floating point precision issues
      const absValue = Math.abs(value);
      if (absValue === 0) return '0';
      if (absValue >= 1000 || absValue < 0.001) {
        // Use scientific notation for very large or very small numbers
        return value.toExponential(3);
      }
      // For normal range, use fixed decimal with up to 4 significant figures
      const decimalPlaces = Math.max(0, 4 - Math.floor(Math.log10(absValue)) - 1);
      return value.toFixed(Math.min(decimalPlaces, 4));
    };
    
    return html`
      <div style="display: flex; flex-direction: column; gap: 1.2rem; width: 100%; border: 1px solid #aaa; border-radius: 4px; padding: 1.2rem 1.2rem 1.8rem 1.2rem; background: #232323;">
        <!-- Statistics Table -->
        <div style="margin-bottom: 0.5rem; overflow-x: auto;">
          <table style="width: 100%; border-collapse: collapse; font-size: 0.85rem;">
            <thead>
              <tr style="background: #232323; color: #aaa;">
                <th style="padding: 0.3em 0.4em; border-bottom: 1px solid #444; text-align: left;">Variable</th>
                <th style="padding: 0.3em 0.4em; border-bottom: 1px solid #444; text-align: right;">Min</th>
                <th style="padding: 0.3em 0.4em; border-bottom: 1px solid #444; text-align: right;">Max</th>
                <th style="padding: 0.3em 0.4em; border-bottom: 1px solid #444; text-align: right;">Mean</th>
                <th style="padding: 0.3em 0.4em; border-bottom: 1px solid #444; text-align: right;">Median</th>
                <th style="padding: 0.3em 0.4em; border-bottom: 1px solid #444; text-align: right;">Slope</th>
                <th style="padding: 0.3em 0.4em; border-bottom: 1px solid #444; text-align: right;">P2P</th>
                <th style="padding: 0.3em 0.4em; border-bottom: 1px solid #444; text-align: right;">P2PW</th>
                <th style="padding: 0.3em 0.4em; border-bottom: 1px solid #444; text-align: right;">Current</th>
              </tr>
            </thead>
            <tbody>
              ${filteredStats.map(stat => html`
                <tr>
                  <td style="padding: 0.3em 0.4em; color: ${this.getDataColor(stat.key)}; font-weight: 600;">${getDisplayName(stat.key)}</td>
                  <td style="padding: 0.3em 0.4em; text-align: right;">${formatValue(stat.min)}</td>
                  <td style="padding: 0.3em 0.4em; text-align: right;">${formatValue(stat.max)}</td>
                  <td style="padding: 0.3em 0.4em; text-align: right;">${formatValue(stat.mean)}</td>
                  <td style="padding: 0.3em 0.4em; text-align: right;">${formatValue(stat.median)}</td>
                  <td style="padding: 0.3em 0.4em; text-align: right;">${formatValue(stat.slope)}</td>
                  <td style="padding: 0.3em 0.4em; text-align: right;">${formatValue(stat.peakToPeak)}</td>
                  <td style="padding: 0.3em 0.4em; text-align: right;">${formatValue(stat.peakToPeakWidth)}</td>
                  <td style="padding: 0.3em 0.4em; text-align: right;">${formatValue(stat.current)}</td>
                </tr>
              `)}
            </tbody>
          </table>
        </div>
        
        <!-- Controls -->
        <div style="display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.5rem;">
          <label>Auto-scroll</label>
          <input type="checkbox" .checked="${this.autoScroll}" @change=${this.handleAutoScrollChange} />
          <label style="display: none;">Zoom</label>
          <input
            type="range"
            min="${PlotScreenFast.MIN_VISIBLE_SAMPLES}"
            max="${Math.max(PlotScreenFast.MIN_VISIBLE_SAMPLES, maxSamples)}"
            .value="${String(visibleSamples)}"
            @input=${this.handleVisibleSamplesChange}
            style="display: none; flex-grow: 1; max-width: 350px; outline: none;"
          />
          <label style="margin-left: 1em;">
            <input type="checkbox" .checked="${this.autoScaleY}" @change=${(e: Event) => {
              this.autoScaleY = (e.target as HTMLInputElement).checked;
              if (this.autoScaleY) {
                this.yMin = null;
                this.yMax = null;
              }
              this.renderData();
            }} />
            Auto-scale Y
          </label>
        </div>
        
        <!-- Plot Area -->
        <div class="pixi-canvas-div" style="resize: vertical; overflow: hidden; width: 100%; height: 500px; background: #181818; border-radius: 6px; border: 1px solid #444;"></div>
        
        <!-- Add Plot Button -->
        <div style="display: flex; justify-content: flex-start; margin-top: 1.8rem;">
          <button @click=${this.handleAddPlot}
            id="addplot"
            style="align-self: flex-start; background: #5a5a5a; color: #c3c1c1ff; border: 1px solid #888; border-radius: 6px; padding: 0.45rem 1.1rem; font-size: 1rem; font-weight: 600; letter-spacing: 0.03em; min-width: 8.5rem; cursor: pointer; transition: border 0.2s, box-shadow 0.2s;">
            Add plot (experimental)
          </button>
        </div>
      </div>
    `;
  }
}
