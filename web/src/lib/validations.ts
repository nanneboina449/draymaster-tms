import { z } from 'zod';

// ============================================================================
// Common Validation Patterns
// ============================================================================

export const phoneRegex = /^[\d\s\-\+\(\)]+$/;
export const containerNumberRegex = /^[A-Z]{4}\d{7}$/;
export const zipCodeRegex = /^\d{5}(-\d{4})?$/;

// ============================================================================
// Customer Validation
// ============================================================================

export const customerSchema = z.object({
  company_name: z
    .string()
    .min(2, 'Company name must be at least 2 characters')
    .max(255, 'Company name cannot exceed 255 characters'),
  contact_name: z.string().optional(),
  email: z
    .string()
    .email('Please enter a valid email address')
    .optional()
    .or(z.literal('')),
  phone: z
    .string()
    .regex(phoneRegex, 'Please enter a valid phone number')
    .optional()
    .or(z.literal('')),
  address: z.string().max(500, 'Address cannot exceed 500 characters').optional(),
  city: z.string().max(100, 'City cannot exceed 100 characters').optional(),
  state: z.string().max(50, 'State cannot exceed 50 characters').optional(),
  zip: z
    .string()
    .regex(zipCodeRegex, 'Please enter a valid ZIP code')
    .optional()
    .or(z.literal('')),
});

export type CustomerFormData = z.infer<typeof customerSchema>;

// ============================================================================
// Driver Validation
// ============================================================================

export const driverSchema = z.object({
  first_name: z
    .string()
    .min(1, 'First name is required')
    .max(100, 'First name cannot exceed 100 characters'),
  last_name: z
    .string()
    .min(1, 'Last name is required')
    .max(100, 'Last name cannot exceed 100 characters'),
  email: z
    .string()
    .email('Please enter a valid email address')
    .optional()
    .or(z.literal('')),
  phone: z
    .string()
    .regex(phoneRegex, 'Please enter a valid phone number')
    .optional()
    .or(z.literal('')),
  license_number: z.string().max(50, 'License number cannot exceed 50 characters').optional(),
  license_state: z.string().max(10, 'License state cannot exceed 10 characters').optional(),
  license_expiry: z.string().optional(),
  twic_expiry: z.string().optional(),
  hazmat_endorsement: z.boolean().optional(),
  status: z.enum(['ACTIVE', 'INACTIVE', 'ON_LEAVE', 'AVAILABLE']).default('ACTIVE'),
  pay_type: z.enum(['FLAT', 'PERCENTAGE', 'PER_MILE']).optional(),
  pay_rate: z
    .string()
    .refine(
      (val) => !val || !isNaN(parseFloat(val)),
      'Pay rate must be a valid number'
    )
    .optional(),
});

export type DriverFormData = z.infer<typeof driverSchema>;

// ============================================================================
// Container Validation
// ============================================================================

export const containerSchema = z.object({
  container_number: z
    .string()
    .min(1, 'Container number is required')
    .max(15, 'Container number cannot exceed 15 characters')
    .refine(
      (val) => containerNumberRegex.test(val.toUpperCase()),
      'Container number must be 4 letters followed by 7 digits (e.g., MSCU1234567)'
    ),
  size: z.enum(['20', '40', '40HC', '45'], {
    errorMap: () => ({ message: 'Please select a valid container size' }),
  }),
  type: z.enum(['DRY', 'REEFER', 'FLAT', 'OPEN_TOP', 'TANK']).default('DRY'),
  weight_lbs: z
    .number()
    .min(0, 'Weight cannot be negative')
    .max(100000, 'Weight cannot exceed 100,000 lbs')
    .optional(),
  seal_number: z.string().max(50, 'Seal number cannot exceed 50 characters').optional(),
  is_hazmat: z.boolean().default(false),
  hazmat_class: z.string().max(20, 'Hazmat class cannot exceed 20 characters').optional(),
  is_overweight: z.boolean().default(false),
  is_reefer: z.boolean().default(false),
  reefer_temp: z.number().optional(),
});

export type ContainerFormData = z.infer<typeof containerSchema>;

// ============================================================================
// Shipment/Load Validation
// ============================================================================

export const shipmentSchema = z.object({
  type: z.enum(['IMPORT', 'EXPORT'], {
    errorMap: () => ({ message: 'Please select shipment type' }),
  }),
  customer_name: z
    .string()
    .min(1, 'Customer name is required')
    .max(255, 'Customer name cannot exceed 255 characters'),
  steamship_line: z.string().max(255, 'Steamship line cannot exceed 255 characters').optional(),
  booking_number: z.string().max(100, 'Booking number cannot exceed 100 characters').optional(),
  bill_of_lading: z.string().max(100, 'Bill of lading cannot exceed 100 characters').optional(),
  vessel: z.string().max(255, 'Vessel name cannot exceed 255 characters').optional(),
  voyage: z.string().max(50, 'Voyage cannot exceed 50 characters').optional(),
  terminal_name: z.string().max(255, 'Terminal name cannot exceed 255 characters').optional(),
  last_free_day: z.string().optional(),
  port_cutoff: z.string().optional(),
  trip_type: z.enum(['LIVE', 'DROP', 'PREPULL']).optional(),
  chassis_required: z.boolean().default(true),
  chassis_pool: z.string().max(100, 'Chassis pool cannot exceed 100 characters').optional(),
  delivery_address: z.string().max(500, 'Delivery address cannot exceed 500 characters').optional(),
  delivery_city: z.string().max(100, 'Delivery city cannot exceed 100 characters').optional(),
  delivery_state: z.string().max(50, 'Delivery state cannot exceed 50 characters').optional(),
  delivery_zip: z
    .string()
    .regex(zipCodeRegex, 'Please enter a valid ZIP code')
    .optional()
    .or(z.literal('')),
  special_instructions: z.string().max(1000, 'Instructions cannot exceed 1000 characters').optional(),
});

