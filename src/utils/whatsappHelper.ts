/**
 * Utility functions for directly opening WhatsApp customer chats
 * without requiring the agent to search for a contact in WhatsApp.
 */

export function formatWhatsAppPhone(
  rawPhone?: string | null,
  fallbackCountryCode: string = '+263'
): string {
  if (!rawPhone) return '';
  const trimmed = rawPhone.trim().toLowerCase();
  if (!trimmed || trimmed === 'n/a' || trimmed === 'walk-in client' || trimmed === 'null' || trimmed === 'undefined') {
    return '';
  }

  // Remove all non-digits
  let digits = rawPhone.replace(/\D/g, '');
  if (!digits) return '';

  // Extract clean digits for fallback country code (default to 263 for Zimbabwe)
  const cleanCountryDigits = fallbackCountryCode.replace(/\D/g, '') || '263';

  // If dial string starts with 00 (e.g. 00263...), strip the leading 00
  if (digits.startsWith('00')) {
    digits = digits.slice(2);
  }

  // If it starts with 0 (e.g. local Zimbabwe format 0773024268, 071..., 078..., 024...),
  // strip leading 0s and prepend the country code:
  if (digits.startsWith('0')) {
    const withoutLeadingZeroes = digits.replace(/^0+/, '');
    return `${cleanCountryDigits}${withoutLeadingZeroes}`;
  }

  // If already starts with the country digits (e.g. 263773024268)
  if (digits.startsWith(cleanCountryDigits)) {
    return digits;
  }

  // If it's a 8 to 10 digit number lacking country code (e.g. 773024268), prefix country code
  if (digits.length >= 8 && digits.length <= 10) {
    return `${cleanCountryDigits}${digits}`;
  }

  // Otherwise, if already formatted with another international country code (e.g. 27..., 260..., 1...)
  if (digits.length >= 10 && digits.length <= 15) {
    return digits;
  }

  return digits;
}

export function getWhatsAppShareUrl(
  phone: string | null | undefined,
  text: string,
  fallbackCountryCode: string = '+263'
): { url: string; isDirect: boolean; formattedPhone: string } {
  const formattedPhone = formatWhatsAppPhone(phone, fallbackCountryCode);
  const encodedText = encodeURIComponent(text);

  if (formattedPhone && formattedPhone.length >= 8) {
    // Official WhatsApp deep-link format that directly opens the customer number's chat
    return {
      url: `https://wa.me/${formattedPhone}?text=${encodedText}`,
      isDirect: true,
      formattedPhone
    };
  }

  // Fallback to general WhatsApp share if no valid phone number is available
  return {
    url: `https://api.whatsapp.com/send?text=${encodedText}`,
    isDirect: false,
    formattedPhone: ''
  };
}

export function openWhatsAppWithReceipt(options: {
  phone?: string | null;
  text: string;
  fallbackCountryCode?: string;
}): { openedDirect: boolean; formattedPhone: string } {
  const { url, isDirect, formattedPhone } = getWhatsAppShareUrl(
    options.phone,
    options.text,
    options.fallbackCountryCode
  );

  window.open(url, '_blank');
  return { openedDirect: isDirect, formattedPhone };
}
