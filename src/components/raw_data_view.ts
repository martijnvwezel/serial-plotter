import { LitElement, html, css } from "lit";
import { property, query } from "lit/decorators.js";
import { customElement } from "lit/decorators.js";

@customElement("raw-data-view")
export class RawDataView extends LitElement {
  static styles = css`
    @import url('./raw_data_view.css');
  `;

  private _lineBuffer: string[] = [];

  @property({ type: Boolean })
  autoScrollEnabled = true;

  @property({ type: Boolean })
  hideData = false;

  @query('.raw-data-pre')
  private preElement!: HTMLPreElement;

  public addLine(lines: string | string[]) {
    
    
    if (Array.isArray(lines)) {
      this._lineBuffer.push(...lines);
    } else {
      this._lineBuffer.push(lines);
    }
    this.requestUpdate();
    // Ensure scroll is at the bottom after DOM updates, even with high-frequency data
    this.updateComplete.then(() => {
      if (this.autoScrollEnabled && this.preElement) {
        this.preElement.scrollTop = this.preElement.scrollHeight;
      }
    });
  }

  @property({ type: Array })
  get lineBuffer() {
    return this._lineBuffer;
  }

  set lineBuffer(val: string[]) {
    this._lineBuffer = val;
    this.requestUpdate();
    this.updateComplete.then(() => {
      if (this.autoScrollEnabled && this.preElement) {
        this.preElement.scrollTop = this.preElement.scrollHeight;
      }
    });
  }

  handlePauseAutoScroll(e: Event) {
    this.autoScrollEnabled = (e.target as HTMLInputElement).checked;
  }

  handleHideShowData(e: Event) {
    this.hideData = (e.target as HTMLInputElement).checked;
  }

  handleClearRaw() {
    console.log("Clearing raw data");
    
    this._lineBuffer = [];
    this.requestUpdate();
  }

  updated(changedProperties: Map<string, unknown>) {
    super.updated(changedProperties);
    if (changedProperties.has('_lineBuffer') && this.autoScrollEnabled && this.preElement) {
      this.preElement.scrollTop = this.preElement.scrollHeight;
    }
  }

  render() {
    const displayText = this._lineBuffer.length === 0 ? 'connection...' : this._lineBuffer.join("\n");
    return html`
      <div id="root" class="raw-data-root">
        <div class="raw-data-container">
          <!-- Header and controls row -->
          <div class="raw-data-controls-row">
            <span class="raw-data-title">Raw</span>
            <label>
              <input id="autoscroll" type="checkbox" @change=${this.handlePauseAutoScroll} .checked=${this.autoScrollEnabled} /> Auto-scroll
            </label>
            <label>
              <input id="hidedata" type="checkbox" @change=${this.handleHideShowData} .checked=${this.hideData} /> Hide data lines
            </label>
            <button id="clearraw" class="button" @click=${this.handleClearRaw}>
              Clear
            </button>
          </div>
          <!-- Raw data view row -->
          <div class="raw-data-view-row" style="height: 60vh; min-height: 200px; max-height: 60vh;">
            <pre class="raw-data-pre" style="height: 100%; max-height: 100%; overflow: auto; background: transparent;">
              <code id="raw">${displayText}</code>
            </pre>
          </div>
        </div>
      </div>
    `;

  }
}