export type ShipmentFormData = z.infer<typeof shipmentSchema>;

// ============================================================================
// Invoice Validation
// ============================================================================

export const invoiceSchema = z.object({
  customer_name: z
    .string()
    .min(1, 'Customer name is required')
    .max(255, 'Customer name cannot exceed 255 characters'),
  invoice_date: z.string().min(1, 'Invoice date is required'),
  due_date: z.string().min(1, 'Due date is required'),
  subtotal: z
    .string()
    .refine((val) => !isNaN(parseFloat(val)) && parseFloat(val) >= 0, 'Subtotal must be a valid positive number'),
  tax_rate: z
    .string()
    .refine(
      (val) => !val || (!isNaN(parseFloat(val)) && parseFloat(val) >= 0 && parseFloat(val) <= 100),
      'Tax rate must be between 0 and 100'
    )
    .optional(),
  notes: z.string().max(1000, 'Notes cannot exceed 1000 characters').optional(),
});

export type InvoiceFormData = z.infer<typeof invoiceSchema>;

// ============================================================================
// Order Entry (Dispatch) Validation
// ============================================================================

export const orderEntrySchema = z.object({
  customer_id: z.string().min(1, 'Please select a customer'),
  container_number: z
    .string()
    .min(1, 'Container number is required')
    .refine(
      (val) => containerNumberRegex.test(val.toUpperCase()),
      'Container number must be 4 letters followed by 7 digits'
    ),
  container_size: z.enum(['20', '40', '40HC', '45'], {
    errorMap: () => ({ message: 'Please select a container size' }),
  }),
  container_type: z.enum(['DRY', 'REEFER', 'FLAT', 'OPEN_TOP', 'TANK']).default('DRY'),
  move_type: z.enum(['LIVE', 'DROP', 'PREPULL', 'STREET_TURN', 'RETURN_EMPTY']),
  terminal: z.string().min(1, 'Please select a terminal'),
  terminal_status: z.string().optional(),
  last_free_day: z.string().optional(),
  delivery_location: z.string().max(500, 'Delivery location cannot exceed 500 characters').optional(),
  special_instructions: z.string().max(1000, 'Instructions cannot exceed 1000 characters').optional(),
  is_hazmat: z.boolean().default(false),
  is_overweight: z.boolean().default(false),
  weight_lbs: z
    .number()
    .min(0, 'Weight cannot be negative')
    .max(100000, 'Weight cannot exceed 100,000 lbs')
    .optional(),
});

export type OrderEntryFormData = z.infer<typeof orderEntrySchema>;

// ============================================================================
// Validation Helper Functions
// ============================================================================

export function validateForm<T>(
  schema: z.ZodSchema<T>,
  data: unknown
): { success: true; data: T } | { success: false; errors: Record<string, string> } {
  const result = schema.safeParse(data);

  if (result.success) {
    return { success: true, data: result.data };
  }

  const errors: Record<string, string> = {};
  result.error.errors.forEach((err) => {
    const path = err.path.join('.');
    if (!errors[path]) {
      errors[path] = err.message;
    }
  });

  return { success: false, errors };
}

export function getFieldError(
  errors: Record<string, string> | undefined,
  field: string
): string | undefined {
  return errors?.[field];
}

// ============================================================================
// Container Number Validation (ISO 6346)
// ============================================================================

export function validateContainerNumber(containerNumber: string): {
  valid: boolean;
  error?: string;
} {
  const cleaned = containerNumber.toUpperCase().replace(/\s/g, '');

  if (cleaned.length !== 11) {
    return { valid: false, error: 'Container number must be 11 characters' };
  }

  const ownerCode = cleaned.slice(0, 4);
  const serialNumber = cleaned.slice(4, 10);
  const checkDigit = cleaned.slice(10);

  if (!/^[A-Z]{4}$/.test(ownerCode)) {
    return { valid: false, error: 'First 4 characters must be letters' };
  }

  if (!/^\d{6}$/.test(serialNumber)) {
    return { valid: false, error: 'Characters 5-10 must be digits' };
  }

  if (!/^\d$/.test(checkDigit)) {
    return { valid: false, error: 'Last character must be a check digit' };
  }

  // ISO 6346 check digit calculation
  const charValues: Record<string, number> = {
    A: 10, B: 12, C: 13, D: 14, E: 15, F: 16, G: 17, H: 18, I: 19, J: 20,
    K: 21, L: 23, M: 24, N: 25, O: 26, P: 27, Q: 28, R: 29, S: 30, T: 31,
    U: 32, V: 34, W: 35, X: 36, Y: 37, Z: 38,
    '0': 0, '1': 1, '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9,
  };

  let sum = 0;
  for (let i = 0; i < 10; i++) {
    const char = cleaned[i];
    const value = charValues[char] || 0;
    sum += value * Math.pow(2, i);
  }

  const calculatedCheckDigit = sum % 11 % 10;

  if (parseInt(checkDigit) !== calculatedCheckDigit) {
    return { valid: false, error: 'Invalid check digit' };
  }

  return { valid: true };
}
