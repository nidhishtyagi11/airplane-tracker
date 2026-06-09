const AIRLINES = {
  AAL: 'American Airlines', AAR: 'Asiana Airlines', ACA: 'Air Canada',
  AFR: 'Air France', AIC: 'Air India', AIQ: 'AirAsia India',
  AJT: 'Amerijet', AKJ: 'Akasa Air', ALK: 'SriLankan Airlines',
  ANA: 'All Nippon Airways', ANE: 'Air Nostrum', APJ: 'Peach Aviation',
  ARA: 'Arik Air', ARG: 'Aerolíneas Argentinas', ASA: 'Alaska Airlines',
  AUA: 'Austrian Airlines', AVA: 'Avianca', AXB: 'Air India Express',
  AZA: 'ITA Airways', BAW: 'British Airways', BER: 'Norse Atlantic',
  BMA: 'bmi Regional', BOX: 'AeroLogic', CAL: 'China Airlines',
  CCA: 'Air China', CDG: 'Shandong Airlines', CEB: 'Cebu Pacific',
  CES: 'China Eastern', CHH: 'Hainan Airlines', CMP: 'Copa Airlines',
  CPA: 'Cathay Pacific', CSN: 'China Southern', CSZ: 'Shenzhen Airlines',
  DAL: 'Delta Air Lines', DLH: 'Lufthansa', EDW: 'Edelweiss Air',
  EGF: 'FlyEgypt', EIN: 'Aer Lingus', ELY: 'El Al',
  ETD: 'Etihad Airways', ETH: 'Ethiopian Airlines', EVA: 'EVA Air',
  EWG: 'Eurowings', EXS: 'Jet2', EZY: 'easyJet',
  FDB: 'flydubai', FDX: 'FedEx Express', FIN: 'Finnair',
  GAI: 'GoAir', GIA: 'Garuda Indonesia', GTR: 'Go First',
  GUL: 'Gulf Air', HVN: 'Vietnam Airlines', IAD: 'Interjet',
  IBE: 'Iberia', ICE: 'Icelandair', IGO: 'IndiGo',
  JAL: 'Japan Airlines', JAT: 'Jat Airways', JBU: 'JetBlue',
  JST: 'Jetstar', KAL: 'Korean Air', KLM: 'KLM',
  KQA: 'Kenya Airways', LAN: 'LATAM Airlines', LOT: 'LOT Polish',
  MAU: 'Air Mauritius', MAS: 'Malaysia Airlines', NAX: 'Norwegian',
  NKS: 'Spirit Airlines', OMA: 'Oman Air', PAL: 'Philippine Airlines',
  PIA: 'PIA', QFA: 'Qantas', QTR: 'Qatar Airways',
  RAM: 'Royal Air Maroc', RJA: 'Royal Jordanian', ROT: 'TAROM',
  RYR: 'Ryanair', SAS: 'SAS', SAA: 'South African Airways',
  SAI: 'Star Air India', SEJ: 'SpiceJet', SIA: 'Singapore Airlines',
  SKW: 'SkyWest', SLK: 'Silk Air', SVA: 'Saudia',
  SWA: 'Southwest Airlines', SWR: 'Swiss', TAP: 'TAP Air Portugal',
  THA: 'Thai Airways', THY: 'Turkish Airlines', TUI: 'TUI',
  TWF: 'Trans Maldivian', UAE: 'Emirates', UAL: 'United Airlines',
  UPS: 'UPS Airlines', VIR: 'Virgin Atlantic', VIS: 'Vistara',
  VJC: 'VietJet Air', VOZ: 'Virgin Australia', WZZ: 'Wizz Air',
  ABY: 'Air Arabia', ABD: 'Air Atlanta Icelandic',
};

export function getAirline(callsign) {
  if (!callsign) return null;
  const code = callsign.trim().substring(0, 3).toUpperCase();
  return AIRLINES[code] || code;
}
