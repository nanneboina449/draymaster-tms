import { ExtractedLoadData } from '@/components/shipments/PDFUploader';

// Container number pattern (ISO 6346): 4 letters + 7 digits
const CONTAINER_PATTERN = /\b([A-Z]{4}\d{7})\b/g;

// Common steamship line codes and names
const STEAMSHIP_LINES: Record<string, string> = {
  'MAEU': 'Maersk',
  'MSCU': 'MSC',
  'CMAU': 'CMA CGM',
  'COSU': 'COSCO',
  'HLCU': 'Hapag-Lloyd',
  'ONEY': 'ONE',
  'EGLV': 'Evergreen',
  'YMLU': 'Yang Ming',
  'HDMU': 'HMM',
  'ZIMU': 'ZIM',
  'MAERSK': 'Maersk',
  'MSC': 'MSC',
  'CMA': 'CMA CGM',
  'COSCO': 'COSCO',
  'HAPAG': 'Hapag-Lloyd',
  'ONE': 'ONE',
  'EVERGREEN': 'Evergreen',
  'YANG MING': 'Yang Ming',
  'HMM': 'HMM',
  'ZIM': 'ZIM',
};

// Terminal names
const TERMINALS = [
  'APM Terminals',
  'LBCT',
  'TraPac',
  'PCT',
  'Fenix Marine',
  'YTI',
  'ITS',
  'SSA Terminals',
  'Pier 400',
  'TTI',
  'Yusen',
  'WBCT',
  'Total Terminals',
  'Long Beach Container Terminal',
];

// US States
const US_STATES: Record<string, string> = {
  'ALABAMA': 'AL', 'ALASKA': 'AK', 'ARIZONA': 'AZ', 'ARKANSAS': 'AR',
  'CALIFORNIA': 'CA', 'COLORADO': 'CO', 'CONNECTICUT': 'CT', 'DELAWARE': 'DE',
  'FLORIDA': 'FL', 'GEORGIA': 'GA', 'HAWAII': 'HI', 'IDAHO': 'ID',
  'ILLINOIS': 'IL', 'INDIANA': 'IN', 'IOWA': 'IA', 'KANSAS': 'KS',
  'KENTUCKY': 'KY', 'LOUISIANA': 'LA', 'MAINE': 'ME', 'MARYLAND': 'MD',
  'MASSACHUSETTS': 'MA', 'MICHIGAN': 'MI', 'MINNESOTA': 'MN', 'MISSISSIPPI': 'MS',
  'MISSOURI': 'MO', 'MONTANA': 'MT', 'NEBRASKA': 'NE', 'NEVADA': 'NV',
  'NEW HAMPSHIRE': 'NH', 'NEW JERSEY': 'NJ', 'NEW MEXICO': 'NM', 'NEW YORK': 'NY',
  'NORTH CAROLINA': 'NC', 'NORTH DAKOTA': 'ND', 'OHIO': 'OH', 'OKLAHOMA': 'OK',
  'OREGON': 'OR', 'PENNSYLVANIA': 'PA', 'RHODE ISLAND': 'RI', 'SOUTH CAROLINA': 'SC',
  'SOUTH DAKOTA': 'SD', 'TENNESSEE': 'TN', 'TEXAS': 'TX', 'UTAH': 'UT',
  'VERMONT': 'VT', 'VIRGINIA': 'VA', 'WASHINGTON': 'WA', 'WEST VIRGINIA': 'WV',
  'WISCONSIN': 'WI', 'WYOMING': 'WY',
};

