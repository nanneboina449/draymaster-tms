// ==============================================================================
// DRAYMASTER TMS - Validation Engine
// ==============================================================================
// Addresses P0 Critical Issue: No Request Validation/Business Rules
// Provides comprehensive validation for orders, shipments, and containers

import { supabase } from './supabase';

// ==============================================================================
// TYPES
// ==============================================================================

export type ValidationSeverity = 'ERROR' | 'WARNING' | 'INFO';

export interface ValidationResult {
  isValid: boolean;
  errors: ValidationError[];
  warnings: ValidationError[];
  infos: ValidationError[];
}

export interface ValidationError {
  code: string;
  field?: string;
  message: string;
  severity: ValidationSeverity;
  value?: any;
}

export interface ValidationRule {
  code: string;
  name: string;
  validate: (data: any, context?: ValidationContext) => Promise<ValidationError | null>;
  severity: ValidationSeverity;
  appliesTo: string[];
}

export interface ValidationContext {
  entityType: 'shipment' | 'container' | 'order' | 'trip';
  isUpdate?: boolean;
  existingData?: any;
  relatedEntities?: {
    shipment?: any;
    containers?: any[];
    orders?: any[];
    driver?: any;
  };
}

// ==============================================================================
// VALIDATION RULES
// ==============================================================================

// Container Number Format Validation
const validateContainerNumberFormat: ValidationRule = {
  code: 'CONTAINER_NUMBER_FORMAT',
  name: 'Container Number Format',
  severity: 'ERROR',
  appliesTo: ['container'],
  validate: async (data) => {
    const containerNumber = data.container_number || data.containerNumber;
    if (!containerNumber) return null;

    // Standard container number format: 4 letters + 7 digits (e.g., MAEU1234567)
    const regex = /^[A-Z]{4}[0-9]{7}$/;
    if (!regex.test(containerNumber.toUpperCase())) {
      return {
        code: 'CONTAINER_NUMBER_FORMAT',
        field: 'container_number',
        message: 'Container number must be 4 letters followed by 7 digits (e.g., MAEU1234567)',
        severity: 'ERROR',
        value: containerNumber,
      };
    }
    return null;
  },
};

// Container Weight Range Validation
const validateContainerWeight: ValidationRule = {
  code: 'CONTAINER_WEIGHT_RANGE',
  name: 'Container Weight Range',
  severity: 'WARNING',
  appliesTo: ['container'],
  validate: async (data) => {
    const weight = data.weight_lbs || data.weight;
    if (!weight) return null;

    if (weight < 1000 || weight > 55000) {
      return {
        code: 'CONTAINER_WEIGHT_RANGE',
        field: 'weight_lbs',
        message: `Container weight ${weight} lbs is outside normal range (1,000-55,000 lbs). Please verify.`,
        severity: 'WARNING',
        value: weight,
      };
    }
    return null;
  },
};

// Overweight Container Validation
const validateOverweight: ValidationRule = {
  code: 'OVERWEIGHT_CHECK',
  name: 'Overweight Container Check',
  severity: 'WARNING',
  appliesTo: ['container'],
  validate: async (data) => {
    const weight = data.weight_lbs || data.weight;
    const isOverweight = data.is_overweight || data.isOverweight;

    if (weight > 44000 && !isOverweight) {
      return {
        code: 'OVERWEIGHT_CHECK',
        field: 'is_overweight',
        message: `Container weight ${weight} lbs exceeds 44,000 lbs. Mark as overweight to assign triaxle chassis.`,
        severity: 'WARNING',
        value: weight,
      };
    }
    return null;
  },
};

// Hazmat Requires Class
const validateHazmatClass: ValidationRule = {
  code: 'HAZMAT_CLASS_REQUIRED',
  name: 'Hazmat Class Required',
  severity: 'ERROR',
  appliesTo: ['container'],
  validate: async (data) => {
    const isHazmat = data.is_hazmat || data.isHazmat;
    const hazmatClass = data.hazmat_class || data.hazmatClass;

    if (isHazmat && !hazmatClass) {
      return {
        code: 'HAZMAT_CLASS_REQUIRED',
        field: 'hazmat_class',
        message: 'Hazmat containers must have a hazmat class specified',
        severity: 'ERROR',
      };
    }
    return null;
  },
};

