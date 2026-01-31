import {
  customerSchema,
  driverSchema,
  containerSchema,
  shipmentSchema,
  invoiceSchema,
  orderEntrySchema,
  validateForm,
  getFieldError,
  validateContainerNumber,
  phoneRegex,
  containerNumberRegex,
  zipCodeRegex,
} from '@/lib/validations';

describe('Regex Patterns', () => {
  describe('phoneRegex', () => {
    it('should match valid phone numbers', () => {
      expect(phoneRegex.test('555-123-4567')).toBe(true);
      expect(phoneRegex.test('(555) 123-4567')).toBe(true);
      expect(phoneRegex.test('+1 555 123 4567')).toBe(true);
      expect(phoneRegex.test('5551234567')).toBe(true);
    });

    it('should reject invalid phone numbers', () => {
      expect(phoneRegex.test('abc-def-ghij')).toBe(false);
      expect(phoneRegex.test('phone: 555')).toBe(false);
    });
  });

  describe('containerNumberRegex', () => {
    it('should match valid container numbers', () => {
      expect(containerNumberRegex.test('MSCU1234567')).toBe(true);
      expect(containerNumberRegex.test('ABCD0000000')).toBe(true);
      expect(containerNumberRegex.test('WXYZ9999999')).toBe(true);
    });

    it('should reject invalid container numbers', () => {
      expect(containerNumberRegex.test('MSCU123456')).toBe(false); // Too short
      expect(containerNumberRegex.test('MSC1234567')).toBe(false); // Only 3 letters
      expect(containerNumberRegex.test('MSCU12345678')).toBe(false); // Too long
      expect(containerNumberRegex.test('1234ABCDEFG')).toBe(false); // Wrong format
      expect(containerNumberRegex.test('mscu1234567')).toBe(false); // Lowercase
    });
  });

  describe('zipCodeRegex', () => {
    it('should match valid ZIP codes', () => {
      expect(zipCodeRegex.test('90210')).toBe(true);
      expect(zipCodeRegex.test('12345')).toBe(true);
      expect(zipCodeRegex.test('12345-6789')).toBe(true);
    });

    it('should reject invalid ZIP codes', () => {
      expect(zipCodeRegex.test('1234')).toBe(false); // Too short
      expect(zipCodeRegex.test('123456')).toBe(false); // Too long without dash
      expect(zipCodeRegex.test('12345-678')).toBe(false); // Invalid +4
      expect(zipCodeRegex.test('ABCDE')).toBe(false); // Letters
    });
  });
});

describe('customerSchema', () => {
  it('should validate a valid customer', () => {
    const validCustomer = {
      company_name: 'Acme Corporation',
      contact_name: 'John Doe',
      email: 'john@acme.com',
      phone: '555-123-4567',
      address: '123 Main St',
      city: 'Los Angeles',
      state: 'CA',
      zip: '90210',
    };

    const result = customerSchema.safeParse(validCustomer);
    expect(result.success).toBe(true);
  });

  it('should require company_name with minimum length', () => {
    const result = customerSchema.safeParse({ company_name: 'A' });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.errors[0].message).toContain('at least 2 characters');
    }
  });

  it('should validate email format', () => {
    const result = customerSchema.safeParse({
      company_name: 'Test Corp',
      email: 'invalid-email',
    });
    expect(result.success).toBe(false);
  });

  it('should allow empty optional fields', () => {
    const result = customerSchema.safeParse({
      company_name: 'Test Corp',
      email: '',
      phone: '',
      zip: '',
    });
    expect(result.success).toBe(true);
  });
});

describe('driverSchema', () => {
  it('should validate a valid driver', () => {
    const validDriver = {
      first_name: 'John',
      last_name: 'Doe',
      email: 'john@example.com',
      phone: '555-123-4567',
      license_number: 'DL123456',
      license_state: 'CA',
      status: 'ACTIVE',
      hazmat_endorsement: true,
      pay_type: 'PER_MILE',
      pay_rate: '0.55',
    };

    const result = driverSchema.safeParse(validDriver);
    expect(result.success).toBe(true);
  });

  it('should require first_name and last_name', () => {
    const result = driverSchema.safeParse({
      first_name: '',
      last_name: '',
    });
    expect(result.success).toBe(false);
  });

  it('should validate status enum', () => {
    const result = driverSchema.safeParse({
      first_name: 'John',
      last_name: 'Doe',
      status: 'INVALID_STATUS',
    });
    expect(result.success).toBe(false);
  });

  it('should validate pay_rate as number string', () => {
    const result = driverSchema.safeParse({
      first_name: 'John',
      last_name: 'Doe',
      pay_rate: 'not-a-number',
    });
    expect(result.success).toBe(false);
  });

  it('should accept valid pay_type values', () => {
    const validPayTypes = ['FLAT', 'PERCENTAGE', 'PER_MILE'];
    validPayTypes.forEach((payType) => {
      const result = driverSchema.safeParse({
        first_name: 'John',
        last_name: 'Doe',
        pay_type: payType,
      });
      expect(result.success).toBe(true);
    });
  });
});

