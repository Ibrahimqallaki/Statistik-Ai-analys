export interface ProductionData {
  timestamp: string;
  value: number;
  temperature: number;
  pressure: number;
  [key: string]: any;
}

export interface StatsResult {
  mean: number;
  stdDev: number;
  cp: number;
  cpk: number;
  usl: number;
  lsl: number;
  count: number;
}

export interface Anomaly {
  id: string;
  timestamp: string;
  value: number;
  metric: string;
  type: 'out-of-bounds' | 'sudden-shift' | 'high-variance';
  explanation: string;
}

export function detectAnomalies(data: ProductionData[], metric: string, usl: number, lsl: number): Anomaly[] {
  const anomalies: Anomaly[] = [];
  const values = data.map(d => d[metric]);
  
  if (values.length < 2) return [];

  // 1. Out of bounds detection
  data.forEach((point, index) => {
    const val = point[metric];
    if (val > usl || val < lsl) {
      anomalies.push({
        id: `oob-${index}`,
        timestamp: point.timestamp,
        value: val,
        metric,
        type: 'out-of-bounds',
        explanation: val > usl ? `Värdet (${val.toFixed(2)}) överskrider den övre gränsen (USL: ${usl}).` : `Värdet (${val.toFixed(2)}) underskrider den nedre gränsen (LSL: ${lsl}).`
      });
    }
  });

  // 2. Sudden shift detection (simplified)
  for (let i = 1; i < data.length; i++) {
    const current = data[i][metric];
    const previous = data[i-1][metric];
    const diff = Math.abs(current - previous);
    
    // If shift is more than 3 standard deviations (approximate)
    const stdDev = calculateStats(values, usl, lsl).stdDev;
    if (diff > 3 * stdDev && stdDev > 0) {
      // Avoid duplicates if already caught by OOB
      if (!anomalies.some(a => a.timestamp === data[i].timestamp)) {
        anomalies.push({
          id: `shift-${i}`,
          timestamp: data[i].timestamp,
          value: current,
          metric,
          type: 'sudden-shift',
          explanation: `Ett plötsligt hopp i värde detekterades (förändring: ${diff.toFixed(2)}). Detta kan tyda på ett sensorfel eller en drastisk processförändring.`
        });
      }
    }
  }

  return anomalies;
}

export function calculateStats(data: number[], usl: number, lsl: number): StatsResult {
  const n = data.length;
  if (n === 0) return { mean: 0, stdDev: 0, cp: 0, cpk: 0, usl, lsl, count: 0 };

  const mean = data.reduce((a, b) => a + b, 0) / n;
  const variance = data.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / (n - 1 || 1);
  const stdDev = Math.sqrt(variance);

  const cp = (usl - lsl) / (6 * stdDev);
  const cpu = (usl - mean) / (3 * stdDev);
  const cpl = (mean - lsl) / (3 * stdDev);
  const cpk = Math.min(cpu, cpl);

  return {
    mean,
    stdDev,
    cp,
    cpk,
    usl,
    lsl,
    count: n
  };
}

export function generateSampleData(count: number = 50, mean: number = 10, stdDev: number = 0.5): ProductionData[] {
  const data: ProductionData[] = [];
  const now = new Date();
  for (let i = 0; i < count; i++) {
    const u1 = Math.random();
    const u2 = Math.random();
    const z0 = Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(2.0 * Math.PI * u2);
    
    let value = mean + z0 * stdDev;
    if (i > 40) value += 0.2;
    if (i === 25) value += 2.0;

    data.push({
      timestamp: new Date(now.getTime() - (count - i) * 60000).toISOString(),
      value,
      temperature: 20 + Math.random() * 5 + (value > 11 ? 2 : 0),
      pressure: 100 + Math.random() * 10
    });
  }
  return data;
}

export function generateSinglePoint(mean: number = 10, stdDev: number = 0.5): ProductionData {
  const u1 = Math.random();
  const u2 = Math.random();
  const z0 = Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(2.0 * Math.PI * u2);
  
  const value = mean + z0 * stdDev;
  return {
    timestamp: new Date().toISOString(),
    value,
    temperature: 20 + Math.random() * 5 + (value > 11 ? 2 : 0),
    pressure: 100 + Math.random() * 10
  };
}
