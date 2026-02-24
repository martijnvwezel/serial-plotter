interface Port {
	path: string;
	manufacturer?: string;
	vendorId?: string; // we want as much info as possible so we can match devices super robust
	productId?: string;
	serialNumber?: string;
	pnpId?: string;
}

interface PortsRequest {
	type: "ports";
}

interface PortsResponse {
	type: "ports-response";
	ports: Port[];
}

interface StartMonitorPortRequest {
	type: "start-monitor";
	port: string;
	baudRate: number;
	deviceId?: {
		vendorId?: string;
		productId?: string;
		serialNumber?: string;
	};
}

interface StopMonitorPortRequest {
	type: "stop-monitor";
}

interface ErrorResponse {
	type: "error";
	text: string;
}

interface DataResponse {
	type: "data",
	text: string;
}

interface ConnectionStatusResponse {
	type: "connection-status";
	connected: boolean;
	message?: string;
}

interface SaveCsvRequest {
	type: "save-csv";
	filename: string;
	content: string;
}

interface ReconnectRequest {
	type: "reconnect";
}

interface SendCommandRequest {
	type: "send-command";
	command: string;
}

interface UpdateSidebarVariablesRequest {
	type: "update-sidebar-variables";
	variableConfig: Record<string, { color: string; visablename: string }>;
	variableMap: Array<[string, number[]]>;
}

interface SidebarConfigChangedResponse {
	type: "sidebar-config-changed";
	variableConfig: Record<string, { color: string; visablename: string }>;
}

interface SidebarResetBufferResponse {
	type: "sidebar-reset-buffer";
}

interface SidebarDragStartResponse {
	type: "sidebar-drag-start";
	variableKey: string;
}

interface RequestDefaultsRequest {
	type: "request-defaults";
}

interface ApplyDefaultsResponse {
	type: "apply-defaults";
	defaultBaudRate: number;
	autoVariableUpdateOnStart: boolean;
	defaultScreen: 'plot' | 'raw';
	defaultSidebarVisible: boolean;
}

type ProtocolRequests = PortsRequest | StartMonitorPortRequest | StopMonitorPortRequest | SaveCsvRequest | ReconnectRequest | SendCommandRequest | UpdateSidebarVariablesRequest | RequestDefaultsRequest;
type ProtocolResponse = PortsResponse | DataResponse | ErrorResponse | ConnectionStatusResponse | SidebarConfigChangedResponse | SidebarResetBufferResponse | SidebarDragStartResponse | ApplyDefaultsResponse;