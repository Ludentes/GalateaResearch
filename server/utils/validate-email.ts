/**
 * Validates email addresses
 * @param email - The email string to validate
 * @returns true if valid, false otherwise
 */
export function validateEmail(email: string): boolean {
  // Check for empty strings
  if (!email || email.trim().length === 0) {
    return false
  }

  // Check for @ symbol
  const atIndex = email.indexOf("@")
  if (atIndex === -1) {
    return false
  }

  // Ensure @ is not at the start or end
  if (atIndex === 0 || atIndex === email.length - 1) {
    return false
  }

  // Extract local and domain parts
  const localPart = email.substring(0, atIndex)
  const domainPart = email.substring(atIndex + 1)

  // Check that local part is not empty
  if (localPart.length === 0) {
    return false
  }

  // Check that domain part exists and contains at least one dot
  if (domainPart.length === 0 || !domainPart.includes(".")) {
    return false
  }

  // Check that domain doesn't start or end with dot
  if (domainPart.startsWith(".") || domainPart.endsWith(".")) {
    return false
  }

  return true
}