// Build extraction prompt for LLM
export function buildExtractionPrompt(pdfText: string): string {
  return `You are an expert logistics document parser specializing in drayage/intermodal shipping documents (rate confirmations, bills of lading, booking confirmations, delivery orders).

DOCUMENT TEXT:
${pdfText.substring(0, 10000)}

TASK: Extract ALL shipment information and return ONLY a valid JSON object.

IMPORTANT HINTS:
- Look for "CONSIGNEE" or "DELIVER TO" = delivery location (for imports)
- Look for "SHIPPER" or "PICK UP FROM" = pickup location (for exports)
- Container numbers are 4 letters + 7 digits (e.g., MSCU1234567, MAEU1234567)
- Look for LFD, Last Free Day, Free Time, Demurrage dates
- Look for SSL, Steamship Line, Carrier names (Maersk, MSC, COSCO, CMA CGM, Hapag-Lloyd, ONE, Evergreen, Yang Ming, HMM, ZIM)
- Terminals: APM, LBCT, TraPac, PCT, Fenix, YTI, ITS, SSA, TTI, Yusen, Pier 400
- 40HC or 40'HC means 40ft High Cube container
- Weight over 44,000 lbs is overweight

JSON STRUCTURE (use null for fields not found):
{
  "type": "IMPORT" or "EXPORT",
  "customerName": "company receiving/sending goods",
  "steamshipLine": "shipping line name",
  "bookingNumber": "booking/reference number",
  "billOfLading": "B/L number",
  "vessel": "vessel name",
  "voyage": "voyage number",
  "terminalName": "LA/LB port terminal",
  "lastFreeDay": "YYYY-MM-DD",
  "portCutoff": "YYYY-MM-DD",
  "earliestReturnDate": "YYYY-MM-DD",

  "deliveryLocationName": "company/warehouse name",
  "deliveryAddress": "street address",
  "deliveryCity": "city name",
  "deliveryState": "CA",
  "deliveryZip": "90001",
  "deliveryContactName": "contact name",
  "deliveryContactPhone": "phone",

  "pickupLocationName": "company/warehouse name",
  "pickupAddress": "street address",
  "pickupCity": "city name",
  "pickupState": "CA",
  "pickupZip": "90001",

  "containers": [
    {
      "containerNumber": "MSCU1234567",
      "size": "20" or "40" or "45",
      "type": "DRY" or "HIGH_CUBE" or "REEFER",
      "weightLbs": 42000,
      "sealNumber": "ABC123",
      "isHazmat": false,
      "isOverweight": false,
      "isReefer": false
    }
  ],

  "specialInstructions": "any notes",
  "confidence": 0.85
}

RULES:
- Container numbers MUST be exactly 11 characters (4 letters + 7 digits)
- All dates in YYYY-MM-DD format
- Weight > 44000 lbs means isOverweight: true
- Return ONLY valid JSON, no text before or after`;
}

