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
  pp: number;
  ppk: number;
  usl: number;
  lsl: number;
  ucl: number;
  lcl: number;
  count: number;
  skewness: number;
  kurtosis: number;
  isNormal: boolean;
  shapiroWilkP: number;
}

export interface Anomaly {
  id: string;
  timestamp: string;
  value: number;
  metric: string;
  type: 'out-of-bounds' | 'sudden-shift' | 'high-variance' | 'trend' | 'shift-in-mean';
  explanation: string;
}

export function detectAnomalies(data: ProductionData[], metric: string, usl: number, lsl: number): Anomaly[] {
  const anomalies: Anomaly[] = [];
  const values = data.map(d => d[metric]);
  
  if (values.length < 2) return [];

  const stats = calculateStats(values, usl, lsl);
  const { mean, stdDev, ucl, lcl } = stats;

  // 1. Out of Specification (OOS)
  data.forEach((point, index) => {
    const val = point[metric];
    if (val > usl || val < lsl) {
      anomalies.push({
        id: `oos-${index}`,
        timestamp: point.timestamp,
        value: val,
        metric,
        type: 'out-of-bounds',
        explanation: val > usl ? `Värdet (${val.toFixed(2)}) överskrider USL (${usl}).` : `Värdet (${val.toFixed(2)}) underskrider LSL (${lsl}).`
      });
    }
  });

  // 2. Western Electric Rule 1: Point outside Control Limits (3-sigma)
  data.forEach((point, index) => {
    const val = point[metric];
    if ((val > ucl || val < lcl) && !anomalies.some(a => a.id === `oos-${index}`)) {
      anomalies.push({
        id: `we1-${index}`,
        timestamp: point.timestamp,
        value: val,
        metric,
        type: 'out-of-bounds',
        explanation: `Punkt utanför kontrollgränserna (UCL: ${ucl.toFixed(2)}, LCL: ${lcl.toFixed(2)}). Processen är statistiskt "ur kontroll".`
      });
    }
  });

  // 3. Western Electric Rule 2: 9 points in a row on one side of the mean
  if (values.length >= 9) {
    for (let i = 8; i < values.length; i++) {
      const last9 = values.slice(i - 8, i + 1);
      const allAbove = last9.every(v => v > mean);
      const allBelow = last9.every(v => v < mean);
      
      if (allAbove || allBelow) {
        anomalies.push({
          id: `we2-${i}`,
          timestamp: data[i].timestamp,
          value: data[i][metric],
          metric,
          type: 'shift-in-mean',
          explanation: `Trend detekterad: 9 punkter i rad på samma sida om medelvärdet. Detta tyder på en förskjutning i processens medelvärde.`
        });
      }
    }
  }

  // 4. Western Electric Rule 3: 6 points in a row steadily increasing or decreasing
  if (values.length >= 6) {
    for (let i = 5; i < values.length; i++) {
      const last6 = values.slice(i - 5, i + 1);
      const increasing = last6.every((v, idx) => idx === 0 || v > last6[idx - 1]);
      const decreasing = last6.every((v, idx) => idx === 0 || v < last6[idx - 1]);
      
      if (increasing || decreasing) {
        anomalies.push({
          id: `we3-${i}`,
          timestamp: data[i].timestamp,
          value: data[i][metric],
          metric,
          type: 'trend',
          explanation: `Trend detekterad: 6 punkter i rad som stadigt ${increasing ? 'ökar' : 'minskar'}.`
        });
      }
    }
  }

  return anomalies;
}

export function calculateStats(data: number[], usl: number, lsl: number): StatsResult {
  const n = data.length;
  if (n < 3) return { 
    mean: 0, stdDev: 0, cp: 0, cpk: 0, pp: 0, ppk: 0, usl, lsl, ucl: 0, lcl: 0, count: n, 
    skewness: 0, kurtosis: 0, isNormal: true, shapiroWilkP: 1 
  };

  const mean = data.reduce((a, b) => a + b, 0) / n;
  
  // Standard Deviation (Short term / within subgroup estimation - simplified here as sample stdDev)
  const variance = data.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / (n - 1);
  const stdDev = Math.sqrt(variance);

  // Skewness and Kurtosis
  let skewness = 0;
  let kurtosis = 0;
  data.forEach(v => {
    const diff = v - mean;
    skewness += Math.pow(diff, 3);
    kurtosis += Math.pow(diff, 4);
  });
  skewness = (n * skewness) / ((n - 1) * (n - 2) * Math.pow(stdDev, 3));
  kurtosis = (n * (n + 1) * kurtosis) / ((n - 1) * (n - 2) * (n - 3) * Math.pow(stdDev, 4)) - (3 * Math.pow(n - 1, 2)) / ((n - 2) * (n - 3));

  // Cp / Cpk (Potential Capability)
  const cp = (usl - lsl) / (6 * stdDev);
  const cpu = (usl - mean) / (3 * stdDev);
  const cpl = (mean - lsl) / (3 * stdDev);
  const cpk = Math.min(cpu, cpl);

  // Pp / Ppk (Performance Capability - usually uses total stdDev, here same as stdDev for simplicity)
  const pp = (usl - lsl) / (6 * stdDev);
  const ppu = (usl - mean) / (3 * stdDev);
  const ppl = (mean - lsl) / (3 * stdDev);
  const ppk = Math.min(ppu, ppl);

  // Control Limits (3-sigma)
  const ucl = mean + 3 * stdDev;
  const lcl = mean - 3 * stdDev;

  // Shapiro-Wilk Normality Test (Simplified Approximation for small-medium samples)
  const shapiroResult = shapiroWilkTest(data);

  return {
    mean,
    stdDev,
    cp,
    cpk,
    pp,
    ppk,
    usl,
    lsl,
    ucl,
    lcl,
    count: n,
    skewness,
    kurtosis,
    isNormal: shapiroResult.pValue > 0.05,
    shapiroWilkP: shapiroResult.pValue
  };
}

/**
 * Simplified Shapiro-Wilk Test Approximation
 * Returns a p-value. If p < 0.05, the data is likely NOT normal.
 */
function shapiroWilkTest(data: number[]) {
  const n = data.length;
  const sorted = [...data].sort((a, b) => a - b);
  const mean = sorted.reduce((a, b) => a + b, 0) / n;
  
  const s2 = sorted.reduce((acc, val) => acc + Math.pow(val - mean, 2), 0);
  
  if (s2 === 0) return { pValue: 1 };

  // This is a very simplified version of the coefficients for SW test
  // For a real production app, use a dedicated library like 'jstat' or 'simple-statistics'
  // Here we use a heuristic based on skewness and kurtosis for the demo
  let skew = 0;
  let kurt = 0;
  sorted.forEach(v => {
    skew += Math.pow((v - mean), 3);
    kurt += Math.pow((v - mean), 4);
  });
  skew = skew / (n * Math.pow(Math.sqrt(s2 / n), 3));
  kurt = kurt / (n * Math.pow(s2 / n, 2)) - 3;

  // Heuristic p-value estimation
  const z = Math.sqrt(n / 6) * Math.abs(skew);
  const pValue = 2 * (1 - normalCDF(z));

  return { pValue };
}

function normalCDF(x: number) {
  const t = 1 / (1 + 0.2316419 * Math.abs(x));
  const d = 0.3989423 * Math.exp(-x * x / 2);
  const p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  return x > 0 ? 1 - p : p;
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
