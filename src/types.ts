export type Point = {
  lat: number;
  lon: number;
  ele: number;
};

export type Climb = {
  id: string;
  name: string;
  points: Point[];
  distanceKm: number;
  ascentM: number;
  avgGradient: number;
};

export type Mode = 'stitch' | 'cut';

export type Slice = {
  id: string;
  name: string;
  kmStart: number;
  kmEnd: number;
};

export type Bridge = {
  id: string;
  lengthKm: number;
  gradient: number; // % — 0 for flat, negative for valley dip, positive for ramp
};

export type CutSource = {
  id: string;
  climb: Climb;
  slices: Slice[];
};
