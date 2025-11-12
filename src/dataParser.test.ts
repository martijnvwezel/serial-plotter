import { describe, it, expect } from 'vitest';
import { parseDataLine, extractVariableNames, ParsedVariable } from './dataParser';

describe('parseDataLine', () => {
	it('should parse complex JSON-like data with multiple fields', () => {
		const line = '{top_index: 5289, top_value: 7298, start_index: 5164, end_index: 5498, firmness: 1650, deltaPeak: 2034, start_to_end_index: 334, calibrated_zero: 5264, start_value: 4903, end_value: 5106}';
		
		const result = parseDataLine(line);
		
		expect(result).toHaveLength(10);
		expect(result).toContainEqual({ name: 'top_index', value: 5289 });
		expect(result).toContainEqual({ name: 'top_value', value: 7298 });
		expect(result).toContainEqual({ name: 'start_index', value: 5164 });
		expect(result).toContainEqual({ name: 'end_index', value: 5498 });
		expect(result).toContainEqual({ name: 'firmness', value: 1650 });
		expect(result).toContainEqual({ name: 'deltaPeak', value: 2034 });
	});

	it('should handle data with 20+ fields', () => {
		const line = '{top_index: 5289, top_value: 7298, start_index: 5164, end_index: 5498, firmness: 1650, deltaPeak: 2034, start_to_end_index: 334, calibrated_zero: 5264, start_value: 4903, end_value: 5106, field11: 100, field12: 200, field13: 300, field14: 400, field15: 500, field16: 600, field17: 700, field18: 800, field19: 900, field20: 1000, field21: 1100}';
		
		const result = parseDataLine(line);
		
		expect(result.length).toBeGreaterThanOrEqual(20);
		expect(result).toContainEqual({ name: 'field20', value: 1000 });
		expect(result).toContainEqual({ name: 'field21', value: 1100 });
	});

	it('should remove curly braces from values', () => {
		const line = '{value1: 100, value2: 200}';
		
		const result = parseDataLine(line);
		
		expect(result).toEqual([
			{ name: 'value1', value: 100 },
			{ name: 'value2', value: 200 }
		]);
	});

	it('should handle data with timestamps', () => {
		const line = '[12:34:56.789] {temp: 25, humidity: 60}';
		
		const result = parseDataLine(line);
		
		expect(result).toEqual([
			{ name: 'temp', value: 25 },
			{ name: 'humidity', value: 60 }
		]);
	});

	it('should skip header lines', () => {
		const line = 'header: temperature, pressure';
		
		const result = parseDataLine(line);
		
		expect(result).toHaveLength(0);
	});

	it('should skip empty lines', () => {
		const result1 = parseDataLine('');
		const result2 = parseDataLine('   ');
		const result3 = parseDataLine('\n');
		
		expect(result1).toHaveLength(0);
		expect(result2).toHaveLength(0);
		expect(result3).toHaveLength(0);
	});

	it('should skip "Connecting" lines', () => {
		const line = 'Connecting to device...';
		
		const result = parseDataLine(line);
		
		expect(result).toHaveLength(0);
	});

	it('should handle negative numbers', () => {
		const line = '{temp: -10, altitude: -500}';
		
		const result = parseDataLine(line);
		
		expect(result).toEqual([
			{ name: 'temp', value: -10 },
			{ name: 'altitude', value: -500 }
		]);
	});

	it('should handle decimal numbers', () => {
		const line = '{voltage: 3.3, current: 0.125}';
		
		const result = parseDataLine(line);
		
		expect(result).toEqual([
			{ name: 'voltage', value: 3.3 },
			{ name: 'current', value: 0.125 }
		]);
	});

	it('should handle scientific notation', () => {
		const line = '{small: 1.5e-3, large: 2.5e6}';
		
		const result = parseDataLine(line);
		
		expect(result).toEqual([
			{ name: 'small', value: 0.0015 },
			{ name: 'large', value: 2500000 }
		]);
	});

	it('should handle mixed delimiters (spaces, commas, semicolons)', () => {
		const line1 = 'x: 10, y: 20; z: 30';
		const line2 = 'x: 10 y: 20 z: 30';
		const line3 = 'x: 10,y: 20;z: 30';
		
		const result1 = parseDataLine(line1);
		const result2 = parseDataLine(line2);
		const result3 = parseDataLine(line3);
		
		const expected = [
			{ name: 'x', value: 10 },
			{ name: 'y', value: 20 },
			{ name: 'z', value: 30 }
		];
		
		expect(result1).toEqual(expected);
		expect(result2).toEqual(expected);
		expect(result3).toEqual(expected);
	});

	it('should ignore invalid key-value pairs', () => {
		const line = '{valid: 100, invalid:, :200, novalue:}';
		
		const result = parseDataLine(line);
		
		expect(result).toEqual([
			{ name: 'valid', value: 100 }
		]);
	});

	it('should handle key names with underscores', () => {
		const line = '{top_index: 100, start_value: 200, delta_peak: 300}';
		
		const result = parseDataLine(line);
		
		expect(result).toEqual([
			{ name: 'top_index', value: 100 },
			{ name: 'start_value', value: 200 },
			{ name: 'delta_peak', value: 300 }
		]);
	});

	it('should handle camelCase key names', () => {
		const line = '{topIndex: 100, startValue: 200, deltaPeak: 300}';
		
		const result = parseDataLine(line);
		
		expect(result).toEqual([
			{ name: 'topIndex', value: 100 },
			{ name: 'startValue', value: 200 },
			{ name: 'deltaPeak', value: 300 }
		]);
	});

	it('should handle data without curly braces', () => {
		const line = 'temp: 25, pressure: 1013';
		
		const result = parseDataLine(line);
		
		expect(result).toEqual([
			{ name: 'temp', value: 25 },
			{ name: 'pressure', value: 1013 }
		]);
	});

	it('should handle tab-separated values', () => {
		const line = 'x: 10\ty: 20\tz: 30';
		
		const result = parseDataLine(line);
		
		expect(result).toEqual([
			{ name: 'x', value: 10 },
			{ name: 'y', value: 20 },
			{ name: 'z', value: 30 }
		]);
	});

	it('should handle zero values', () => {
		const line = '{x: 0, y: 0.0, z: -0}';
		
		const result = parseDataLine(line);
		
		// Note: -0 === 0 in JavaScript with ==, but toBe uses Object.is which treats them differently
		expect(result).toHaveLength(3);
		expect(result[0]).toMatchObject({ name: 'x', value: 0 });
		expect(result[1]).toMatchObject({ name: 'y', value: 0 });
		expect(result[2]).toMatchObject({ name: 'z' });
		expect(result[2].value == 0).toBe(true); // Use == for -0 === 0
	});

	it('should trim whitespace from key names', () => {
		const line = '{ temp : 25 ,  humidity : 60 }';
		
		const result = parseDataLine(line);
		
		expect(result).toEqual([
			{ name: 'temp', value: 25 },
			{ name: 'humidity', value: 60 }
		]);
	});
});