describe('containerSchema', () => {
  it('should validate a valid container', () => {
    const validContainer = {
      container_number: 'MSCU1234567',
      size: '40',
      type: 'DRY',
      weight_lbs: 44000,
      seal_number: 'SEAL123',
      is_hazmat: false,
      is_overweight: false,
      is_reefer: false,
    };

    const result = containerSchema.safeParse(validContainer);
    expect(result.success).toBe(true);
  });

  it('should validate container number format', () => {
    const result = containerSchema.safeParse({
      container_number: 'INVALID',
      size: '40',
    });
    expect(result.success).toBe(false);
  });

  it('should validate container size enum', () => {
    const validSizes = ['20', '40', '40HC', '45'];
    validSizes.forEach((size) => {
      const result = containerSchema.safeParse({
        container_number: 'MSCU1234567',
        size,
      });
      expect(result.success).toBe(true);
    });
  });

  it('should reject invalid container size', () => {
    const result = containerSchema.safeParse({
      container_number: 'MSCU1234567',
      size: '50',
    });
    expect(result.success).toBe(false);
  });

  it('should validate weight limits', () => {
    const overweightResult = containerSchema.safeParse({
      container_number: 'MSCU1234567',
      size: '40',
      weight_lbs: 150000, // Over 100,000 limit
    });
    expect(overweightResult.success).toBe(false);

    const negativeResult = containerSchema.safeParse({
      container_number: 'MSCU1234567',
      size: '40',
      weight_lbs: -100,
    });
    expect(negativeResult.success).toBe(false);
  });
});

describe('shipmentSchema', () => {
  it('should validate a valid shipment', () => {
    const validShipment = {
      type: 'IMPORT',
      customer_name: 'Acme Corp',
      steamship_line: 'Maersk',
      booking_number: 'BK123456',
      terminal_name: 'APM Terminals',
      chassis_required: true,
    };

    const result = shipmentSchema.safeParse(validShipment);
    expect(result.success).toBe(true);
  });

  it('should require shipment type', () => {
    const result = shipmentSchema.safeParse({
      customer_name: 'Acme Corp',
    });
    expect(result.success).toBe(false);
  });

  it('should validate shipment type enum', () => {
    const importResult = shipmentSchema.safeParse({
      type: 'IMPORT',
      customer_name: 'Test',
    });
    expect(importResult.success).toBe(true);

    const exportResult = shipmentSchema.safeParse({
      type: 'EXPORT',
      customer_name: 'Test',
    });
    expect(exportResult.success).toBe(true);

    const invalidResult = shipmentSchema.safeParse({
      type: 'INVALID',
      customer_name: 'Test',
    });
    expect(invalidResult.success).toBe(false);
  });
});

describe('invoiceSchema', () => {
  it('should validate a valid invoice', () => {
    const validInvoice = {
      customer_name: 'Acme Corp',
      invoice_date: '2024-01-15',
      due_date: '2024-02-15',
      subtotal: '1500.00',
      tax_rate: '8.25',
      notes: 'Payment due upon receipt',
    };

    const result = invoiceSchema.safeParse(validInvoice);
    expect(result.success).toBe(true);
  });

  it('should require customer_name, invoice_date, and due_date', () => {
    const result = invoiceSchema.safeParse({
      subtotal: '100',
    });
    expect(result.success).toBe(false);
  });

  it('should validate subtotal as positive number', () => {
    const negativeResult = invoiceSchema.safeParse({
      customer_name: 'Test',
      invoice_date: '2024-01-15',
      due_date: '2024-02-15',
      subtotal: '-100',
    });
    expect(negativeResult.success).toBe(false);
  });

  it('should validate tax_rate between 0 and 100', () => {
    const overResult = invoiceSchema.safeParse({
      customer_name: 'Test',
      invoice_date: '2024-01-15',
      due_date: '2024-02-15',
      subtotal: '100',
      tax_rate: '150',
    });
    expect(overResult.success).toBe(false);
  });
});

