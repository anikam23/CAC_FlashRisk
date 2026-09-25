import type { LonLat } from "@/lib/california";

export type PlaceSuggestion = {
  id: string;
  label: string;
  detail: string;
  lng: number;
  lat: number;
};

/** Compact California place index for instant typeahead before remote results arrive. */
export const CALIFORNIA_PLACES: Array<LonLat & { name: string; kind: string }> = [
  { name: "Los Angeles", kind: "City", lng: -118.2437, lat: 34.0522 },
  { name: "San Diego", kind: "City", lng: -117.1611, lat: 32.7157 },
  { name: "San Jose", kind: "City", lng: -121.8863, lat: 37.3382 },
  { name: "San Francisco", kind: "City", lng: -122.4194, lat: 37.7749 },
  { name: "Fresno", kind: "City", lng: -119.7871, lat: 36.7378 },
  { name: "Sacramento", kind: "City", lng: -121.4944, lat: 38.5816 },
  { name: "Long Beach", kind: "City", lng: -118.1937, lat: 33.7701 },
  { name: "Oakland", kind: "City", lng: -122.2712, lat: 37.8044 },
  { name: "Bakersfield", kind: "City", lng: -119.0187, lat: 35.3733 },
  { name: "Anaheim", kind: "City", lng: -117.9145, lat: 33.8366 },
  { name: "Santa Ana", kind: "City", lng: -117.8677, lat: 33.7455 },
  { name: "Riverside", kind: "City", lng: -117.3755, lat: 33.9806 },
  { name: "Stockton", kind: "City", lng: -121.2908, lat: 37.9577 },
  { name: "Irvine", kind: "City", lng: -117.8265, lat: 33.6846 },
  { name: "Chula Vista", kind: "City", lng: -117.0842, lat: 32.6401 },
  { name: "Fremont", kind: "City", lng: -121.9886, lat: 37.5485 },
  { name: "San Bernardino", kind: "City", lng: -117.2898, lat: 34.1083 },
  { name: "Modesto", kind: "City", lng: -120.9969, lat: 37.6391 },
  { name: "Fontana", kind: "City", lng: -117.435, lat: 34.0922 },
  { name: "Oxnard", kind: "City", lng: -119.1771, lat: 34.1975 },
  { name: "Moreno Valley", kind: "City", lng: -117.2306, lat: 33.9425 },
  { name: "Huntington Beach", kind: "City", lng: -117.9988, lat: 33.6595 },
  { name: "Glendale", kind: "City", lng: -118.2551, lat: 34.1425 },
  { name: "Santa Clarita", kind: "City", lng: -118.5426, lat: 34.3917 },
  { name: "Garden Grove", kind: "City", lng: -117.941, lat: 33.7739 },
  { name: "Oceanside", kind: "City", lng: -117.3795, lat: 33.1959 },
  { name: "Rancho Cucamonga", kind: "City", lng: -117.5931, lat: 34.1064 },
  { name: "Santa Rosa", kind: "City", lng: -122.7141, lat: 38.4404 },
  { name: "Ontario", kind: "City", lng: -117.6509, lat: 34.0633 },
  { name: "Elk Grove", kind: "City", lng: -121.3717, lat: 38.4088 },
  { name: "Corona", kind: "City", lng: -117.5664, lat: 33.8753 },
  { name: "Lancaster", kind: "City", lng: -118.1529, lat: 34.6868 },
  { name: "Palmdale", kind: "City", lng: -118.1165, lat: 34.5794 },
  { name: "Salinas", kind: "City", lng: -121.6555, lat: 36.6777 },
  { name: "Pomona", kind: "City", lng: -117.7499, lat: 34.0551 },
  { name: "Hayward", kind: "City", lng: -122.0808, lat: 37.6688 },
  { name: "Escondido", kind: "City", lng: -117.0864, lat: 33.1192 },
  { name: "Torrance", kind: "City", lng: -118.3406, lat: 33.8358 },
  { name: "Sunnyvale", kind: "City", lng: -122.0363, lat: 37.3688 },
  { name: "Orange", kind: "City", lng: -117.8531, lat: 33.7879 },
  { name: "Fullerton", kind: "City", lng: -117.9243, lat: 33.8704 },
  { name: "Pasadena", kind: "City", lng: -118.1445, lat: 34.1478 },
  { name: "Thousand Oaks", kind: "City", lng: -118.8376, lat: 34.1706 },
  { name: "Visalia", kind: "City", lng: -119.2921, lat: 36.3302 },
  { name: "Simi Valley", kind: "City", lng: -118.7815, lat: 34.2694 },
  { name: "Concord", kind: "City", lng: -122.0311, lat: 37.978 },
  { name: "Roseville", kind: "City", lng: -121.288, lat: 38.7521 },
  { name: "Santa Clara", kind: "City", lng: -121.9552, lat: 37.3541 },
  { name: "Vallejo", kind: "City", lng: -122.2566, lat: 38.1041 },
  { name: "Victorville", kind: "City", lng: -117.2912, lat: 34.5361 },
  { name: "Berkeley", kind: "City", lng: -122.2727, lat: 37.8715 },
  { name: "El Monte", kind: "City", lng: -118.0276, lat: 34.0686 },
  { name: "Downey", kind: "City", lng: -118.1326, lat: 33.9401 },
  { name: "Costa Mesa", kind: "City", lng: -117.9187, lat: 33.6412 },
  { name: "Inglewood", kind: "City", lng: -118.3531, lat: 33.9617 },
  { name: "Carlsbad", kind: "City", lng: -117.3506, lat: 33.1581 },
  { name: "San Buenaventura", kind: "City", lng: -119.2945, lat: 34.2805 },
  { name: "Ventura", kind: "City", lng: -119.2945, lat: 34.2805 },
  { name: "Fairfield", kind: "City", lng: -122.039, lat: 38.2494 },
  { name: "West Covina", kind: "City", lng: -117.939, lat: 34.0686 },
  { name: "Murrieta", kind: "City", lng: -117.2139, lat: 33.5539 },
  { name: "Richmond", kind: "City", lng: -122.3477, lat: 37.9358 },
  { name: "Norwalk", kind: "City", lng: -118.0817, lat: 33.9022 },
  { name: "Antioch", kind: "City", lng: -121.8058, lat: 38.0049 },
  { name: "Temecula", kind: "City", lng: -117.1484, lat: 33.4936 },
  { name: "Burbank", kind: "City", lng: -118.3089, lat: 34.1808 },
  { name: "Daly City", kind: "City", lng: -122.4702, lat: 37.6879 },
  { name: "Rialto", kind: "City", lng: -117.3703, lat: 34.1064 },
  { name: "Santa Maria", kind: "City", lng: -120.4357, lat: 34.953 },
  { name: "El Cajon", kind: "City", lng: -116.9625, lat: 32.7948 },
  { name: "San Mateo", kind: "City", lng: -122.3255, lat: 37.5629 },
  { name: "Clovis", kind: "City", lng: -119.7029, lat: 36.8252 },
  { name: "Compton", kind: "City", lng: -118.2201, lat: 33.8958 },
  { name: "Jurupa Valley", kind: "City", lng: -117.4757, lat: 33.9972 },
  { name: "Vista", kind: "City", lng: -117.2425, lat: 33.2001 },
  { name: "South Gate", kind: "City", lng: -118.212, lat: 33.9547 },
  { name: "Mission Viejo", kind: "City", lng: -117.6582, lat: 33.6001 },
  { name: "Vacaville", kind: "City", lng: -121.9877, lat: 38.3566 },
  { name: "Carson", kind: "City", lng: -118.2817, lat: 33.8317 },
  { name: "Hesperia", kind: "City", lng: -117.3009, lat: 34.4264 },
  { name: "Santa Monica", kind: "City", lng: -118.4912, lat: 34.0195 },
  { name: "Westminster", kind: "City", lng: -117.994, lat: 33.7513 },
  { name: "Redding", kind: "City", lng: -122.3917, lat: 40.5865 },
  { name: "Santa Barbara", kind: "City", lng: -119.6982, lat: 34.4208 },
  { name: "Chico", kind: "City", lng: -121.8375, lat: 39.7285 },
  { name: "Newport Beach", kind: "City", lng: -117.9298, lat: 33.6189 },
  { name: "San Leandro", kind: "City", lng: -122.1561, lat: 37.7249 },
  { name: "San Marcos", kind: "City", lng: -117.1661, lat: 33.1434 },
  { name: "Whittier", kind: "City", lng: -118.0328, lat: 33.9792 },
  { name: "Hawthorne", kind: "City", lng: -118.3526, lat: 33.9164 },
  { name: "Citrus Heights", kind: "City", lng: -121.2811, lat: 38.7071 },
  { name: "Alhambra", kind: "City", lng: -118.127, lat: 34.0953 },
  { name: "Tracy", kind: "City", lng: -121.4252, lat: 37.7397 },
  { name: "Livermore", kind: "City", lng: -121.768, lat: 37.6819 },
  { name: "Buena Park", kind: "City", lng: -117.9981, lat: 33.8675 },
  { name: "Menifee", kind: "City", lng: -117.1851, lat: 33.6971 },
  { name: "Hemet", kind: "City", lng: -116.9717, lat: 33.7475 },
  { name: "Lakewood", kind: "City", lng: -118.1332, lat: 33.8536 },
  { name: "Merced", kind: "City", lng: -120.4829, lat: 37.3022 },
  { name: "Napa", kind: "City", lng: -122.2869, lat: 38.2975 },
  { name: "Redwood City", kind: "City", lng: -122.2364, lat: 37.4852 },
  { name: "Lake Forest", kind: "City", lng: -117.6892, lat: 33.6469 },
  { name: "Chino", kind: "City", lng: -117.6889, lat: 34.0122 },
  { name: "Tustin", kind: "City", lng: -117.8263, lat: 33.7458 },
  { name: "Mountain View", kind: "City", lng: -122.0838, lat: 37.3861 },
  { name: "Alameda", kind: "City", lng: -122.2416, lat: 37.7652 },
  { name: "Upland", kind: "City", lng: -117.6484, lat: 34.0975 },
  { name: "Folsom", kind: "City", lng: -121.1761, lat: 38.678 },
  { name: "Davis", kind: "City", lng: -121.7405, lat: 38.5449 },
  { name: "Palo Alto", kind: "City", lng: -122.143, lat: 37.4419 },
  { name: "Yosemite Valley", kind: "Place", lng: -119.5383, lat: 37.7459 },
  { name: "Lake Tahoe", kind: "Place", lng: -120.0324, lat: 39.0968 },
  { name: "Death Valley", kind: "Place", lng: -116.9325, lat: 36.4622 },
  { name: "Joshua Tree", kind: "Place", lng: -116.3131, lat: 33.8734 },
  { name: "Big Sur", kind: "Place", lng: -121.8072, lat: 36.2704 },
  { name: "Monterey", kind: "City", lng: -121.8947, lat: 36.6002 },
  { name: "Carmel-by-the-Sea", kind: "City", lng: -121.9233, lat: 36.5552 },
  { name: "Half Moon Bay", kind: "City", lng: -122.4286, lat: 37.4636 },
  { name: "Eureka", kind: "City", lng: -124.1637, lat: 40.8021 },
  { name: "Palm Springs", kind: "City", lng: -116.5453, lat: 33.8303 },
  { name: "Indio", kind: "City", lng: -116.2156, lat: 33.7206 },
  { name: "Bishop", kind: "City", lng: -118.3951, lat: 37.3635 },
  { name: "Mammoth Lakes", kind: "Town", lng: -118.9721, lat: 37.6485 },
  { name: "South Lake Tahoe", kind: "City", lng: -119.9772, lat: 38.9399 },
  { name: "Truckee", kind: "Town", lng: -120.1833, lat: 39.328 },
  { name: "Yreka", kind: "City", lng: -122.6342, lat: 41.7354 },
  { name: "Susanville", kind: "City", lng: -120.653, lat: 40.4163 },
  { name: "Jackson", kind: "City", lng: -120.7741, lat: 38.3488 },
  { name: "Sonora", kind: "City", lng: -120.3821, lat: 37.9841 },
  { name: "Mariposa", kind: "Town", lng: -119.9674, lat: 37.4849 },
  { name: "Ukiah", kind: "City", lng: -123.2078, lat: 39.1502 },
  { name: "Crescent City", kind: "City", lng: -124.2026, lat: 41.7558 },
  { name: "Barstow", kind: "City", lng: -117.0228, lat: 34.8958 },
  { name: "Needles", kind: "City", lng: -114.6141, lat: 34.8481 },
  { name: "Calexico", kind: "City", lng: -115.4989, lat: 32.6789 },
  { name: "El Centro", kind: "City", lng: -115.563, lat: 32.792 },
  { name: "Imperial Beach", kind: "City", lng: -117.1131, lat: 32.5839 },
  { name: "La Jolla", kind: "Place", lng: -117.2713, lat: 32.8328 },
  { name: "Malibu", kind: "City", lng: -118.7798, lat: 34.0259 },
  { name: "Hollywood", kind: "Place", lng: -118.3287, lat: 34.0928 },
  { name: "Silicon Valley", kind: "Place", lng: -122.0363, lat: 37.3861 },
  { name: "Redondo Beach", kind: "City", lng: -118.387, lat: 33.8492 },
  { name: "Culver City", kind: "City", lng: -118.3965, lat: 34.0211 },
  { name: "Beverly Hills", kind: "City", lng: -118.4004, lat: 34.0736 },
  { name: "West Hollywood", kind: "City", lng: -118.3617, lat: 34.0901 },
];

function normalize(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function scorePlace(query: string, name: string): number {
  const q = normalize(query);
  const n = normalize(name);
  if (!q) return 0;
  if (n === q) return 100;
  if (n.startsWith(q)) return 90 - Math.min(n.length, 40);
  if (n.includes(` ${q}`)) return 70;
  if (n.includes(q)) return 55;
  const tokens = q.split(" ");
  if (tokens.every((token) => n.includes(token))) return 40;
  return 0;
}

export function searchLocalPlaces(query: string, limit = 8): PlaceSuggestion[] {
  const q = normalize(query);
  if (q.length < 2) return [];

  return CALIFORNIA_PLACES.map((place, index) => ({
    place,
    index,
    score: scorePlace(q, place.name),
  }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score || a.place.name.localeCompare(b.place.name))
    .slice(0, limit)
    .map(({ place, index }) => ({
      id: `local:${index}:${place.name}`,
      label: place.name,
      detail: `${place.kind} · California`,
      lng: place.lng,
      lat: place.lat,
    }));
}