// Reefer Requires Temperature
const validateReeferTemp: ValidationRule = {
  code: 'REEFER_TEMP_REQUIRED',
  name: 'Reefer Temperature Required',
  severity: 'ERROR',
  appliesTo: ['container'],
  validate: async (data) => {
    const isReefer = data.is_reefer || data.isReefer;
    const reeferTemp = data.reefer_temp_setpoint || data.reeferTemp || data.reefer_temp;

    if (isReefer && reeferTemp === undefined) {
      return {
        code: 'REEFER_TEMP_REQUIRED',
        field: 'reefer_temp_setpoint',
        message: 'Reefer containers must have a temperature setpoint',
        severity: 'ERROR',
      };
    }
    return null;
  },
};

// Booking Number Required for Export
const validateBookingNumber: ValidationRule = {
  code: 'BOOKING_NUMBER_REQUIRED_EXPORT',
  name: 'Booking Number Required for Export',
  severity: 'ERROR',
  appliesTo: ['shipment'],
  validate: async (data) => {
    const type = data.type?.toUpperCase();
    const bookingNumber = data.booking_number || data.bookingNumber;

    if (type === 'EXPORT' && !bookingNumber) {
      return {
        code: 'BOOKING_NUMBER_REQUIRED_EXPORT',
        field: 'booking_number',
        message: 'Export shipments require a booking number',
        severity: 'ERROR',
      };
    }
    return null;
  },
};

// Last Free Day Validation
const validateLastFreeDay: ValidationRule = {
  code: 'LFD_FUTURE_DATE',
  name: 'Last Free Day Must Be Future',
  severity: 'WARNING',
  appliesTo: ['shipment'],
  validate: async (data) => {
    const lfd = data.last_free_day || data.lastFreeDay;
    if (!lfd) return null;

    const lfdDate = new Date(lfd);
    lfdDate.setHours(0, 0, 0, 0);

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    if (lfdDate < today) {
      return {
        code: 'LFD_FUTURE_DATE',
        field: 'last_free_day',
        message: `Last Free Day (${lfd}) is in the past. Demurrage charges may apply.`,
        severity: 'WARNING',
        value: lfd,
      };
    }
    return null;
  },
};

// Port Cutoff Required for Export
const validatePortCutoff: ValidationRule = {
  code: 'PORT_CUTOFF_REQUIRED_EXPORT',
  name: 'Port Cutoff Required for Export',
  severity: 'WARNING',
  appliesTo: ['shipment'],
  validate: async (data) => {
    const type = data.type?.toUpperCase();
    const portCutoff = data.port_cutoff || data.portCutoff;

    if (type === 'EXPORT' && !portCutoff) {
      return {
        code: 'PORT_CUTOFF_REQUIRED_EXPORT',
        field: 'port_cutoff',
        message: 'Export shipments should have a port cutoff date',
        severity: 'WARNING',
      };
    }
    return null;
  },
};

// Delivery Location Required
const validateDeliveryLocation: ValidationRule = {
  code: 'DELIVERY_LOCATION_REQUIRED',
  name: 'Delivery Location Required',
  severity: 'ERROR',
  appliesTo: ['order', 'shipment'],
  validate: async (data) => {
    const hasLocation =
      data.delivery_location_id ||
      data.delivery_address ||
      data.deliveryAddress ||
      data.delivery_city ||
      data.deliveryCity;

    if (!hasLocation) {
      return {
        code: 'DELIVERY_LOCATION_REQUIRED',
        field: 'delivery_address',
        message: 'A delivery location is required',
        severity: 'ERROR',
      };
    }
    return null;
  },
};

