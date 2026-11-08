/**
 * Password Policy Enforcement Utility
 * Rules: At least 5 characters, including at least one number and one special character.
 */

export const MIN_PASSWORD_LENGTH = 5;

export interface PasswordValidationResult {
  isValid: boolean;
  hasMinLength: boolean;
  hasNumber: boolean;
  hasSpecialChar: boolean;
  error?: string;
}

export const validatePasswordPolicy = (password: string): PasswordValidationResult => {
  const pwd = password || '';
  const hasMinLength = pwd.length >= MIN_PASSWORD_LENGTH;
  const hasNumber = /[0-9]/.test(pwd);
  const hasSpecialChar = /[!@#$%^&*(),.?":{}|<>_\-+=\/\\\[\]~`';]/.test(pwd) || /[^A-Za-z0-9]/.test(pwd);

  const isValid = hasMinLength && hasNumber && hasSpecialChar;

  let error: string | undefined;
  if (!isValid) {
    if (!hasMinLength) {
      error = `Password must be at least ${MIN_PASSWORD_LENGTH} characters long.`;
    } else if (!hasNumber && !hasSpecialChar) {
      error = 'Password must include at least one number and one special character.';
    } else if (!hasNumber) {
      error = 'Password must include at least one number.';
    } else if (!hasSpecialChar) {
      error = 'Password must include at least one special character.';
    }
  }

  return {
    isValid,
    hasMinLength,
    hasNumber,
    hasSpecialChar,
    error: error || (isValid ? undefined : 'Password must be at least 5 characters including a number and a special character.')
  };
};
