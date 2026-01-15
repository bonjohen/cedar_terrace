export interface ValidationResult {
  isValid: boolean;
  errors: Record<string, string>;
}

export interface FieldValidator {
  required?: boolean;
  minLength?: number;
  maxLength?: number;
  pattern?: RegExp;
  custom?: (value: any) => string | null;
}

export type ValidationRules<T> = {
  [K in keyof T]?: FieldValidator;
};

export function validateForm<T extends Record<string, any>>(
  data: T,
  rules: ValidationRules<T>
): ValidationResult {
  const errors: Record<string, string> = {};

  for (const [field, validator] of Object.entries(rules) as [keyof T, FieldValidator][]) {
    const value = data[field];
    const fieldName = String(field);

    // Required check
    if (validator.required) {
      if (value === null || value === undefined || value === '') {
        errors[fieldName] = `${formatFieldName(fieldName)} is required`;
        continue;
      }
    }

    // Skip further validation if empty and not required
    if (!value && !validator.required) continue;

    // Min length check
    if (validator.minLength && typeof value === 'string') {
      if (value.length < validator.minLength) {
        errors[fieldName] = `${formatFieldName(fieldName)} must be at least ${
          validator.minLength
        } characters`;
        continue;
      }
    }

    // Max length check
    if (validator.maxLength && typeof value === 'string') {
      if (value.length > validator.maxLength) {
        errors[fieldName] = `${formatFieldName(fieldName)} must be at most ${
          validator.maxLength
        } characters`;
        continue;
      }
    }

    // Pattern check
    if (validator.pattern && typeof value === 'string') {
      if (!validator.pattern.test(value)) {
        errors[fieldName] = `${formatFieldName(fieldName)} is invalid`;
        continue;
      }
    }

    // Custom validator
    if (validator.custom) {
      const customError = validator.custom(value);
      if (customError) {
        errors[fieldName] = customError;
      }
    }
  }

  return {
    isValid: Object.keys(errors).length === 0,
    errors,
  };
}

function formatFieldName(field: string): string {
  return field
    .replace(/([A-Z])/g, ' $1')
    .replace(/^./, (str) => str.toUpperCase())
    .trim();
}

// Common validators
export const validators = {
  licensePlate: {
    required: true,
    minLength: 1,
    maxLength: 10,
    pattern: /^[A-Z0-9]+$/,
  },
  issuingState: {
    required: true,
    minLength: 2,
    maxLength: 2,
    pattern: /^[A-Z]{2}$/,
  },
  email: {
    required: true,
    pattern: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
  },
  phone: {
    pattern: /^\+?[\d\s()-]+$/,
  },
  positiveNumber: (fieldName: string) => ({
    required: true,
    custom: (value: any) => {
      const num = Number(value);
      if (isNaN(num) || num <= 0) {
        return `${fieldName} must be a positive number`;
      }
      return null;
    },
  }),
  coordinateX: {
    required: true,
    custom: (value: any) => {
      const num = Number(value);
      if (isNaN(num) || num < 0) {
        return 'X coordinate must be a non-negative number';
      }
      return null;
    },
  },
  coordinateY: {
    required: true,
    custom: (value: any) => {
      const num = Number(value);
      if (isNaN(num) || num < 0) {
        return 'Y coordinate must be a non-negative number';
      }
      return null;
    },
  },
  radius: {
    required: true,
    custom: (value: any) => {
      const num = Number(value);
      if (isNaN(num) || num <= 0) {
        return 'Radius must be a positive number';
      }
      return null;
    },
  },
};

// Helper to get field error
export function getFieldError(
  errors: Record<string, string>,
  field: string
): string | undefined {
  return errors[field];
}

// Helper to check if field has error
export function hasFieldError(
  errors: Record<string, string>,
  field: string
): boolean {
  return !!errors[field];
}