// Customer Required
const validateCustomer: ValidationRule = {
  code: 'CUSTOMER_REQUIRED',
  name: 'Customer Required',
  severity: 'ERROR',
  appliesTo: ['shipment', 'order'],
  validate: async (data) => {
    const hasCustomer = data.customer_id || data.customerId || data.customer_name || data.customerName;

    if (!hasCustomer) {
      return {
        code: 'CUSTOMER_REQUIRED',
        field: 'customer_id',
        message: 'A customer must be selected',
        severity: 'ERROR',
      };
    }
    return null;
  },
};

// Steamship Line Required
const validateSteamshipLine: ValidationRule = {
  code: 'STEAMSHIP_LINE_REQUIRED',
  name: 'Steamship Line Required',
  severity: 'ERROR',
  appliesTo: ['shipment'],
  validate: async (data) => {
    const ssl = data.steamship_line_id || data.steamship_line || data.steamshipLine;

    if (!ssl) {
      return {
        code: 'STEAMSHIP_LINE_REQUIRED',
        field: 'steamship_line',
        message: 'A steamship line must be selected',
        severity: 'ERROR',
      };
    }
    return null;
  },
};

// At Least One Container Required
const validateContainersExist: ValidationRule = {
  code: 'CONTAINERS_REQUIRED',
  name: 'At Least One Container Required',
  severity: 'ERROR',
  appliesTo: ['shipment'],
  validate: async (data, context) => {
    const containers = data.containers || context?.relatedEntities?.containers;

    if (!containers || containers.length === 0) {
      return {
        code: 'CONTAINERS_REQUIRED',
        field: 'containers',
        message: 'At least one container is required',
        severity: 'ERROR',
      };
    }
    return null;
  },
};

// Duplicate Container Number Check
const validateDuplicateContainerNumber: ValidationRule = {
  code: 'DUPLICATE_CONTAINER_NUMBER',
  name: 'Duplicate Container Number',
  severity: 'ERROR',
  appliesTo: ['container'],
  validate: async (data, context) => {
    const containerNumber = data.container_number || data.containerNumber;
    if (!containerNumber) return null;

    // Check if container number already exists in this shipment
    if (context?.relatedEntities?.containers) {
      const duplicates = context.relatedEntities.containers.filter(
        (c: any) =>
          (c.container_number || c.containerNumber)?.toUpperCase() === containerNumber.toUpperCase() &&
          c.id !== data.id
      );

      if (duplicates.length > 0) {
        return {
          code: 'DUPLICATE_CONTAINER_NUMBER',
          field: 'container_number',
          message: `Container number ${containerNumber} is already added to this shipment`,
          severity: 'ERROR',
          value: containerNumber,
        };
      }
    }

    // Check in database (for existing containers)
    if (!context?.isUpdate) {
      const { data: existing } = await supabase
        .from('containers')
        .select('id, shipment_id')
        .eq('container_number', containerNumber.toUpperCase())
        .is('deleted_at', null)
        .limit(1);

      if (existing && existing.length > 0) {
        return {
          code: 'DUPLICATE_CONTAINER_NUMBER',
          field: 'container_number',
          message: `Container ${containerNumber} already exists in the system`,
          severity: 'WARNING',
          value: containerNumber,
        };
      }
    }

    return null;
  },
};

// Driver Hazmat Certification Check
const validateDriverHazmatCert: ValidationRule = {
  code: 'DRIVER_HAZMAT_CERTIFICATION',
  name: 'Driver Hazmat Certification',
  severity: 'ERROR',
  appliesTo: ['trip'],
  validate: async (data, context) => {
    const driverId = data.driver_id || data.driverId;
    const container = context?.relatedEntities?.containers?.[0];
    const isHazmat = container?.is_hazmat || data.is_hazmat;

    if (!isHazmat || !driverId) return null;

    // Check if driver has valid hazmat certification
    const { data: cert } = await supabase
      .from('driver_certifications')
      .select('*')
      .eq('driver_id', driverId)
      .eq('certification_type', 'HAZMAT')
      .eq('is_active', true)
      .gte('expiry_date', new Date().toISOString().split('T')[0])
      .limit(1);

    if (!cert || cert.length === 0) {
      return {
        code: 'DRIVER_HAZMAT_CERTIFICATION',
        field: 'driver_id',
        message: 'Selected driver does not have a valid HAZMAT certification',
        severity: 'ERROR',
      };
    }

    return null;
  },
};