describe('parseDataLine - README Format Examples', () => {
	it('should parse Format 2 example: temp:23.5 humidity:65.2 pressure:1013.25', () => {
		const line = 'temp:23.5 humidity:65.2 pressure:1013.25';
		
		const result = parseDataLine(line);
		
		expect(result).toEqual([
			{ name: 'temp', value: 23.5 },
			{ name: 'humidity', value: 65.2 },
			{ name: 'pressure', value: 1013.25 }
		]);
	});

	it('should parse Format 2 example: sensor1:123,sensor2:456,sensor3:789', () => {
		const line = 'sensor1:123,sensor2:456,sensor3:789';
		
		const result = parseDataLine(line);
		
		expect(result).toEqual([
			{ name: 'sensor1', value: 123 },
			{ name: 'sensor2', value: 456 },
			{ name: 'sensor3', value: 789 }
		]);
	});

	it('should parse Arduino loop example with decimals', () => {
		// Example from README: temp = 20.0 + 5.0 * sin(millis() * 0.001)
		const line = 'temperature:23.456 humidity:55.789 light:650';
		
		const result = parseDataLine(line);
		
		expect(result).toEqual([
			{ name: 'temperature', value: 23.456 },
			{ name: 'humidity', value: 55.789 },
			{ name: 'light', value: 650 }
		]);
	});

	it('should handle header lines with colors (should skip)', () => {
		const line1 = "header temp:'red' humidity:'blue' pressure:'green'";
		const line2 = "header var1:'#FF0000' var2:'blue' var3:'rgb(0,255,0)'";
		const line3 = "header temperature:'#e74c3c' humidity:'#3498db' light:'#f39c12'";
		
		expect(parseDataLine(line1)).toHaveLength(0);
		expect(parseDataLine(line2)).toHaveLength(0);
		expect(parseDataLine(line3)).toHaveLength(0);
	});

	it('should handle real-world sensor data with mixed ranges', () => {
		// Simulating real sensor: temp (20-30°C), humidity (40-70%), light (300-800 lux)
		const line = 'temp:25.3 humidity:62.1 light:523';
		
		const result = parseDataLine(line);
		
		expect(result).toHaveLength(3);
		expect(result).toEqual([
			{ name: 'temp', value: 25.3 },
			{ name: 'humidity', value: 62.1 },
			{ name: 'light', value: 523 }
		]);
	});

	it('should handle timestamp prefix like serial monitor', () => {
		const line = '[16:53:15.123] temp:25.5 humidity:60.2';
		
		const result = parseDataLine(line);
		
		expect(result).toEqual([
			{ name: 'temp', value: 25.5 },
			{ name: 'humidity', value: 60.2 }
		]);
	});

	it('should handle large sensor values (like light intensity)', () => {
		const line = 'temp:22.5 humidity:55.0 light:1023';
		
		const result = parseDataLine(line);
		
		expect(result[2]).toEqual({ name: 'light', value: 1023 });
	});

	it('should handle integer sensor readings', () => {
		const line = 'sensor1:100 sensor2:200 sensor3:300';
		
		const result = parseDataLine(line);
		
		expect(result).toEqual([
			{ name: 'sensor1', value: 100 },
			{ name: 'sensor2', value: 200 },
			{ name: 'sensor3', value: 300 }
		]);
	});
});

