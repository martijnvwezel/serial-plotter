import { LitElement, html, css } from "lit";
import { property, query } from "lit/decorators.js";
import { customElement } from "lit/decorators.js";

@customElement("raw-data-view")
export class RawDataView extends LitElement {
  static styles = css`
    @import url('./raw_data_view.css');
  `;

  private _lineBuffer: string[] = [];
  private _isProcessing = false;

  @property({ type: Boolean })
  autoScrollEnabled = true;

  @property({ type: Boolean })
  hideData = false;
  
  @property({ type: Boolean })
  showTimestamp = true;

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
    // For large buffers, show loading state briefly
    if (val.length > 5000 && this._lineBuffer.length === 0) {
      this._isProcessing = true;
      this.requestUpdate();
      
      // Process in next frame to show loading indicator
      requestAnimationFrame(() => {
        this._lineBuffer = val;
        this._isProcessing = false;
        this.requestUpdate();
        this.updateComplete.then(() => {
          if (this.autoScrollEnabled && this.preElement) {
            this.preElement.scrollTop = this.preElement.scrollHeight;
          }
        });
      });
    } else {
      this._lineBuffer = val;
      this.requestUpdate();
      this.updateComplete.then(() => {
        if (this.autoScrollEnabled && this.preElement) {
          this.preElement.scrollTop = this.preElement.scrollHeight;
        }
      });
    }
  }

  handlePauseAutoScroll(e: Event) {
    this.autoScrollEnabled = (e.target as HTMLInputElement).checked;
  }

  handleHideShowData(e: Event) {
    this.hideData = (e.target as HTMLInputElement).checked;
  }
  
  handleToggleTimestamp(e: Event) {
    this.showTimestamp = (e.target as HTMLInputElement).checked;
  }

  handleClearRaw() {
    console.log("Clearing raw data");
    
    this._lineBuffer = [];
    this.requestUpdate();
    
    // Dispatch event to notify parent component to clear its buffer too
    this.dispatchEvent(new CustomEvent('clear-buffer', {
      bubbles: true,
      composed: true
    }));
  }

  updated(changedProperties: Map<string, unknown>) {
    super.updated(changedProperties);
    if (changedProperties.has('_lineBuffer') && this.autoScrollEnabled && this.preElement) {
      this.preElement.scrollTop = this.preElement.scrollHeight;
    }
  }

  render() {
    // Show loading state for large buffers
    if (this._isProcessing) {
      return html`
        <div id="root" class="raw-data-root">
          <div class="raw-data-container">
            <div style="display: flex; align-items: center; justify-content: center; height: 60vh; flex-direction: column; gap: 1rem;">
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#aaa" stroke-width="2">
                <circle cx="12" cy="12" r="10" opacity="0.25"/>
                <path d="M12 2 A10 10 0 0 1 22 12" opacity="1">
                  <animateTransform attributeName="transform" type="rotate" from="0 12 12" to="360 12 12" dur="1s" repeatCount="indefinite"/>
                </path>
              </svg>
              <span style="color: #aaa; font-size: 1.1rem;">Loading serial data...</span>
            </div>
          </div>
        </div>
      `;
    }
    
    // Process lines to optionally remove timestamps (optimized)
    // For performance, limit display to last 10000 lines
    const MAX_DISPLAY_LINES = 10000;
    let linesToDisplay = this._lineBuffer.length > MAX_DISPLAY_LINES 
      ? this._lineBuffer.slice(-MAX_DISPLAY_LINES) 
      : this._lineBuffer;
    
    let displayText: string;
    
    if (linesToDisplay.length === 0) {
      displayText = 'connection...';
    } else if (!this.showTimestamp) {
      // Optimized: process only when needed and use efficient string operations
      displayText = linesToDisplay.map(line => 
        line.replace(/^\[[^\]]+\]\s*/, '')
      ).join("\n");
    } else {
      // Most efficient: just join without processing
      displayText = linesToDisplay.join("\n");
    }
    
    // Add indicator if lines were truncated
    if (this._lineBuffer.length > MAX_DISPLAY_LINES) {
      displayText = `... (showing last ${MAX_DISPLAY_LINES} of ${this._lineBuffer.length} lines)\n${displayText}`;
    }
    
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
            <label>
              <input id="showtimestamp" type="checkbox" @change=${this.handleToggleTimestamp} .checked=${this.showTimestamp} /> Show timestamp
            </label>
            <button id="clearraw" class="button" @click=${this.handleClearRaw}>
              Clear
            </button>
          </div>
          <!-- Raw data view row -->
          <div class="raw-data-view-row" style="height: 60vh; min-height: 200px; max-height: 60vh;">
            <pre class="raw-data-pre" style="height: 100%; max-height: 100%; overflow: auto; background: transparent;">
              <code id="raw">\n${displayText}</code>
            </pre>
          </div>
        </div>
      </div>
    `;

  }
}
