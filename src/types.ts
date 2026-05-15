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