// Rule-based extraction fallback
export function extractWithRules(text: string): ExtractedLoadData {
  const data: ExtractedLoadData = {
    rawText: text,
    containers: [],
  };

  const upperText = text.toUpperCase();

  // Normalize text for better pattern matching (collapse whitespace)
  const normalizedText = text.replace(/\s+/g, ' ');

  // Determine type - check multiple indicators
  const importIndicators = ['IMPORT', 'INBOUND', 'ARRIVAL', 'DELIVERY ORDER', 'CONSIGNEE', 'DELIVER TO'];
  const exportIndicators = ['EXPORT', 'OUTBOUND', 'DEPARTURE', 'SHIPPER', 'PICK UP', 'PICKUP FROM'];

  let importScore = 0;
  let exportScore = 0;

  for (const indicator of importIndicators) {
    if (upperText.includes(indicator)) importScore++;
  }
  for (const indicator of exportIndicators) {
    if (upperText.includes(indicator)) exportScore++;
  }

  if (importScore > exportScore) {
    data.type = 'IMPORT';
  } else if (exportScore > importScore) {
    data.type = 'EXPORT';
  } else if (upperText.includes('LFD') || upperText.includes('LAST FREE DAY')) {
    // LFD typically indicates import
    data.type = 'IMPORT';
  }

  // Extract container numbers
  const containerMatches = text.match(CONTAINER_PATTERN);
  if (containerMatches) {
    const uniqueContainers = [...new Set(containerMatches)];
    data.containers = uniqueContainers.map(num => {
      const prefix = num.substring(0, 4);
      return {
        containerNumber: num,
        size: undefined,
        type: undefined,
      };
    });

    // Try to identify steamship line from first container
    const firstContainer = uniqueContainers[0];
    const prefix = firstContainer.substring(0, 4);
    if (STEAMSHIP_LINES[prefix]) {
      data.steamshipLine = STEAMSHIP_LINES[prefix];
    }
  }

  // Extract steamship line from text
  for (const [code, name] of Object.entries(STEAMSHIP_LINES)) {
    if (upperText.includes(code) || upperText.includes(name.toUpperCase())) {
      data.steamshipLine = name;
      break;
    }
  }

  // Extract terminal
  for (const terminal of TERMINALS) {
    if (upperText.includes(terminal.toUpperCase())) {
      data.terminalName = terminal;
      break;
    }
  }

  // Extract booking number patterns
  const bookingPatterns = [
    /BOOKING\s*(?:#|NO|NUMBER)?:?\s*([A-Z0-9-]+)/i,
    /CONFIRMATION\s*(?:#|NO|NUMBER)?:?\s*([A-Z0-9-]+)/i,
    /BKG\s*(?:#|NO)?:?\s*([A-Z0-9-]+)/i,
  ];

  for (const pattern of bookingPatterns) {
    const match = text.match(pattern);
    if (match) {
      data.bookingNumber = match[1].trim();
      break;
    }
  }

  // Extract bill of lading
  const blPatterns = [
    /B(?:ILL)?[\s\/]*(?:OF)?[\s\/]*L(?:ADING)?(?:\s*#|\s*NO|\s*NUMBER)?:?\s*([A-Z0-9-]+)/i,
    /B\/L\s*(?:#|NO)?:?\s*([A-Z0-9-]+)/i,
    /BL\s*(?:#|NO)?:?\s*([A-Z0-9-]+)/i,
  ];

  for (const pattern of blPatterns) {
    const match = text.match(pattern);
    if (match) {
      data.billOfLading = match[1].trim();
      break;
    }
  }

  // Extract vessel
  const vesselPatterns = [
    /VESSEL\s*(?:NAME)?:?\s*([A-Z][A-Z\s]+)/i,
    /V(?:ESSEL)?\/V(?:OYAGE)?:?\s*([A-Z][A-Z\s]+)/i,
    /SHIP\s*(?:NAME)?:?\s*([A-Z][A-Z\s]+)/i,
  ];

  for (const pattern of vesselPatterns) {
    const match = text.match(pattern);
    if (match) {
      data.vessel = match[1].trim().split(/\s{2,}/)[0]; // Take first part before multiple spaces
      break;
    }
  }

  // Extract voyage
  const voyagePatterns = [
    /VOYAGE\s*(?:#|NO|NUMBER)?:?\s*([A-Z0-9-]+)/i,
    /VOY\s*(?:#|NO)?:?\s*([A-Z0-9-]+)/i,
  ];

  for (const pattern of voyagePatterns) {
    const match = text.match(pattern);
    if (match) {
      data.voyage = match[1].trim();
      break;
    }
  }

  // Extract dates (various formats) - including written month formats
  const lfdPatterns = [
    /LAST\s*FREE\s*(?:DAY|DATE)?\s*:?\s*(\d{1,2}[\/-]\d{1,2}[\/-]\d{2,4})/i,
    /LFD\s*:?\s*(\d{1,2}[\/-]\d{1,2}[\/-]\d{2,4})/i,
    /FREE\s*TIME\s*(?:EXPIRES?|ENDS?)?\s*:?\s*(\d{1,2}[\/-]\d{1,2}[\/-]\d{2,4})/i,
    /LFD\s*:?\s*(\w+\s+\d{1,2},?\s+\d{4})/i, // "Jan 15, 2024" format
    /LAST\s*FREE\s*(?:DAY)?\s*:?\s*(\w+\s+\d{1,2},?\s+\d{4})/i,
    /DEMURRAGE\s*(?:STARTS?)?\s*:?\s*(\d{1,2}[\/-]\d{1,2}[\/-]\d{2,4})/i,
  ];

  for (const pattern of lfdPatterns) {
    const match = text.match(pattern);
    if (match) {
      data.lastFreeDay = normalizeDate(match[1]);
      break;
    }
  }

  // Extract port cutoff
  const cutoffPatterns = [
    /PORT\s*CUT\s*(?:OFF)?\s*:?\s*(\d{1,2}[\/-]\d{1,2}[\/-]\d{2,4})/i,
    /CUT\s*(?:OFF)?\s*(?:DATE|TIME)?\s*:?\s*(\d{1,2}[\/-]\d{1,2}[\/-]\d{2,4})/i,
    /CARGO\s*CUT\s*(?:OFF)?\s*:?\s*(\d{1,2}[\/-]\d{1,2}[\/-]\d{2,4})/i,
    /CUTOFF\s*:?\s*(\d{1,2}[\/-]\d{1,2}[\/-]\d{2,4})/i,
  ];

  for (const pattern of cutoffPatterns) {
    const match = text.match(pattern);
    if (match) {
      data.portCutoff = normalizeDate(match[1]);
      break;
    }
  }

  // Extract customer/consignee name
  const customerPatterns = [
    /CONSIGNEE\s*:?\s*([A-Z][A-Za-z\s&.,]+?)(?:\n|$|NOTIFY|ADDRESS|PHONE)/i,
    /DELIVER\s*(?:TO)?\s*:?\s*([A-Z][A-Za-z\s&.,]+?)(?:\n|$|ADDRESS|PHONE)/i,
    /SHIPPER\s*:?\s*([A-Z][A-Za-z\s&.,]+?)(?:\n|$|NOTIFY|ADDRESS|PHONE)/i,
    /CUSTOMER\s*:?\s*([A-Z][A-Za-z\s&.,]+?)(?:\n|$|ADDRESS|PHONE)/i,
  ];

  for (const pattern of customerPatterns) {
    const match = text.match(pattern);
    if (match) {
      const name = match[1].trim().replace(/\s+/g, ' ');
      if (name.length > 3 && name.length < 100) {
        data.customerName = name;
        break;
      }
    }
  }

  // Extract addresses
  const addressPattern = /(\d+\s+[A-Z][A-Za-z\s]+(?:ST|STREET|AVE|AVENUE|BLVD|BOULEVARD|RD|ROAD|DR|DRIVE|LN|LANE|WAY|CT|COURT|PL|PLACE|CIR|CIRCLE)\.?)\s*,?\s*([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\s*,?\s*([A-Z]{2})\s*(\d{5}(?:-\d{4})?)/gi;

  const addressMatches = [...text.matchAll(addressPattern)];
  if (addressMatches.length > 0) {
    const [, address, city, state, zip] = addressMatches[0];
    if (data.type === 'IMPORT') {
      data.deliveryAddress = address;
      data.deliveryCity = city;
      data.deliveryState = state;
      data.deliveryZip = zip;
    } else {
      data.pickupAddress = address;
      data.pickupCity = city;
      data.pickupState = state;
      data.pickupZip = zip;
    }
  }

  // Extract weight
  const weightPatterns = [
    /(?:GROSS\s*)?WEIGHT\s*:?\s*([\d,]+)\s*(?:LBS?|POUNDS?)/i,
    /(?:CARGO\s*)?WT\s*:?\s*([\d,]+)\s*(?:LBS?|POUNDS?)/i,
    /([\d,]+)\s*(?:LBS?|POUNDS?)/i,
  ];

  for (const pattern of weightPatterns) {
    const match = text.match(pattern);
    if (match && data.containers && data.containers.length > 0) {
      const weight = parseInt(match[1].replace(/,/g, ''), 10);
      if (weight > 1000 && weight < 100000) {
        data.containers[0].weightLbs = weight;
      }
      break;
    }
  }

  // Extract container size
  const sizePatterns = [
    /(\d{2})\s*(?:FT|FOOT|\')\s*(?:CONTAINER|CNTR|CTR)?/i,
    /(?:SIZE|EQUIPMENT)\s*:?\s*(\d{2})/i,
  ];

  for (const pattern of sizePatterns) {
    const match = text.match(pattern);
    if (match && data.containers && data.containers.length > 0) {
      const size = match[1];
      if (['20', '40', '45'].includes(size)) {
        data.containers[0].size = size as '20' | '40' | '45';
      }
      break;
    }
  }

  // Check for hazmat
  if (upperText.includes('HAZMAT') || upperText.includes('HAZARDOUS') || upperText.includes('DANGEROUS GOODS')) {
    if (data.containers && data.containers.length > 0) {
      data.containers[0].isHazmat = true;
    }
  }

  // Check for reefer
  if (upperText.includes('REEFER') || upperText.includes('REFRIGERATED') || upperText.includes('TEMP CONTROLLED')) {
    if (data.containers && data.containers.length > 0) {
      data.containers[0].isReefer = true;
      data.containers[0].type = 'REEFER';
    }
  }

  // Set confidence based on what was extracted
  let fieldsExtracted = 0;
  if (data.type) fieldsExtracted++;
  if (data.steamshipLine) fieldsExtracted++;
  if (data.bookingNumber) fieldsExtracted++;
  if (data.containers && data.containers.length > 0) fieldsExtracted += 2;
  if (data.vessel) fieldsExtracted++;
  if (data.terminalName) fieldsExtracted++;
  if (data.lastFreeDay || data.portCutoff) fieldsExtracted++;

  data.confidence = Math.min(fieldsExtracted / 8, 1);

  return data;
}

// Parse LLM response
export function parseLLMResponse(response: string): ExtractedLoadData | null {
  try {
    // Try to extract JSON from the response
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return null;
    }

    const data = JSON.parse(jsonMatch[0]);

    // Validate and clean the data
    const cleaned: ExtractedLoadData = {};

    if (data.type === 'IMPORT' || data.type === 'EXPORT') {
      cleaned.type = data.type;
    }

    // String fields
    const stringFields: (keyof ExtractedLoadData)[] = [
      'customerName', 'steamshipLine', 'bookingNumber', 'billOfLading',
      'vessel', 'voyage', 'terminalName', 'lastFreeDay', 'portCutoff', 'earliestReturnDate',
      'deliveryLocationName', 'deliveryAddress', 'deliveryCity', 'deliveryState', 'deliveryZip',
      'deliveryContactName', 'deliveryContactPhone',
      'pickupLocationName', 'pickupAddress', 'pickupCity', 'pickupState', 'pickupZip',
      'pickupContactName', 'pickupContactPhone',
      'tripType', 'chassisPool', 'specialInstructions',
    ];

    for (const field of stringFields) {
      if (data[field] && typeof data[field] === 'string' && data[field] !== 'null') {
        (cleaned as any)[field] = data[field];
      }
    }

    // Boolean fields
    if (typeof data.chassisRequired === 'boolean') {
      cleaned.chassisRequired = data.chassisRequired;
    }

    // Containers
    if (Array.isArray(data.containers) && data.containers.length > 0) {
      cleaned.containers = data.containers
        .filter((c: any) => c && typeof c === 'object')
        .map((c: any) => ({
          containerNumber: typeof c.containerNumber === 'string' ? c.containerNumber : undefined,
          size: ['20', '40', '45'].includes(c.size) ? c.size : undefined,
          type: c.type || undefined,
          weightLbs: typeof c.weightLbs === 'number' ? c.weightLbs : undefined,
          sealNumber: typeof c.sealNumber === 'string' ? c.sealNumber : undefined,
          isHazmat: c.isHazmat === true,
          hazmatClass: typeof c.hazmatClass === 'string' ? c.hazmatClass : undefined,
          hazmatUnNumber: typeof c.hazmatUnNumber === 'string' ? c.hazmatUnNumber : undefined,
          isOverweight: c.isOverweight === true,
          isReefer: c.isReefer === true,
          reeferTemp: typeof c.reeferTemp === 'number' ? c.reeferTemp : undefined,
        }));
    }

    // Confidence
    if (typeof data.confidence === 'number') {
      cleaned.confidence = Math.min(Math.max(data.confidence, 0), 1);
    }

    return cleaned;
  } catch (error) {
    console.error('Failed to parse LLM response:', error);
    return null;
  }
}

// Normalize date to YYYY-MM-DD
function normalizeDate(dateStr: string): string {
  const parts = dateStr.split(/[\/-]/);
  if (parts.length !== 3) return dateStr;

  let [part1, part2, part3] = parts;
  let year: string, month: string, day: string;

  // Determine format
  if (part1.length === 4) {
    // YYYY-MM-DD
    year = part1;
    month = part2.padStart(2, '0');
    day = part3.padStart(2, '0');
  } else if (part3.length === 4) {
    // MM-DD-YYYY or DD-MM-YYYY
    year = part3;
    // Assume MM-DD-YYYY (US format)
    month = part1.padStart(2, '0');
    day = part2.padStart(2, '0');
  } else {
    // MM-DD-YY
    const yearNum = parseInt(part3, 10);
    year = yearNum < 50 ? `20${part3.padStart(2, '0')}` : `19${part3.padStart(2, '0')}`;
    month = part1.padStart(2, '0');
    day = part2.padStart(2, '0');
  }

  return `${year}-${month}-${day}`;
}

// Merge extracted data - LLM takes precedence, rules fill gaps
export function mergeExtractedData(llmData: ExtractedLoadData | null, rulesData: ExtractedLoadData): ExtractedLoadData {
  if (!llmData) {
    return rulesData;
  }

  const merged: ExtractedLoadData = { ...rulesData };

  // Override with LLM data where available
  for (const key of Object.keys(llmData) as (keyof ExtractedLoadData)[]) {
    const llmValue = llmData[key];
    if (llmValue !== undefined && llmValue !== null) {
      if (key === 'containers' && Array.isArray(llmValue) && llmValue.length > 0) {
        merged.containers = llmValue;
      } else if (key !== 'containers') {
        (merged as any)[key] = llmValue;
      }
    }
  }

  // Use LLM confidence if available and higher
  if (llmData.confidence && (!merged.confidence || llmData.confidence > merged.confidence)) {
    merged.confidence = llmData.confidence;
  }

  return merged;
}
