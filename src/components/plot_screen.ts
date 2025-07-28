import { LitElement, html, PropertyValueMap } from "lit";
import { property } from "lit/decorators.js";
import { customElement, state } from "lit/decorators.js";

@customElement("plot-screen")
export class PlotScreen extends LitElement {
  // Allow external updates to add a new line of data (like raw_data_view)
  public updateLine(variable: string, value: number) {
    // Add or update the data for the variable
    let arr = this.data.get(variable) ?? [];
    arr.push(value);
    this.data.set(variable, arr);
    // Ensure reactivity
    this.data = new Map(this.data);

    // Log the new data
    console.log(`[PlotScreen] New data added for variable '${variable}': ${value}`);
    console.log(`[PlotScreen] Current data state:`, this.data);
  }

  // Allow external update of variable config (colors, etc) from sidebar
  public setVariableConfig(config: Record<string, { color: string }>) {
    console.log(`[PlotScreen] Updating variable config:`, config);
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
  visibleSamples: number = 100;
  @state()
  scrollOffset: number = 49.5;


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

  handleAutoScrollChange(e: Event) {
    this.autoScroll = (e.target as HTMLInputElement).checked;
  }

  handleVisibleSamplesChange(e: Event) {
    this.visibleSamples = Number((e.target as HTMLInputElement).value);
  }

  handleAddPlot() {
    this.dispatchEvent(new CustomEvent('add-plot', { bubbles: true, composed: true }));
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