describe('extractVariableNames', () => {
	it('should extract unique variable names from parsed data', () => {
		const parsedData: ParsedVariable[][] = [
			[
				{ name: 'temp', value: 25 },
				{ name: 'humidity', value: 60 }
			],
			[
				{ name: 'temp', value: 26 },
				{ name: 'pressure', value: 1013 }
			],
			[
				{ name: 'humidity', value: 65 },
				{ name: 'altitude', value: 100 }
			]
		];
		
		const result = extractVariableNames(parsedData);
		
		expect(result).toHaveLength(4);
		expect(result).toContain('temp');
		expect(result).toContain('humidity');
		expect(result).toContain('pressure');
		expect(result).toContain('altitude');
	});

	it('should handle empty parsed data', () => {
		const parsedData: ParsedVariable[][] = [];
		
		const result = extractVariableNames(parsedData);
		
		expect(result).toHaveLength(0);
	});

	it('should handle single line of data', () => {
		const parsedData: ParsedVariable[][] = [
			[
				{ name: 'x', value: 10 },
				{ name: 'y', value: 20 }
			]
		];
		
		const result = extractVariableNames(parsedData);
		
		expect(result).toEqual(['x', 'y']);
	});

	it('should preserve insertion order of first occurrence', () => {
		const parsedData: ParsedVariable[][] = [
			[
				{ name: 'c', value: 3 },
				{ name: 'a', value: 1 },
				{ name: 'b', value: 2 }
			],
			[
				{ name: 'a', value: 4 },
				{ name: 'b', value: 5 },
				{ name: 'c', value: 6 }
			]
		];
		
		const result = extractVariableNames(parsedData);
		
		expect(result).toEqual(['c', 'a', 'b']);
	});
});