// Driver TWIC Card Check
const validateDriverTWIC: ValidationRule = {
  code: 'DRIVER_TWIC_REQUIRED',
  name: 'Driver TWIC Card Required',
  severity: 'ERROR',
  appliesTo: ['trip'],
  validate: async (data, context) => {
    const driverId = data.driver_id || data.driverId;
    if (!driverId) return null;

    // Check if trip involves port terminal
    const shipment = context?.relatedEntities?.shipment || context?.relatedEntities?.containers?.[0]?.shipment;
    const terminal = shipment?.terminal_name || data.terminal;

    // Only check for port pickups
    if (!terminal?.toLowerCase().includes('port') && !terminal?.toLowerCase().includes('terminal')) {
      return null;
    }

    // Check driver has valid TWIC
    const { data: cert } = await supabase
      .from('driver_certifications')
      .select('*')
      .eq('driver_id', driverId)
      .eq('certification_type', 'TWIC')
      .eq('is_active', true)
      .gte('expiry_date', new Date().toISOString().split('T')[0])
      .limit(1);

    if (!cert || cert.length === 0) {
      return {
        code: 'DRIVER_TWIC_REQUIRED',
        field: 'driver_id',
        message: 'Selected driver does not have a valid TWIC card for port access',
        severity: 'ERROR',
      };
    }

    return null;
  },
};

// Chassis Size Compatibility
const validateChassisCompatibility: ValidationRule = {
  code: 'CHASSIS_COMPATIBILITY',
  name: 'Chassis Size Compatibility',
  severity: 'ERROR',
  appliesTo: ['trip'],
  validate: async (data, context) => {
    const chassisSize = data.chassis_size || data.chassisSize;
    const container = context?.relatedEntities?.containers?.[0];
    const containerSize = container?.size || data.container_size;

    if (!chassisSize || !containerSize) return null;

    // Check compatibility
    const { data: compatibility } = await supabase
      .from('equipment_compatibility')
      .select('is_compatible')
      .eq('container_size', containerSize)
      .eq('chassis_size', chassisSize)
      .limit(1);

    if (compatibility && compatibility.length > 0 && !compatibility[0].is_compatible) {
      return {
        code: 'CHASSIS_COMPATIBILITY',
        field: 'chassis_size',
        message: `Chassis size ${chassisSize} is not compatible with container size ${containerSize}`,
        severity: 'ERROR',
      };
    }

    return null;
  },
};

// ==============================================================================
// VALIDATION REGISTRY
// ==============================================================================

const validationRules: ValidationRule[] = [
  // Container validations
  validateContainerNumberFormat,
  validateContainerWeight,
  validateOverweight,
  validateHazmatClass,
  validateReeferTemp,
  validateDuplicateContainerNumber,

  // Shipment validations
  validateBookingNumber,
  validateLastFreeDay,
  validatePortCutoff,
  validateDeliveryLocation,
  validateCustomer,
  validateSteamshipLine,
  validateContainersExist,

  // Trip/Dispatch validations
  validateDriverHazmatCert,
  validateDriverTWIC,
  validateChassisCompatibility,
];

// ==============================================================================
// VALIDATION FUNCTIONS
// ==============================================================================

/**
 * Validate data against all applicable rules
 */
