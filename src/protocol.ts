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

type ProtocolRequests = PortsRequest | StartMonitorPortRequest | StopMonitorPortRequest | SaveCsvRequest | ReconnectRequest | SendCommandRequest;
type ProtocolResponse = PortsResponse | DataResponse | ErrorResponse | ConnectionStatusResponse;