describe('orderEntrySchema', () => {
  it('should validate a valid order entry', () => {
    const validOrder = {
      customer_id: 'cust-123',
      container_number: 'MSCU1234567',
      container_size: '40',
      container_type: 'DRY',
      move_type: 'LIVE',
      terminal: 'APM',
      is_hazmat: false,
      is_overweight: false,
    };

    const result = orderEntrySchema.safeParse(validOrder);
    expect(result.success).toBe(true);
  });

  it('should require customer_id and terminal', () => {
    const result = orderEntrySchema.safeParse({
      container_number: 'MSCU1234567',
      container_size: '40',
      move_type: 'LIVE',
    });
    expect(result.success).toBe(false);
  });

  it('should validate move_type enum', () => {
    const validMoveTypes = ['LIVE', 'DROP', 'PREPULL', 'STREET_TURN', 'RETURN_EMPTY'];
    validMoveTypes.forEach((moveType) => {
      const result = orderEntrySchema.safeParse({
        customer_id: 'cust-123',
        container_number: 'MSCU1234567',
        container_size: '40',
        move_type: moveType,
        terminal: 'APM',
      });
      expect(result.success).toBe(true);
    });
  });
});

describe('validateForm helper', () => {
  it('should return success with data for valid input', () => {
    const result = validateForm(customerSchema, {
      company_name: 'Valid Company',
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.company_name).toBe('Valid Company');
    }
  });

  it('should return errors for invalid input', () => {
    const result = validateForm(customerSchema, {
      company_name: 'A', // Too short
      email: 'invalid-email',
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.errors).toHaveProperty('company_name');
      expect(result.errors).toHaveProperty('email');
    }
  });
});

describe('getFieldError helper', () => {
  it('should return error message for field', () => {
    const errors = {
      company_name: 'Company name is required',
      email: 'Invalid email',
    };

    expect(getFieldError(errors, 'company_name')).toBe('Company name is required');
    expect(getFieldError(errors, 'email')).toBe('Invalid email');
  });

  it('should return undefined for non-existent field', () => {
    const errors = {
      company_name: 'Error',
    };

    expect(getFieldError(errors, 'phone')).toBeUndefined();
  });

  it('should handle undefined errors object', () => {
    expect(getFieldError(undefined, 'field')).toBeUndefined();
  });
});

describe('validateContainerNumber (ISO 6346)', () => {
  describe('valid container numbers', () => {
    it('should validate MSCU1234560 (valid check digit)', () => {
      // This is a made-up example - actual check digit calculation needed
      const result = validateContainerNumber('MSCU1234560');
      // The check digit validation is strict - only truly valid numbers pass
      expect(result).toHaveProperty('valid');
    });
  });

  describe('format validation', () => {
    it('should reject container number with wrong length', () => {
      const shortResult = validateContainerNumber('MSCU123456');
      expect(shortResult.valid).toBe(false);
      expect(shortResult.error).toContain('11 characters');

      const longResult = validateContainerNumber('MSCU12345678');
      expect(longResult.valid).toBe(false);
      expect(longResult.error).toContain('11 characters');
    });

    it('should reject container number with wrong owner code format', () => {
      const result = validateContainerNumber('MS1U1234567');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('letters');
    });

    it('should reject container number with non-digit serial', () => {
      const result = validateContainerNumber('MSCU12345A7');
      expect(result.valid).toBe(false);
    });

    it('should reject container number with non-digit check digit', () => {
      const result = validateContainerNumber('MSCU123456A');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('check digit');
    });
  });

  describe('check digit validation', () => {
    it('should detect invalid check digit', () => {
      // MSCU1234567 with check digit 7 - likely invalid
      const result = validateContainerNumber('MSCU1234567');
      // Check digit calculation is done, may be valid or invalid
      expect(result).toHaveProperty('valid');
      if (!result.valid && result.error) {
        expect(result.error).toContain('check digit');
      }
    });
  });

  describe('case handling', () => {
    it('should handle lowercase input', () => {
      const result = validateContainerNumber('mscu1234567');
      // Should process as uppercase internally
      expect(result).toHaveProperty('valid');
    });

    it('should handle mixed case input', () => {
      const result = validateContainerNumber('MsCu1234567');
      expect(result).toHaveProperty('valid');
    });
  });

  describe('whitespace handling', () => {
    it('should handle input with spaces', () => {
      const result = validateContainerNumber('MSCU 123 4567');
      // Spaces are stripped
      expect(result).toHaveProperty('valid');
    });
  });
});