export async function validate(
  data: any,
  entityType: 'shipment' | 'container' | 'order' | 'trip',
  context?: Partial<ValidationContext>
): Promise<ValidationResult> {
  const errors: ValidationError[] = [];
  const warnings: ValidationError[] = [];
  const infos: ValidationError[] = [];

  const fullContext: ValidationContext = {
    entityType,
    ...context,
  };

  // Get applicable rules
  const applicableRules = validationRules.filter((rule) =>
    rule.appliesTo.includes(entityType)
  );

  // Run all validations
  for (const rule of applicableRules) {
    try {
      const error = await rule.validate(data, fullContext);
      if (error) {
        switch (error.severity) {
          case 'ERROR':
            errors.push(error);
            break;
          case 'WARNING':
            warnings.push(error);
            break;
          case 'INFO':
            infos.push(error);
            break;
        }
      }
    } catch (err) {
      console.error(`Validation rule ${rule.code} failed:`, err);
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
    infos,
  };
}

/**
 * Validate a shipment with all its containers
 */
export async function validateShipment(
  shipmentData: any,
  containers: any[]
): Promise<ValidationResult> {
  const allErrors: ValidationError[] = [];
  const allWarnings: ValidationError[] = [];
  const allInfos: ValidationError[] = [];

  // Validate shipment
  const shipmentResult = await validate(shipmentData, 'shipment', {
    relatedEntities: { containers },
  });
  allErrors.push(...shipmentResult.errors);
  allWarnings.push(...shipmentResult.warnings);
  allInfos.push(...shipmentResult.infos);

  // Validate each container
  for (let i = 0; i < containers.length; i++) {
    const container = containers[i];
    const containerResult = await validate(container, 'container', {
      relatedEntities: { containers, shipment: shipmentData },
    });

    // Add container index to error messages
    containerResult.errors.forEach((e) => {
      e.field = `containers[${i}].${e.field || 'unknown'}`;
      e.message = `Container ${i + 1}: ${e.message}`;
    });
    containerResult.warnings.forEach((w) => {
      w.field = `containers[${i}].${w.field || 'unknown'}`;
      w.message = `Container ${i + 1}: ${w.message}`;
    });

    allErrors.push(...containerResult.errors);
    allWarnings.push(...containerResult.warnings);
    allInfos.push(...containerResult.infos);
  }

  return {
    isValid: allErrors.length === 0,
    errors: allErrors,
    warnings: allWarnings,
    infos: allInfos,
  };
}

/**
 * Validate trip/dispatch assignment
 */
export async function validateDispatch(
  tripData: any,
  container: any,
  driver: any,
  shipment?: any
): Promise<ValidationResult> {
  return validate(tripData, 'trip', {
    relatedEntities: {
      containers: [container],
      driver,
      shipment,
    },
  });
}

/**
 * Quick validation for a single field
 */
export async function validateField(
  fieldName: string,
  value: any,
  entityType: 'shipment' | 'container' | 'order' | 'trip'
): Promise<ValidationError | null> {
  const data = { [fieldName]: value };
  const result = await validate(data, entityType);

  // Return first error for this field
  return (
    result.errors.find((e) => e.field === fieldName) ||
    result.warnings.find((e) => e.field === fieldName) ||
    null
  );
}

/**
 * Format validation errors for display
 */
export function formatValidationErrors(result: ValidationResult): string[] {
  return [
    ...result.errors.map((e) => `Error: ${e.message}`),
    ...result.warnings.map((w) => `Warning: ${w.message}`),
  ];
}

/**
 * Check if validation result has any blocking errors
 */
export function hasBlockingErrors(result: ValidationResult): boolean {
  return result.errors.length > 0;
}

/**
 * Get validation summary
 */
export function getValidationSummary(result: ValidationResult): string {
  if (result.isValid && result.warnings.length === 0) {
    return 'All validations passed';
  }

  const parts = [];
  if (result.errors.length > 0) {
    parts.push(`${result.errors.length} error(s)`);
  }
  if (result.warnings.length > 0) {
    parts.push(`${result.warnings.length} warning(s)`);
  }

  return parts.join(', ');
}
