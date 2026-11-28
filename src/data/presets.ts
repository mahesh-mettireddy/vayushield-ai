import type { LocationOption, PlaybookTip } from '../types/airQuality';

export const PRESET_CITIES: LocationOption[] = [
  { name: 'New Delhi', region: 'Delhi NCR', country: 'India', lat: 28.6139, lon: 77.209 },
  { name: 'Hyderabad', region: 'Telangana', country: 'India', lat: 17.385, lon: 78.4867 },
  { name: 'Mumbai', region: 'Maharashtra', country: 'India', lat: 19.076, lon: 72.8777 },
  { name: 'Bengaluru', region: 'Karnataka', country: 'India', lat: 12.9716, lon: 77.5946 },
  { name: 'Kolkata', region: 'West Bengal', country: 'India', lat: 22.5726, lon: 88.3639 },
  { name: 'London', region: 'Greater London', country: 'UK', lat: 51.5072, lon: -0.1276 }
];

export const CURATED_PLAYBOOK: PlaybookTip[] = [
  {
    id: 'corsi-rosenthal-box',
    title: 'DIY Corsi-Rosenthal Air Cleaner (Budget HEPA Alternative)',
    category: 'indoor-hack',
    costTier: 'budget_diy',
    summary:
      'Build a high-airflow particulate filter with four MERV-13 filters and a box fan for winter smog relief.',
    steps:
      'Tape four MERV-13 HVAC filters into a square cube, seal the bottom with cardboard, and tape a box fan on top blowing upward.',
    impactMetric: '~55% lower indoor PM2.5 in bedrooms',
    keywords: [
      'diy',
      'filter',
      'purifier',
      'hepa',
      'budget',
      'bedroom',
      'smog',
      'pm2.5',
      'corsi',
      'fan'
    ],
    sourceLabel: 'CPCB NAQI Framework',
    sourceUrl: 'https://www.pib.gov.in/newsite/printrelease.aspx?relid=110654'
  },
  {
    id: 'clean-window-ventilation',
    title: 'Targeted 2-Hour Clean-Air Cross-Ventilation',
    category: 'low-emission-routine',
    costTier: 'zero_cost',
    summary:
      'Flush indoor CO₂ only during the forecasted daily PM2.5 trough rather than early-morning thermal inversions.',
    steps:
      'Check the 24-hour Clean-Air Window chart, open opposite windows for 10–15 minutes during the trough, then seal gaps before evening smog rises.',
    impactMetric: '~20% lower indoor particulate buildup',
    keywords: [
      'ventilation',
      'windows',
      'morning',
      'inversion',
      'schedule',
      'walk',
      'school',
      'routine'
    ],
    sourceLabel: 'Open-Meteo Air Quality Forecast',
    sourceUrl: 'https://open-meteo.com/en/docs/air-quality-api'
  },
  {
    id: 'kitchen-exhaust-back-burner',
    title: 'Back-Burner + Pre-Started Kitchen Exhaust Habit',
    category: 'indoor-hack',
    costTier: 'zero_cost',
    summary:
      'High-heat tadka and frying can spike kitchen PM2.5 above 300 µg/m³ within minutes without active capture.',
    steps:
      'Turn on the chimney or exhaust fan 5 minutes before cooking, use back burners closest to the hood, and keep lids on simmering pots.',
    impactMetric: '~35% lower indoor cooking PM2.5 + 85 kg CO₂/yr saved with lid-on/induction',
    keywords: [
      'cooking',
      'kitchen',
      'exhaust',
      'gas',
      'induction',
      'smoke',
      'no2',
      'frying',
      'indoor'
    ],
    sourceLabel: 'OpenAQ Urban Air Reference',
    sourceUrl: 'https://docs.openaq.org/about/about'
  },
  {
    id: 'wet-mopping-dust-control',
    title: 'Damp Microfiber Mopping Instead of Dry Sweeping',
    category: 'indoor-hack',
    costTier: 'zero_cost',
    summary:
      'Dry brooms kick settled PM10 and heavy road dust right back into breathing height for children.',
    steps:
      'Use a damp microfiber mop on floors and wet-wipe window tracks every evening, especially if toddlers play on the floor.',
    impactMetric: 'Cuts indoor PM10 resuspension spikes for kids & seniors',
    keywords: [
      'dust',
      'mop',
      'sweep',
      'children',
      'kids',
      'toddlers',
      'pm10',
      'floor',
      'zero cost'
    ],
    sourceLabel: 'CPCB Air Quality Index Guide',
    sourceUrl: 'https://missionsustainability.org/blog/air-quality-index'
  },
  {
    id: 'metro-carpool-swap',
    title: 'Metro, Bus & Carpool Commute Swap on Smog Days',
    category: 'sustainable-swap',
    costTier: 'zero_cost',
    summary:
      'Replacing solo petrol/diesel commutes directly lowers roadside NO₂ and household carbon footprint.',
    steps:
      'Swap 3–5 weekly solo car trips for Metro, electric bus, or office carpool, and batch neighborhood errands into one loop.',
    impactMetric: 'Up to 0.164 kg CO₂ saved per km (~470+ kg/yr on a 12 km daily commute)',
    keywords: [
      'commute',
      'metro',
      'bus',
      'carpool',
      'car',
      'traffic',
      'emissions',
      'co2',
      'sustainable'
    ],
    sourceLabel: 'Open-Meteo Urban Pollutants',
    sourceUrl: 'https://open-meteo.com/en/docs/air-quality-api'
  },
  {
    id: 'n95-seal-check',
    title: 'N95 / KN95 Fit-Check for Peak Smog Commutes',
    category: 'health-protection',
    costTier: 'budget_diy',
    summary:
      'Cloth and loose surgical masks let fine PM2.5 bypass around the nose bridge during Poor–Severe days.',
    steps:
      'Pinch the nose wire firmly, check that exhaled air does not fog glasses, and replace respirators once breathing resistance rises.',
    impactMetric: '≥80% reduction in outdoor inhaled PM2.5',
    keywords: [
      'mask',
      'n95',
      'kn95',
      'commute',
      'asthma',
      'seniors',
      'severe',
      'outdoor',
      'breathing'
    ],
    sourceLabel: 'CPCB NAQI Health Advisories',
    sourceUrl: 'https://www.pib.gov.in/newsite/printrelease.aspx?relid=110654'
  }
];
